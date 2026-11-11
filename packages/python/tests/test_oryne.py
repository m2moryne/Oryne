"""Unit tests. No network: HTTP goes through httpx.MockTransport.

The fixtures marked "from TypeScript" were produced by @oryne/core, so these
tests fail if the Python SDK ever signs or encodes differently.
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest
from stellar_sdk import Keypair

from oryne import (
    OryneAgent,
    PaymentEvent,
    PaymentRefusedError,
    agent_signature_scval,
    contract_error_name,
    from_base_units,
    parse_payee_rule,
    payee_refusal,
    to_base_units,
)
from oryne.guard import origin_of

# From TypeScript: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)) and agentSignatureScVal(...)
TS_SECRET = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X"
TS_PUBLIC = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57"
TS_AUTH_SIGNATURE = "4sYtnysL794cn8BRqZjjqO9V8YkblctBdlpw2rxukLk9/QB3gfoIMYIYAVDhMvju/fBQWjZK5vsHj+eKPUhHCw=="
TS_AGENT_SIGNATURE_SCVAL = (
    "AAAAEAAAAAEAAAACAAAADwAAAAVBZ2VudAAAAAAAABEAAAABAAAAAgAAAA8AAAAKcHVibGljX2tleQAAAAAADQAAACDqSmxj4pxSCr71UH"
    "sTLsX5lUd2rr6+e5JCHuppFEbSLAAAAA8AAAAJc2lnbmF0dXJlAAAAAAAADQAAAEAJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ"
    "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ"
)

MERCHANT = Keypair.random().public_key
ATTACKER = Keypair.random().public_key
TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
API = "https://api.oryne.test"


# ---------------------------------------------------------------- matches TypeScript


def test_agent_signature_encodes_exactly_like_typescript():
    keypair = Keypair.from_secret(TS_SECRET)
    assert keypair.public_key == TS_PUBLIC
    scval = agent_signature_scval(keypair.raw_public_key(), bytes([9] * 64))
    assert scval.to_xdr() == TS_AGENT_SIGNATURE_SCVAL


def test_api_request_signature_matches_typescript():
    keypair = Keypair.from_secret(TS_SECRET)
    signature = keypair.sign(b"oryne-agent\nGET\n/v1/agent\n1700000000")
    assert base64.b64encode(signature).decode() == TS_AUTH_SIGNATURE


def test_amounts_convert_like_typescript():
    assert to_base_units("0.008") == 80_000
    assert to_base_units("25") == 250_000_000
    assert from_base_units(80_000) == "0.008"
    assert from_base_units(250_000_000) == "25"
    for bad in ("1.12345678", "-1", "abc", ""):
        with pytest.raises(ValueError):
            to_base_units(bad)
    with pytest.raises(TypeError):
        to_base_units(0.1)  # type: ignore[arg-type]


def test_contract_errors_are_named_and_token_errors_are_the_tokens():
    assert contract_error_name("HostError: Error(Contract, #7)") == "OverPerTxLimit"
    assert contract_error_name("something else") is None
    wallet = "CDQMO2CA23BQ7FDQ2N7LVYRPYZ6SCPFABRUOG2WUR5P7Z5KLJAXG7PPW"
    insufficient = "\n".join(
        [
            "HostError: Error(Contract, #10)",
            f"   0: [Diagnostic Event] contract:{TOKEN}, topics:[error, Error(Contract, #10)], data:[\"balance is not sufficient\"]",
            f"   1: [Diagnostic Event] topics:[fn_call, {TOKEN}, transfer], data:[{wallet}, GBVW, 300000000]",
        ]
    )
    assert contract_error_name(insufficient) == "InsufficientBalance"


# ---------------------------------------------------------------- guard


def listing(url: str, pay_to: str) -> dict:
    return {"url": url, "payTo": pay_to}


def test_origin_matches_url_origin():
    assert origin_of("https://api.shop.test/search?q=1") == "https://api.shop.test"
    assert origin_of("https://api.shop.test:443/") == "https://api.shop.test"
    assert origin_of("https://api.shop.test:8443/") == "https://api.shop.test:8443"
    assert origin_of("not a url") is None


def test_payee_rules():
    none = lambda origin: []  # noqa: E731
    assert payee_refusal("any", "https://x.test/a", ATTACKER, none) is None
    assert payee_refusal([MERCHANT], "https://x.test/a", MERCHANT, none) is None
    assert "allowed payees" in payee_refusal([MERCHANT], "https://x.test/a", ATTACKER, none)

    directory = lambda origin: [listing("https://api.shop.test/search", MERCHANT)]  # noqa: E731
    assert payee_refusal("directory", "https://api.shop.test/other", MERCHANT, directory) is None
    assert "directory listing pays" in payee_refusal("directory", "https://api.shop.test/x", ATTACKER, directory)
    assert "not listed" in payee_refusal("directory", "https://evil.test/x", MERCHANT, directory)
    assert "not listed" in payee_refusal("directory", "http://api.shop.test/x", MERCHANT, directory)


def test_directory_rule_fails_closed():
    def down(origin: str) -> list:
        raise RuntimeError("offline")

    assert "Could not check" in payee_refusal("directory", "https://api.shop.test/", MERCHANT, down)


def test_payee_rule_parses_from_text():
    assert parse_payee_rule(None) is None
    assert parse_payee_rule(" directory ") == "directory"
    assert parse_payee_rule(f"{MERCHANT}, {ATTACKER}") == [MERCHANT, ATTACKER]


# ---------------------------------------------------------------- fetch()


def network(pay_to: str, price: str, listings: list | None = None, calls: list | None = None) -> httpx.Client:
    """A fake network: a merchant that answers 402 asking `price` to `pay_to`, and the Oryne API."""

    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request.url.path)
        if request.url.host == "api.oryne.test" and request.url.path == "/v1/agent":
            return httpx.Response(
                200,
                json={
                    "agent": {"publicKey": "G", "wallet": "C", "name": "t", "status": "active", "perTx": "1", "budget": "10"},
                    "network": "stellar-testnet",
                    "rpcUrl": "https://rpc.invalid",
                    "networkPassphrase": "Test SDF Network ; September 2015",
                    "token": TOKEN,
                    "simulationSource": MERCHANT,
                    "walletBalance": "10",
                },
            )
        if request.url.host == "api.oryne.test" and request.url.path == "/v1/services":
            return httpx.Response(200, json={"services": listings or []})
        requirements = {
            "scheme": "exact",
            "network": "stellar-testnet",
            "asset": TOKEN,
            "maxAmountRequired": str(to_base_units(price)),
            "payTo": pay_to,
            "resource": str(request.url),
            "facilitator": f"{API}/v1/x402",
            "maxTimeoutSeconds": 60,
        }
        return httpx.Response(402, json={"x402Version": 1, "accepts": [requirements]})

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


def agent(http: httpx.Client, **options) -> OryneAgent:
    return OryneAgent(Keypair.random().secret, api_url=API, http=http, **options)


def test_api_requests_are_signed():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"ok": True})

    client = agent(httpx.Client(transport=httpx.MockTransport(handler)))
    client.api("/approvals/apr_1")
    public_key, timestamp, signature = seen[0].headers["x-oryne-agent"].split(".")
    assert public_key == client.public_key
    message = f"oryne-agent\nGET\n/v1/agent/approvals/apr_1\n{timestamp}".encode()
    Keypair.from_public_key(public_key).verify(message, base64.b64decode(signature))


def test_fetch_passes_through_responses_that_are_not_402():
    http = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"free": True})))
    assert agent(http).fetch("https://free.test/").json() == {"free": True}


def test_fetch_refuses_above_max_price_before_signing():
    events: list[PaymentEvent] = []
    client = agent(network(MERCHANT, "0.50"), on_payment=events.append)
    with pytest.raises(PaymentRefusedError) as raised:
        client.fetch("https://api.shop.test/search", max_price="0.10")
    assert raised.value.source == "client"
    assert "above the 0.10 expected" in raised.value.reason
    assert [event.type for event in events] == ["refused"]


def test_fetch_refuses_above_max_per_request():
    client = agent(network(MERCHANT, "2"), max_per_request="1")
    with pytest.raises(PaymentRefusedError, match="max_per_request of 1"):
        client.fetch("https://api.shop.test/search")


def test_fetch_refuses_a_payee_that_does_not_match_the_directory():
    http = network(ATTACKER, "0.05", [listing("https://api.shop.test/search", MERCHANT)])
    with pytest.raises(PaymentRefusedError) as raised:
        agent(http, payees="directory").fetch("https://api.shop.test/search")
    assert raised.value.source == "client"
    assert "directory listing pays" in raised.value.reason


def test_before_pay_can_refuse_with_a_reason():
    seen = []

    def before_pay(payment):
        seen.append((payment.url, payment.amount))
        return "not this one"

    with pytest.raises(PaymentRefusedError, match="not this one"):
        agent(network(MERCHANT, "0.05"), before_pay=before_pay).fetch("https://api.shop.test/search")
    assert seen == [("https://api.shop.test/search", "0.05")]


def test_directory_lookups_are_cached_per_origin():
    calls: list[str] = []
    client = agent(network(ATTACKER, "0.05", [listing("https://api.shop.test/", MERCHANT)], calls), payees="directory")
    for path in ("a", "b"):
        with pytest.raises(PaymentRefusedError):
            client.fetch(f"https://api.shop.test/{path}")
    assert calls.count("/v1/services") == 1


def test_wallet_refusal_after_signing_is_reported_as_the_wallets(monkeypatch):
    # Skip the real signing (it needs Stellar RPC); check what fetch does with the answer.
    monkeypatch.setattr("oryne.agent.sign_payment", lambda **kwargs: {"signed": True})
    settlement = base64.b64encode(json.dumps({"success": False, "errorReason": "OverBudget"}).encode()).decode()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.oryne.test":
            return network(MERCHANT, "0.05")._transport.handle_request(request)  # type: ignore[attr-defined]
        if "X-PAYMENT" in request.headers:
            assert json.loads(base64.b64decode(request.headers["X-PAYMENT"])) == {"signed": True}
            return httpx.Response(402, headers={"X-PAYMENT-RESPONSE": settlement}, json={"error": "refused"})
        return network(MERCHANT, "0.05")._transport.handle_request(request)  # type: ignore[attr-defined]

    client = agent(httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(PaymentRefusedError) as raised:
        client.fetch("https://api.shop.test/search")
    assert raised.value.source == "wallet"
    assert raised.value.reason == "OverBudget"
