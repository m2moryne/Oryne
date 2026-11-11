"""Checks the agent makes before it signs a payment.

The wallet contract is the hard limit: it refuses anything outside the
mandate, whatever the agent signs. These checks sit in front of it and decide
whether the agent should agree to a 402 at all, for example because the
service asks to be paid at an address that isn't the one it's listed with.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Union
from urllib.parse import urlsplit

from .payment import PaymentRequirements

#: Who the agent may pay:
#:
#: - ``"any"``: whoever the service names (the wallet's on-chain payee list still applies);
#: - ``"directory"``: only services listed in the Oryne directory, and only at
#:   the address their listing gives for that host;
#: - a list of Stellar addresses: only those.
PayeeRule = Union[Literal["any", "directory"], "list[str]"]


@dataclass(frozen=True)
class PaymentCheck:
    """A payment the agent is about to sign."""

    #: The URL that answered 402, after any redirects.
    url: str
    requirements: PaymentRequirements
    #: The amount in token units, e.g. "0.05".
    amount: str


#: Return ``True`` to pay, or ``False`` or a reason to refuse.
BeforePay = Callable[[PaymentCheck], Union[bool, str]]

#: Looks up the directory listings (dicts with ``url`` and ``payTo``) for an origin.
DirectoryLookup = Callable[[str], "list[dict]"]


def origin_of(url: str) -> str | None:
    """``https://api.example.com:8443/x?y`` -> ``https://api.example.com:8443``, like ``URL.origin``."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if not parts.scheme or not parts.hostname:
        return None
    default_port = {"http": 80, "https": 443}.get(parts.scheme)
    try:
        port = parts.port
    except ValueError:
        return None
    host = parts.hostname
    if ":" in host:
        host = f"[{host}]"
    suffix = f":{port}" if port is not None and port != default_port else ""
    return f"{parts.scheme}://{host}{suffix}"


def host_of(origin: str) -> str:
    return origin.split("://", 1)[1]


def _short(address: str) -> str:
    return f"{address[:4]}…{address[-4:]}"


def payee_refusal(rule: PayeeRule, url: str, pay_to: str, directory: DirectoryLookup) -> str | None:
    """Why the agent should not pay ``pay_to`` for ``url`` under ``rule``, or ``None`` if it may."""
    if rule == "any":
        return None
    if not isinstance(rule, str):
        return None if pay_to in rule else f"Payee {_short(pay_to)} is not in this agent's allowed payees"
    if rule != "directory":
        raise ValueError(f"Unknown payee rule: {rule!r}")

    origin = origin_of(url)
    if not origin:
        return f"Can't tell which service {url} is"
    try:
        listings = [listing for listing in directory(origin) if origin_of(str(listing.get("url", ""))) == origin]
    except Exception as error:  # noqa: BLE001 - any lookup failure refuses the payment
        return f"Could not check the Oryne directory: {error}"
    host = host_of(origin)
    if not listings:
        return f"{host} is not listed in the Oryne directory"
    if any(listing.get("payTo") == pay_to for listing in listings):
        return None
    listed = ", ".join(dict.fromkeys(_short(str(listing.get("payTo", ""))) for listing in listings))
    return f"{host} asks to be paid at {_short(pay_to)}, but its directory listing pays {listed}"


def hook_refusal(hook: BeforePay | None, payment: PaymentCheck) -> str | None:
    """Runs a ``before_pay`` hook and turns its answer into a refusal reason, or ``None`` to pay."""
    if hook is None:
        return None
    answer = hook(payment)
    if answer is True:
        return None
    return answer if isinstance(answer, str) and answer else "Refused by before_pay"


def parse_payee_rule(value: str | None) -> PayeeRule | None:
    """Reads a payee rule from text, as in an environment variable: "any", "directory" or "G…,G…"."""
    text = (value or "").strip()
    if not text:
        return None
    if text in ("any", "directory"):
        return text  # type: ignore[return-value]
    return [address.strip() for address in text.split(",") if address.strip()]
