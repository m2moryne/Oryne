"""Charge AI agents per request in Flask.

    from flask import Flask, g
    from oryne.merchant.flask import paywall

    app = Flask(__name__)
    pay = paywall(pay_to="G...", facilitator="https://testnet-apiv1.oryne.org/v1/x402")

    @app.get("/search")
    @pay("0.05", "Search results")          # 0.05 USDC per call
    def search():
        settlement = g.oryne_settlement      # the payment: transaction, payer...
        return {"results": [...]}

Put ``@pay(...)`` under the route decorator. Unpaid requests get 402 with what to
pay; paid ones are settled before the view runs, and the receipt goes back in the
``X-PAYMENT-RESPONSE`` header.
"""

from __future__ import annotations

import functools
from typing import Any, Callable

try:
    from flask import g, jsonify, make_response, request
except ImportError as error:  # pragma: no cover - depends on what's installed
    raise ImportError('Flask is not installed: pip install "oryne[flask]"') from error

from . import PAYMENT_HEADER, PAYMENT_RESPONSE_HEADER, Paywall

__all__ = ["paywall"]


def paywall(pay_to: str, facilitator: str, **options: Any) -> Callable[..., Callable[[Callable], Callable]]:
    """Returns ``pay(price, description=None)``, a decorator that charges for a view.

    ``options`` go to :class:`oryne.merchant.Paywall` (``network``, ``asset``, ``http``...).
    """
    core = Paywall(pay_to, facilitator, **options)

    def pay(price: str, description: str | None = None) -> Callable[[Callable], Callable]:
        def decorate(view: Callable) -> Callable:
            @functools.wraps(view)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                result = core.handle(
                    price=price,
                    url=request.url,
                    payment_header=request.headers.get(PAYMENT_HEADER),
                    description=description,
                )
                headers = {PAYMENT_RESPONSE_HEADER: result.receipt} if result.receipt else {}
                if not result.paid:
                    return jsonify(result.body), result.status, headers
                g.oryne_settlement = result.settlement
                response = make_response(view(*args, **kwargs))
                response.headers.update(headers)
                return response

            return wrapper

        return decorate

    return pay
