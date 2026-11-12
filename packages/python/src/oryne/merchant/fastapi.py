"""Charge AI agents per request in FastAPI.

    from fastapi import FastAPI, Request
    from oryne.merchant.fastapi import paywall

    app = FastAPI()
    pay = paywall(pay_to="G...", facilitator="https://testnet-apiv1.oryne.org/v1/x402")

    @app.get("/search")
    @pay("0.05", "Search results")          # 0.05 USDC per call
    async def search(q: str, request: Request):
        settlement = request.state.oryne_settlement   # the payment: transaction, payer...
        return {"results": [...]}

Put ``@pay(...)`` under the route decorator. Unpaid requests get 402 with what to
pay; paid ones are settled before the handler runs, and the receipt goes back in
the ``X-PAYMENT-RESPONSE`` header. Works with Starlette's routing the same way.
"""

from __future__ import annotations

import functools
import inspect
import typing
from typing import Any, Callable

try:
    from fastapi import Request, Response
    from fastapi.responses import JSONResponse
    from starlette.concurrency import run_in_threadpool
    from starlette.requests import Request as StarletteRequest
    from starlette.responses import Response as StarletteResponse
except ImportError as error:  # pragma: no cover - depends on what's installed
    raise ImportError('FastAPI is not installed: pip install "oryne[fastapi]"') from error

from . import PAYMENT_HEADER, PAYMENT_RESPONSE_HEADER, AsyncPaywall

__all__ = ["paywall"]

# Extra parameters the wrapper asks FastAPI for; unlikely to clash with a handler's own.
_REQUEST = "oryne_request__"
_RESPONSE = "oryne_response__"


def _parameter_of(parameters: list[inspect.Parameter], kind: type) -> str | None:
    """The name of the parameter annotated with ``kind`` (or a subclass), if there is one."""
    for parameter in parameters:
        if inspect.isclass(parameter.annotation) and issubclass(parameter.annotation, kind):
            return parameter.name
    return None


def paywall(pay_to: str, facilitator: str, **options: Any) -> Callable[..., Callable[[Callable], Callable]]:
    """Returns ``pay(price, description=None)``, a decorator that charges for a route.

    ``options`` go to :class:`oryne.merchant.AsyncPaywall` (``network``, ``asset``, ``http``...).
    """
    core = AsyncPaywall(pay_to, facilitator, **options)

    def pay(price: str, description: str | None = None) -> Callable[[Callable], Callable]:
        def decorate(endpoint: Callable) -> Callable:
            signature = inspect.signature(endpoint)
            # Resolve string annotations (from __future__ import annotations) in the handler's own
            # module: FastAPI would otherwise look them up in this one.
            try:
                hints = typing.get_type_hints(endpoint, include_extras=True)
            except Exception:  # noqa: BLE001
                hints = {}
            parameters = [
                parameter.replace(annotation=hints.get(name, parameter.annotation))
                for name, parameter in signature.parameters.items()
            ]
            # FastAPI hands the Request (and Response) to one parameter each: the handler's own if it
            # has one, else one added here and removed before calling the handler.
            request_name = _parameter_of(parameters, StarletteRequest)
            response_name = _parameter_of(parameters, Response)
            extra = []
            if request_name is None:
                request_name = _REQUEST
                extra.append(inspect.Parameter(_REQUEST, inspect.Parameter.KEYWORD_ONLY, annotation=Request))
            if response_name is None:
                response_name = _RESPONSE
                extra.append(inspect.Parameter(_RESPONSE, inspect.Parameter.KEYWORD_ONLY, annotation=Response))
            # Keyword-only parameters go before **kwargs, if the handler has one.
            at = next((i for i, p in enumerate(parameters) if p.kind is inspect.Parameter.VAR_KEYWORD), len(parameters))
            parameters[at:at] = extra
            is_async = inspect.iscoroutinefunction(endpoint)

            @functools.wraps(endpoint)
            async def wrapper(*args: Any, **kwargs: Any) -> Any:
                request: Request = kwargs.pop(_REQUEST) if request_name == _REQUEST else kwargs[request_name]
                response: Response = kwargs.pop(_RESPONSE) if response_name == _RESPONSE else kwargs[response_name]
                result = await core.handle(
                    price=price,
                    url=str(request.url),
                    payment_header=request.headers.get(PAYMENT_HEADER),
                    description=description,
                )
                headers = {PAYMENT_RESPONSE_HEADER: result.receipt} if result.receipt else {}
                if not result.paid:
                    return JSONResponse(result.body, status_code=result.status, headers=headers)
                request.state.oryne_settlement = result.settlement
                output = await endpoint(*args, **kwargs) if is_async else await run_in_threadpool(endpoint, *args, **kwargs)
                if isinstance(output, StarletteResponse):
                    output.headers.update(headers)
                    return output
                response.headers.update(headers)
                return output

            wrapper.__signature__ = signature.replace(  # type: ignore[attr-defined]
                parameters=parameters, return_annotation=hints.get("return", signature.return_annotation)
            )
            return wrapper

        return decorate

    return pay
