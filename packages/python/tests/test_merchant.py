"""The merchant side (oryne.merchant): 402 challenges, settling, FastAPI and Flask. No network."""

from __future__ import annotations

import httpx
import pytest
from stellar_sdk import Keypair

from oryne.merchant import PAYMENT_HEADER, PAYMENT_RESPONSE_HEADER, Paywall
from oryne.payment import decode_header, encode_header

# At module level, as in an app: with `from __future__ import annotations`, FastAPI resolves
# a handler's annotations from its module.
from fastapi import Request, Response  # noqa: E402

FACILITATOR = "https://api.oryne.test/v1/x402"
TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
PAY_TO = Keypair.random().public_key
GOOD = encode_header({"x402Version": 1, "scheme": "exact", "network": "stellar-testnet", "payload": {"transaction": "good"}})
BAD = encode_header({"x402Version": 1, "scheme": "exact", "network": "stellar-testnet", "payload": {"transaction": "bad"}})


def facilitator(calls: list) -> httpx.MockTransport:
    """The Oryne API: /v1/info, and a facilitator that settles 'good' payments and refuses the rest."""

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.url.path == "/v1/info":
            return httpx.Response(200, json={"network": "stellar-testnet", "token": TOKEN, "tokenDecimals": 7})
        if request.url.path == "/v1/x402/settle":
            import json

            sent = json.loads(request.content)
            assert sent["paymentRequirements"]["payTo"] == PAY_TO
            if sent["paymentPayload"]["payload"]["transaction"] == "good":
                return httpx.Response(200, json={"success": True, "transaction": "abc123", "network": "stellar-testnet", "payer": "CPAYER"})
            return httpx.Response(200, json={"success": False, "errorReason": "OverPerTxLimit"})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


# ------------------------------------------------------------------ core


def test_unpaid_request_gets_a_challenge():
    calls: list = []
    paywall = Paywall(PAY_TO, FACILITATOR, http=httpx.Client(transport=facilitator(calls)))
    result = paywall.handle(price="0.05", url="https://shop.test/search?q=x", payment_header=None, description="Search")
    assert not result.paid and result.status == 402 and result.receipt is None
    assert result.body["x402Version"] == 1
    [required] = result.body["accepts"]
    assert required == {
        "scheme": "exact",
        "network": "stellar-testnet",
        "asset": TOKEN,
        "maxAmountRequired": "500000",
        "payTo": PAY_TO,
        "resource": "https://shop.test/search?q=x",
        "facilitator": FACILITATOR,
        "maxTimeoutSeconds": 60,
        "description": "Search",
    }
    # The network is asked for once, then remembered.
    paywall.handle(price="1", url="https://shop.test/", payment_header=None)
    assert calls.count(("GET", "/v1/info")) == 1


def test_fixed_network_skips_the_info_call():
    calls: list = []
    paywall = Paywall(PAY_TO, FACILITATOR, network="stellar-testnet", asset=TOKEN, http=httpx.Client(transport=facilitator(calls)))
    assert paywall.requirements("2", "https://shop.test/")["maxAmountRequired"] == "20000000"
    assert calls == []


def test_paid_request_is_settled_with_a_receipt():
    paywall = Paywall(PAY_TO, FACILITATOR, http=httpx.Client(transport=facilitator([])))
    result = paywall.handle(price="0.05", url="https://shop.test/", payment_header=GOOD)
    assert result.paid and result.settlement["transaction"] == "abc123"
    assert decode_header(result.receipt)["success"] is True


@pytest.mark.parametrize(("header", "reason"), [(BAD, "OverPerTxLimit"), ("not base64 json", "Malformed X-PAYMENT header")])
def test_refused_payment_gets_a_challenge_saying_why(header, reason):
    paywall = Paywall(PAY_TO, FACILITATOR, http=httpx.Client(transport=facilitator([])))
    result = paywall.handle(price="0.05", url="https://shop.test/", payment_header=header)
    assert not result.paid and result.status == 402
    assert result.body["error"] == reason and result.body["accepts"]
    assert decode_header(result.receipt)["success"] is False


def test_facilitator_down_is_a_402_not_a_crash():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/info":
            return httpx.Response(200, json={"network": "stellar-testnet", "token": TOKEN})
        raise httpx.ConnectError("down")

    paywall = Paywall(PAY_TO, FACILITATOR, http=httpx.Client(transport=httpx.MockTransport(handler)))
    result = paywall.handle(price="0.05", url="https://shop.test/", payment_header=GOOD)
    assert not result.paid and result.body["error"].startswith("Facilitator unreachable")


def test_requires_pay_to_and_facilitator():
    with pytest.raises(ValueError):
        Paywall("", FACILITATOR)


# ------------------------------------------------------------------ FastAPI


def fastapi_app():
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse

    from oryne.merchant.fastapi import paywall

    app = FastAPI()
    pay = paywall(PAY_TO, FACILITATOR, http=httpx.AsyncClient(transport=facilitator([])))

    @app.get("/search")
    @pay("0.05", "Search results")
    async def search(q: str, request: Request):
        return {"q": q, "paid_by": request.state.oryne_settlement["payer"]}

    @app.get("/sync/{item}")
    @pay("1")
    def sync_view(item: int):
        return {"item": item}

    @app.get("/text")
    @pay("0.01")
    async def text():
        return PlainTextResponse("hello")

    @app.get("/own-response")
    @pay("0.01")
    async def own_response(response: Response):
        response.headers["x-cache"] = "hit"
        return {"ok": True}

    @app.get("/free")
    async def free():
        return {"free": True}

    return app


def test_fastapi():
    from fastapi.testclient import TestClient

    client = TestClient(fastapi_app())

    unpaid = client.get("/search", params={"q": "stellar"})
    assert unpaid.status_code == 402
    assert unpaid.json()["accepts"][0]["maxAmountRequired"] == "500000"
    assert unpaid.json()["accepts"][0]["resource"] == "http://testserver/search?q=stellar"

    paid = client.get("/search", params={"q": "stellar"}, headers={PAYMENT_HEADER: GOOD})
    assert paid.status_code == 200 and paid.json() == {"q": "stellar", "paid_by": "CPAYER"}
    assert decode_header(paid.headers[PAYMENT_RESPONSE_HEADER])["transaction"] == "abc123"

    refused = client.get("/search", params={"q": "stellar"}, headers={PAYMENT_HEADER: BAD})
    assert refused.status_code == 402 and refused.json()["error"] == "OverPerTxLimit"
    assert PAYMENT_RESPONSE_HEADER in refused.headers

    # Sync handlers, path parameters, and their validation still work.
    assert client.get("/sync/7", headers={PAYMENT_HEADER: GOOD}).json() == {"item": 7}
    assert client.get("/sync/seven", headers={PAYMENT_HEADER: GOOD}).status_code == 422

    # A handler returning its own Response gets the receipt too.
    text = client.get("/text", headers={PAYMENT_HEADER: GOOD})
    assert text.text == "hello" and PAYMENT_RESPONSE_HEADER in text.headers

    # The handler's own Response parameter keeps working and gets the receipt.
    own = client.get("/own-response", headers={PAYMENT_HEADER: GOOD})
    assert own.json() == {"ok": True} and own.headers["x-cache"] == "hit" and PAYMENT_RESPONSE_HEADER in own.headers

    assert client.get("/free").json() == {"free": True}


def test_fastapi_openapi_shows_only_the_handlers_own_parameters():
    schema = fastapi_app().openapi()
    names = [parameter["name"] for parameter in schema["paths"]["/search"]["get"]["parameters"]]
    assert names == ["q"]


# ------------------------------------------------------------------ Flask


def test_flask():
    from flask import Flask, g

    from oryne.merchant.flask import paywall

    app = Flask(__name__)
    pay = paywall(PAY_TO, FACILITATOR, http=httpx.Client(transport=facilitator([])))

    @app.get("/search")
    @pay("0.05", "Search results")
    def search():
        return {"paid_by": g.oryne_settlement["payer"]}

    @app.get("/text/<name>")
    @pay("0.01")
    def text(name: str):
        return f"hello {name}", 201

    client = app.test_client()

    unpaid = client.get("/search?q=x")
    assert unpaid.status_code == 402
    assert unpaid.get_json()["accepts"][0]["resource"] == "http://localhost/search?q=x"

    paid = client.get("/search", headers={PAYMENT_HEADER: GOOD})
    assert paid.status_code == 200 and paid.get_json() == {"paid_by": "CPAYER"}
    assert decode_header(paid.headers[PAYMENT_RESPONSE_HEADER])["transaction"] == "abc123"

    refused = client.get("/search", headers={PAYMENT_HEADER: BAD})
    assert refused.status_code == 402 and refused.get_json()["error"] == "OverPerTxLimit"

    text_response = client.get("/text/ada", headers={PAYMENT_HEADER: GOOD})
    assert text_response.status_code == 201 and text_response.text == "hello ada"
    assert PAYMENT_RESPONSE_HEADER in text_response.headers
