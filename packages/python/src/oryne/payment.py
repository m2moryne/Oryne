"""The payment format Oryne speaks, modelled on x402.

1. A service answers ``402 Payment Required`` with payment requirements.
2. The agent signs a Soroban authorization entry for
   ``token.transfer(from = its wallet, to = payTo, amount)`` with its own key,
   and retries with the ``X-PAYMENT`` header.
3. The service hands the payload to a facilitator, which submits the
   transfer. The wallet contract's ``__check_auth`` enforces the mandate.

The agent's key never leaves the agent, and the facilitator can't change the
payee or amount: they are inside what the agent signed.

This mirrors ``@oryne/core`` (TypeScript) byte for byte.
"""

from __future__ import annotations

import base64
import json
import re
from typing import Any, TypedDict

from stellar_sdk import Keypair, SorobanServer, TransactionBuilder, scval
from stellar_sdk import xdr as stellar_xdr
from stellar_sdk.address import Address
from stellar_sdk.auth import authorization_payload_hash, authorize_entry

X402_VERSION = 1
SCHEME = "exact"
PAYMENT_HEADER = "X-PAYMENT"
PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE"

#: How long a signed payment stays valid, in ledgers (about 5 seconds each).
DEFAULT_VALID_FOR_LEDGERS = 24


class PaymentRequirements(TypedDict, total=False):
    scheme: str
    #: "stellar-testnet" or "stellar-mainnet"
    network: str
    #: Token contract ID.
    asset: str
    #: Base units, as a decimal string.
    maxAmountRequired: str
    payTo: str
    resource: str
    description: str
    #: Where the service settles payments.
    facilitator: str
    maxTimeoutSeconds: int


class SettleResponse(TypedDict, total=False):
    success: bool
    #: Transaction hash when settled.
    transaction: str
    ledger: int
    payer: str
    #: Contract error name or another reason when not.
    errorReason: str


# ---------------------------------------------------------------- contract errors

#: The agent-wallet contract's error enum, by number.
CONTRACT_ERRORS = {
    1: "UnknownAgent",
    2: "AgentPaused",
    3: "AgentExpired",
    4: "NotATransfer",
    5: "WrongToken",
    6: "PayeeNotAllowed",
    7: "OverPerTxLimit",
    8: "OverBudget",
    9: "InvalidAmount",
    10: "AgentExists",
    11: "InvalidPolicy",
    12: "NoPasskey",
    13: "InvalidPasskeySignature",
    14: "InvalidExpiry",
    15: "AgentRemoved",
}

#: Errors of the Stellar Asset Contract (the token, e.g. USDC) that a payment can hit.
TOKEN_ERRORS = {
    6: "AccountMissing",
    8: "NegativeAmount",
    10: "InsufficientBalance",
    11: "BalanceDeauthorized",
    12: "Overflow",
    13: "TrustlineMissing",
}


def contract_error_name(message: str) -> str | None:
    """Finds ``Error(Contract, #8)`` in a simulation or submission error and names it.

    The wallet and the token number their errors separately, so when the
    diagnostic log shows the error came from the contract ``transfer`` was
    called on, it's named from the token's errors.
    """
    match = re.search(r"Error\(Contract, #(\d+)\)", message)
    if not match:
        return None
    code = int(match.group(1))
    raised_by = re.search(r"contract:(C[A-Z2-7]{55}), topics:\[error, Error\(Contract, #\d+\)\]", message)
    if raised_by and f"topics:[fn_call, {raised_by.group(1)}, transfer]" in message:
        return TOKEN_ERRORS.get(code, f"TokenError{code}")
    return CONTRACT_ERRORS.get(code, f"ContractError{code}")


class StellarError(Exception):
    """A failure from Stellar, with the contract error named when there is one."""

    def __init__(self, message: str, detail: str) -> None:
        self.contract_error = contract_error_name(detail)
        self.detail = detail
        super().__init__(f"{message}: {self.contract_error or detail[:300]}")


# ---------------------------------------------------------------- encoding


def encode_header(value: Any) -> str:
    return base64.b64encode(json.dumps(value, separators=(",", ":")).encode()).decode()


def decode_header(value: str) -> Any:
    return json.loads(base64.b64decode(value))


def agent_signature_scval(public_key: bytes, signature: bytes) -> stellar_xdr.SCVal:
    """``Signature::Agent``: what an agent attaches to an authorization entry.

    A ``#[contracttype]`` enum variant with one value is ``vec[symbol, value]``,
    and a struct is a map with symbol keys.
    """
    return scval.to_vec(
        [
            scval.to_symbol("Agent"),
            scval.to_map(
                {
                    scval.to_symbol("public_key"): scval.to_bytes(public_key),
                    scval.to_symbol("signature"): scval.to_bytes(signature),
                }
            ),
        ]
    )


def _address_of(entry: stellar_xdr.SorobanAuthorizationEntry) -> str | None:
    credentials = entry.credentials
    kind = stellar_xdr.SorobanCredentialsType
    if credentials.type == kind.SOROBAN_CREDENTIALS_ADDRESS:
        node = credentials.address
    elif credentials.type == kind.SOROBAN_CREDENTIALS_ADDRESS_V2:
        node = credentials.address_v2
    else:
        return None
    return Address.from_xdr_sc_address(node.address).address if node else None


# ---------------------------------------------------------------- signing


def sign_payment(
    *,
    rpc_server: SorobanServer,
    network_passphrase: str,
    agent: Keypair,
    wallet: str,
    requirements: PaymentRequirements,
    simulation_source: str,
    valid_for_ledgers: int = DEFAULT_VALID_FOR_LEDGERS,
) -> dict[str, Any]:
    """Builds the transfer, simulates it to get the authorization entry the
    wallet must sign, and signs it with the agent key.

    ``simulation_source`` is any funded account; it pays for nothing.
    Returns the payment payload to send in the ``X-PAYMENT`` header.
    """
    amount = int(requirements["maxAmountRequired"])
    source = rpc_server.load_account(simulation_source)
    tx = (
        TransactionBuilder(source, network_passphrase, base_fee=100)
        .append_invoke_contract_function_op(
            contract_id=requirements["asset"],
            function_name="transfer",
            parameters=[
                scval.to_address(wallet),
                scval.to_address(requirements["payTo"]),
                scval.to_int128(amount),
            ],
        )
        .set_timeout(120)
        .build()
    )
    sim = rpc_server.simulate_transaction(tx)
    if sim.error:
        raise StellarError("Simulation failed", sim.error)

    entries = [
        stellar_xdr.SorobanAuthorizationEntry.from_xdr(raw)
        for result in sim.results or []
        for raw in result.auth or []
    ]
    entry = next((candidate for candidate in entries if _address_of(candidate) == wallet), None)
    if entry is None:
        raise RuntimeError("The transfer did not ask the wallet for authorization")

    def signer(preimage: stellar_xdr.HashIDPreimage) -> stellar_xdr.SCVal:
        payload = authorization_payload_hash(preimage)
        return agent_signature_scval(agent.raw_public_key(), agent.sign(payload))

    latest = rpc_server.get_latest_ledger().sequence
    signed = authorize_entry(entry, signer, latest + valid_for_ledgers, network_passphrase)
    return {
        "x402Version": X402_VERSION,
        "scheme": SCHEME,
        "network": requirements["network"],
        "payload": {"from": wallet, "authorization": signed.to_xdr()},
    }
