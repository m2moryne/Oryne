"""End to end on Stellar testnet, with real (test) USDC. Skipped unless ORYNE_TESTNET=1.

    ORYNE_TESTNET=1 pytest -m testnet

Creates a fresh owner, wallet and agent through the hosted Oryne API, then:
pays a 0.01 quote → refused over the 1 USDC limit by the wallet contract →
asks for approval while the owner approves → pays the 30 USDC report.

ORYNE_API_URL and MERCHANT_URL override the hosted API and demo merchant.
"""

from __future__ import annotations

import base64
import hashlib
import os
import threading
import time

import httpx
import pytest
from stellar_sdk import Keypair, TransactionEnvelope

from oryne import OryneAgent, PaymentEvent, PaymentRefusedError

pytestmark = [
    pytest.mark.testnet,
    pytest.mark.skipif(os.environ.get("ORYNE_TESTNET") != "1", reason="set ORYNE_TESTNET=1 to run on testnet"),
]

API = os.environ.get("ORYNE_API_URL", "https://testnet-apiv1.oryne.org").rstrip("/")
MERCHANT = os.environ.get("MERCHANT_URL", "https://demo.oryne.org").rstrip("/")


class Owner:
    """A wallet owner signing in with a Stellar account, as with Freighter."""

    def __init__(self) -> None:
        self.keypair = Keypair.random()
        self.http = httpx.Client(timeout=120)
        self.http.get("https://friendbot.stellar.org/", params={"addr": self.keypair.public_key})
        challenge = self.call("/v1/auth/challenge", {"address": self.keypair.public_key})
        # SEP-53: sign sha256("Stellar Signed Message:\n" + message)
        digest = hashlib.sha256(f"Stellar Signed Message:\n{challenge['message']}".encode()).digest()
        signature = base64.b64encode(self.keypair.sign(digest)).decode()
        self.token = self.call("/v1/auth/verify", {"nonce": challenge["nonce"], "signature": signature})["token"]

    def call(self, path: str, body: dict | None = None, method: str | None = None) -> dict:
        headers = {"authorization": f"Bearer {self.token}"} if getattr(self, "token", None) else {}
        response = self.http.request(method or ("POST" if body is not None else "GET"), f"{API}{path}", json=body, headers=headers)
        data = response.json()
        assert response.is_success, f"{path}: {data}"
        return data

    def sign_and_submit(self, intent: dict) -> dict:
        envelope = TransactionEnvelope.from_xdr(intent["xdr"], intent["networkPassphrase"])
        envelope.sign(self.keypair)
        return self.call(f"/v1/intents/{intent['id']}/submit", {"signedXdr": envelope.to_xdr()})


def test_pays_is_refused_over_limit_and_pays_after_approval():
    owner = Owner()
    wallet = owner.call("/v1/wallets", {"name": "Python SDK check"})
    owner.call("/v1/faucet", {"to": wallet["id"], "amount": "50"})
    agent_key = Keypair.random()
    intent = owner.call(
        f"/v1/wallets/{wallet['id']}/agents",
        {"publicKey": agent_key.public_key, "name": "Python agent", "kind": "Research", "perTx": "1", "budget": "5", "windowDays": 30},
    )
    owner.sign_and_submit(intent)

    events: list[PaymentEvent] = []
    with OryneAgent(agent_key.secret, api_url=API, on_payment=events.append) as agent:
        assert agent.me()["agent"]["wallet"] == wallet["id"]

        quote = agent.fetch(f"{MERCHANT}/quote")
        assert quote.status_code == 200, quote.text
        assert events[-1].type == "paid" and events[-1].settlement["transaction"]

        with pytest.raises(PaymentRefusedError) as raised:
            agent.fetch(f"{MERCHANT}/report")
        assert raised.value.source == "wallet"
        assert raised.value.reason == "OverPerTxLimit"

        # The owner approves from "the dashboard" while the agent waits.
        def approve() -> None:
            for _ in range(60):
                pending = [a for a in owner.call("/v1/approvals")["approvals"] if a["status"] == "pending"]
                if pending:
                    owner.sign_and_submit(owner.call(f"/v1/approvals/{pending[0]['id']}/approve", method="POST"))
                    return
                time.sleep(2)

        approver = threading.Thread(target=approve)
        approver.start()
        approval = agent.request_approval(
            pay_to=raised.value.requirements["payTo"],
            amount="30",
            description="Python SDK check: research report",
            resource=raised.value.requirements["resource"],
            reason=raised.value.reason,
        )
        decided = agent.wait_for_approval(approval["id"], timeout=180)
        approver.join()
        assert decided["status"] == "approved"

        report = agent.fetch(f"{MERCHANT}/report")
        assert report.status_code == 200, report.text
        assert events[-1].type == "paid" and events[-1].amount == "30"
