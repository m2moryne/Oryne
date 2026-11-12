"""An agent's connection to Oryne.

Give it the agent's secret key (S…, shown once when the owner connects the
agent) and use ``agent.fetch()`` wherever you'd make an HTTP request: when a
service answers 402 Payment Required, it pays from the agent's wallet, inside
its mandate, and retries.
"""

from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal, TypedDict
from urllib.parse import urljoin

import httpx
from stellar_sdk import Keypair, SorobanServer

from .guard import BeforePay, PayeeRule, PaymentCheck, hook_refusal, payee_refusal
from .payment import (
    PAYMENT_HEADER,
    PAYMENT_RESPONSE_HEADER,
    PaymentRequirements,
    SettleResponse,
    decode_header,
    encode_header,
    sign_payment,
)
from .units import from_base_units, to_base_units

#: The hosted Oryne API, on Stellar testnet.
DEFAULT_API_URL = "https://testnet-apiv1.oryne.org"

#: How long directory lookups are reused, in seconds.
DIRECTORY_TTL = 5 * 60

#: Who refused: ``"wallet"`` is the contract (or the service failing to settle),
#: after the agent signed; ``"client"`` is this SDK, before anything was signed.
RefusalSource = Literal["wallet", "client"]


class PaymentRefusedError(Exception):
    """A payment wasn't made. ``reason`` says why, ``source`` says who refused."""

    def __init__(self, reason: str, requirements: PaymentRequirements, source: RefusalSource = "wallet") -> None:
        self.reason = reason
        self.requirements = requirements
        self.source = source
        prefix = "Payment refused by the wallet" if source == "wallet" else "Payment refused before signing"
        super().__init__(f"{prefix}: {reason}")


class OryneAPIError(Exception):
    """The Oryne API answered with an error."""

    def __init__(self, message: str, status: int) -> None:
        self.status = status
        super().__init__(message)


@dataclass(frozen=True)
class PaymentEvent:
    """Passed to ``on_payment``: ``paying``, then ``paid`` or ``refused``."""

    type: Literal["paying", "paid", "refused"]
    #: In token units, e.g. "0.05".
    amount: str
    requirements: PaymentRequirements
    settlement: SettleResponse | None = None
    reason: str | None = None
    source: RefusalSource | None = None


class Approval(TypedDict):
    id: str
    status: Literal["pending", "approved", "declined", "expired", "used"]
    amount: str
    payee: str
    description: str


class OryneAgent:
    """An Oryne agent: an HTTP client that pays 402 Payment Required from the agent's wallet.

    >>> agent = OryneAgent(secret=os.environ["ORYNE_AGENT_SECRET"])
    >>> response = agent.fetch("https://api.example.com/search?q=stellar", max_price="0.10")

    :param secret: The agent's secret key (``S…``).
    :param api_url: Oryne API. Defaults to ``ORYNE_API_URL``, then the hosted testnet API.
    :param max_per_request: Most this client pays for one request, whatever a service asks, e.g. ``"1"``.
    :param payees: Who it may pay: ``"any"`` (default), ``"directory"`` (only services in the
        Oryne directory, at the address listed for that host) or a list of Stellar addresses.
        Checked before signing; the wallet's on-chain mandate still applies on top.
    :param before_pay: Last say before signing. Return ``True`` to pay, or ``False`` or a reason to refuse.
    :param on_payment: Called with a :class:`PaymentEvent` as a payment progresses.
    :param http: An ``httpx.Client`` to use, e.g. with your own timeouts or proxies.
    """

    def __init__(
        self,
        secret: str,
        *,
        api_url: str | None = None,
        max_per_request: str | None = None,
        payees: PayeeRule = "any",
        before_pay: BeforePay | None = None,
        on_payment: Callable[[PaymentEvent], None] | None = None,
        http: httpx.Client | None = None,
    ) -> None:
        self.keypair = Keypair.from_secret(secret)
        self.api_url = (api_url or os.environ.get("ORYNE_API_URL") or DEFAULT_API_URL).rstrip("/")
        self.max_per_request = to_base_units(max_per_request) if max_per_request is not None else None
        self.payees = payees
        self.before_pay = before_pay
        self.on_payment = on_payment
        self._http = http or httpx.Client(follow_redirects=True, timeout=60)
        self._info: dict[str, Any] | None = None
        self._listings: dict[str, tuple[float, list[dict]]] = {}

    @property
    def public_key(self) -> str:
        return self.keypair.public_key

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> OryneAgent:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------ Oryne API

    def api(self, path: str, *, method: str = "GET", body: Any = None) -> Any:
        """Calls the Oryne API as this agent; each request is signed with the agent key."""
        url = f"{self.api_url}/v1/agent{path}"
        pathname = httpx.URL(url).path
        timestamp = int(time.time())
        message = f"oryne-agent\n{method.upper()}\n{pathname}\n{timestamp}".encode()
        signature = base64.b64encode(self.keypair.sign(message)).decode()
        response = self._http.request(
            method,
            url,
            headers={"x-oryne-agent": f"{self.public_key}.{timestamp}.{signature}"},
            json=body,
        )
        try:
            data = response.json()
        except ValueError:
            data = {}
        if response.is_error:
            error = data.get("error") if isinstance(data, dict) else None
            raise OryneAPIError(error or f"Oryne API {response.status_code}", response.status_code)
        return data

    def me(self, refresh: bool = False) -> dict[str, Any]:
        """The agent, its wallet, its limits and what it has left. Cached after the first call."""
        if self._info is None or refresh:
            self._info = self.api("")
        return self._info

    def directory(self, origin: str) -> list[dict]:
        """The Oryne directory's listings for an origin. Cached for a few minutes; failures aren't cached."""
        cached = self._listings.get(origin)
        if cached and time.monotonic() - cached[0] < DIRECTORY_TTL:
            return cached[1]
        host = origin.split("://", 1)[1]
        response = self._http.get(f"{self.api_url}/v1/services", params={"host": host})
        if response.is_error:
            raise OryneAPIError(f"directory answered {response.status_code}", response.status_code)
        listings = response.json().get("services") or []
        self._listings[origin] = (time.monotonic(), listings)
        return listings

    # ------------------------------------------------------------ paying

    def fetch(self, url: str, method: str = "GET", *, max_price: str | None = None, **kwargs: Any) -> httpx.Response:
        """Makes an HTTP request, paying a 402 Payment Required from the agent's wallet.

        Takes the same keyword arguments as ``httpx.Client.request`` (``params``,
        ``json``, ``headers``, ``content``…), plus ``max_price``: refuse to pay more
        than this for this request, in token units, e.g. ``"0.10"``.

        Raises :class:`PaymentRefusedError` when the payment isn't made.
        """
        first = self._http.request(method, url, **kwargs)
        if first.status_code != 402:
            return first

        try:
            challenge = first.json()
        except ValueError:
            return first
        info = self.me()
        requirements: PaymentRequirements | None = next(
            (
                option
                for option in (challenge or {}).get("accepts") or []
                if option.get("scheme") == "exact"
                and option.get("network") == info["network"]
                and option.get("asset") == info["token"]
            ),
            None,
        )
        if requirements is None:
            return first

        amount = int(requirements["maxAmountRequired"])
        display = from_base_units(amount)
        refusal = self._refusal(str(first.url), requirements, amount, display, max_price)
        if refusal:
            self._emit(PaymentEvent("refused", display, requirements, reason=refusal, source="client"))
            raise PaymentRefusedError(refusal, requirements, "client")

        self._emit(PaymentEvent("paying", display, requirements))
        payload = sign_payment(
            rpc_server=SorobanServer(info["rpcUrl"]),
            network_passphrase=info["networkPassphrase"],
            agent=self.keypair,
            wallet=info["agent"]["wallet"],
            requirements=requirements,
            simulation_source=info["simulationSource"],
        )

        headers = dict(kwargs.pop("headers", None) or {})
        headers[PAYMENT_HEADER] = encode_header(payload)
        paid = self._http.request(method, url, headers=headers, **kwargs)

        receipt = paid.headers.get(PAYMENT_RESPONSE_HEADER)
        settlement: SettleResponse | None = decode_header(receipt) if receipt else None
        if paid.status_code == 402:
            try:
                body = paid.json()
            except ValueError:
                body = {}
            reason = (settlement or {}).get("errorReason") or (body or {}).get("error") or "Payment was not accepted"
            self._emit(PaymentEvent("refused", display, requirements, settlement, reason, "wallet"))
            raise PaymentRefusedError(reason, requirements, "wallet")
        if settlement:
            self._emit(PaymentEvent("paid", display, requirements, settlement))
        return paid

    def _refusal(
        self,
        url: str,
        requirements: PaymentRequirements,
        amount: int,
        display: str,
        max_price: str | None,
    ) -> str | None:
        """Why this agent shouldn't sign the payment, or ``None`` if it may."""
        if amount <= 0:
            return f"Asks a payment of {display}"
        if self.max_per_request is not None and amount > self.max_per_request:
            return f"Asks {display}, above this client's max_per_request of {from_base_units(self.max_per_request)}"
        if max_price is not None and amount > to_base_units(max_price):
            return f"Asks {display}, above the {max_price} expected for this request"
        payee = payee_refusal(self.payees, url, requirements["payTo"], self.directory)
        if payee:
            return payee
        return hook_refusal(self.before_pay, PaymentCheck(url, requirements, display))

    def _emit(self, event: PaymentEvent) -> None:
        if self.on_payment:
            self.on_payment(event)

    # ------------------------------------------------------------ approvals

    def request_approval(
        self,
        *,
        pay_to: str,
        amount: str,
        description: str,
        resource: str | None = None,
        reason: str | None = None,
    ) -> Approval:
        """Asks the owner to approve a payment the mandate refused. Returns the pending approval."""
        body = {"payTo": pay_to, "amount": amount, "description": description}
        if resource:
            body["resource"] = resource
        if reason:
            body["reason"] = reason
        return self.api("/approvals", method="POST", body=body)

    def approval(self, approval_id: str) -> Approval:
        return self.api(f"/approvals/{approval_id}")

    def wait_for_approval(self, approval_id: str, *, timeout: float = 600, interval: float = 3) -> Approval:
        """Polls until the owner decides, or ``timeout`` seconds pass."""
        deadline = time.monotonic() + timeout
        while True:
            approval = self.approval(approval_id)
            if approval["status"] != "pending" or time.monotonic() > deadline:
                return approval
            time.sleep(interval)
