"""Charge AI agents per request, from Python.

Unpaid requests get ``402 Payment Required`` with what to pay; paid ones are
settled through the Oryne facilitator (in about 5 seconds, final, no
chargebacks) before your handler runs. Any x402 client can pay, not only
Oryne agents.

With FastAPI (``pip install "oryne[fastapi]"``)::

    from oryne.merchant.fastapi import paywall

    pay = paywall(pay_to="G...", facilitator="https://testnet-apiv1.oryne.org/v1/x402")

    @app.get("/search")
    @pay("0.05", "Search results")
    async def search(q: str): ...

With Flask (``pip install "oryne[flask]"``), the same with ``oryne.merchant.flask``.
For anything else, :class:`Paywall` decides what a request owes and whether it
has paid; :class:`AsyncPaywall` does the same with ``async``.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

import httpx

from ..payment import (
    PAYMENT_HEADER,
    PAYMENT_RESPONSE_HEADER,
    SCHEME,
    PaymentRequirements,
    SettleResponse,
    decode_header,
    encode_header,
)
from ..units import to_base_units

X402_VERSION = 1

__all__ = [
    "PAYMENT_HEADER",
    "PAYMENT_RESPONSE_HEADER",
    "AsyncPaywall",
    "Paywall",
    "PaywallResult",
]


@dataclass(frozen=True)
class PaywallResult:
    """What to do with a request.

    ``paid``: let it through. Otherwise answer ``status`` (402) with ``body``.
    Either way, send ``receipt`` (when set) as the ``X-PAYMENT-RESPONSE`` header.
    """

    paid: bool
    status: int = 200
    body: dict[str, Any] | None = None
    receipt: str | None = None
    settlement: SettleResponse | None = None


@dataclass(frozen=True)
class _Network:
    network: str
    asset: str
    decimals: int


class _PaywallBase:
    def __init__(
        self,
        pay_to: str,
        facilitator: str,
        *,
        network: str | None = None,
        asset: str | None = None,
        decimals: int | None = None,
    ) -> None:
        """
        :param pay_to: Your Stellar address. A ``G...`` account needs a trustline to the token.
        :param facilitator: The Oryne facilitator, e.g. ``https://testnet-apiv1.oryne.org/v1/x402``.
        :param network: With ``asset``, skips asking the facilitator's API which network and token it uses.
        """
        if not pay_to or not facilitator:
            raise ValueError("pay_to and facilitator are required")
        self.pay_to = pay_to
        self.facilitator = facilitator.rstrip("/")
        self._fixed = _Network(network, asset, decimals or 7) if network and asset else None
        self._resolved: _Network | None = self._fixed

    @property
    def _info_url(self) -> str:
        parsed = httpx.URL(self.facilitator)
        return str(parsed.copy_with(path="/v1/info", query=None))

    def _network_from(self, info: dict[str, Any]) -> _Network:
        return _Network(info["network"], info["token"], int(info.get("tokenDecimals", 7)))

    def requirements_for(self, net: _Network, price: str, resource: str, description: str | None) -> PaymentRequirements:
        required: PaymentRequirements = {
            "scheme": SCHEME,
            "network": net.network,
            "asset": net.asset,
            "maxAmountRequired": str(to_base_units(price, net.decimals)),
            "payTo": self.pay_to,
            "resource": resource,
            "facilitator": self.facilitator,
            "maxTimeoutSeconds": 60,
        }
        if description:
            required["description"] = description
        return required

    @staticmethod
    def _challenge(required: PaymentRequirements, error: str) -> dict[str, Any]:
        return {"x402Version": X402_VERSION, "error": error, "accepts": [required]}


class Paywall(_PaywallBase):
    """Decides what a request owes and whether it has paid, for any sync framework.

    >>> paywall = Paywall(pay_to="G...", facilitator="https://testnet-apiv1.oryne.org/v1/x402")
    >>> result = paywall.handle(price="0.05", url=request_url, payment_header=request.headers.get("X-PAYMENT"))
    >>> if not result.paid: return 402 with result.body (and result.receipt as X-PAYMENT-RESPONSE)
    """

    def __init__(self, pay_to: str, facilitator: str, *, http: httpx.Client | None = None, **options: Any) -> None:
        super().__init__(pay_to, facilitator, **options)
        self._http = http or httpx.Client(timeout=60)
        self._lock = threading.Lock()

    def _network(self) -> _Network:
        if self._resolved:
            return self._resolved
        with self._lock:
            if not self._resolved:
                # Asked again after a failure: a facilitator that was briefly down shouldn't fail forever.
                response = self._http.get(self._info_url)
                response.raise_for_status()
                self._resolved = self._network_from(response.json())
        return self._resolved

    def requirements(self, price: str, resource: str, description: str | None = None) -> PaymentRequirements:
        """The payment a request to ``resource`` must make, as in a 402's ``accepts``."""
        return self.requirements_for(self._network(), price, resource, description)

    def settle(self, payment_header: str, required: PaymentRequirements) -> SettleResponse:
        """Settles a payment through the facilitator. Never raises for a bad payment; says why instead."""
        try:
            payload = decode_header(payment_header)
        except Exception:  # noqa: BLE001
            return {"success": False, "errorReason": "Malformed X-PAYMENT header"}
        try:
            response = self._http.post(
                f"{self.facilitator}/settle", json={"paymentPayload": payload, "paymentRequirements": required}
            )
        except httpx.HTTPError as error:
            return {"success": False, "errorReason": f"Facilitator unreachable: {error}"}
        if response.status_code >= 400:
            return {"success": False, "errorReason": f"Facilitator {response.status_code}"}
        return response.json()

    def handle(self, *, price: str, url: str, payment_header: str | None, description: str | None = None) -> PaywallResult:
        """Handles one request: a 402 with what to pay, or paid (settled) and let through."""
        required = self.requirements(price, url, description)
        if not payment_header:
            return PaywallResult(False, 402, self._challenge(required, "Payment required"))
        settlement = self.settle(payment_header, required)
        receipt = encode_header(settlement)
        if not settlement.get("success"):
            reason = settlement.get("errorReason") or "Payment was not accepted"
            return PaywallResult(False, 402, self._challenge(required, reason), receipt, settlement)
        return PaywallResult(True, 200, None, receipt, settlement)


class AsyncPaywall(_PaywallBase):
    """:class:`Paywall` for async frameworks (FastAPI, Starlette, Quart, aiohttp...)."""

    def __init__(self, pay_to: str, facilitator: str, *, http: httpx.AsyncClient | None = None, **options: Any) -> None:
        super().__init__(pay_to, facilitator, **options)
        self._http = http or httpx.AsyncClient(timeout=60)

    async def _network(self) -> _Network:
        if not self._resolved:
            response = await self._http.get(self._info_url)
            response.raise_for_status()
            self._resolved = self._network_from(response.json())
        return self._resolved

    async def requirements(self, price: str, resource: str, description: str | None = None) -> PaymentRequirements:
        return self.requirements_for(await self._network(), price, resource, description)

    async def settle(self, payment_header: str, required: PaymentRequirements) -> SettleResponse:
        try:
            payload = decode_header(payment_header)
        except Exception:  # noqa: BLE001
            return {"success": False, "errorReason": "Malformed X-PAYMENT header"}
        try:
            response = await self._http.post(
                f"{self.facilitator}/settle", json={"paymentPayload": payload, "paymentRequirements": required}
            )
        except httpx.HTTPError as error:
            return {"success": False, "errorReason": f"Facilitator unreachable: {error}"}
        if response.status_code >= 400:
            return {"success": False, "errorReason": f"Facilitator {response.status_code}"}
        return response.json()

    async def handle(
        self, *, price: str, url: str, payment_header: str | None, description: str | None = None
    ) -> PaywallResult:
        required = await self.requirements(price, url, description)
        if not payment_header:
            return PaywallResult(False, 402, self._challenge(required, "Payment required"))
        settlement = await self.settle(payment_header, required)
        receipt = encode_header(settlement)
        if not settlement.get("success"):
            reason = settlement.get("errorReason") or "Payment was not accepted"
            return PaywallResult(False, 402, self._challenge(required, reason), receipt, settlement)
        return PaywallResult(True, 200, None, receipt, settlement)
