"""Token amounts: Stellar assets have 7 decimals, so 1 USDC is 10_000_000 base units."""

from __future__ import annotations

import re

DECIMALS = 7

_AMOUNT = re.compile(r"^\d+(\.\d+)?$")


def to_base_units(amount: str | int, decimals: int = DECIMALS) -> int:
    """``"0.008"`` -> ``80_000``. Rejects anything that isn't a plain positive decimal.

    Floats are refused on purpose: ``0.1 + 0.2`` is not ``0.3``, and money
    should not depend on that. Pass amounts as strings.
    """
    if isinstance(amount, bool) or not isinstance(amount, (str, int)):
        raise TypeError(f"Pass amounts as strings, e.g. '0.05', not {type(amount).__name__}")
    text = str(amount).strip()
    if not _AMOUNT.match(text):
        raise ValueError(f"Invalid amount: {amount!r}")
    whole, _, fraction = text.partition(".")
    if len(fraction) > decimals:
        raise ValueError(f"Too many decimals in {amount!r}")
    return int(whole) * 10**decimals + int(fraction.ljust(decimals, "0") or "0")


def from_base_units(units: int, decimals: int = DECIMALS) -> str:
    """``80_000`` -> ``"0.008"``"""
    sign = "-" if units < 0 else ""
    whole, fraction = divmod(abs(units), 10**decimals)
    fraction_text = str(fraction).rjust(decimals, "0").rstrip("0")
    return f"{sign}{whole}{'.' + fraction_text if fraction_text else ''}"
