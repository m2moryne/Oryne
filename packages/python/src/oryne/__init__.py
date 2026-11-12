"""Oryne: give an AI agent a wallet it can spend from, with limits it cannot break.

>>> from oryne import OryneAgent, PaymentRefusedError
>>> agent = OryneAgent(secret=os.environ["ORYNE_AGENT_SECRET"])
>>> response = agent.fetch("https://api.example.com/search?q=stellar")
"""

from .agent import (
    DEFAULT_API_URL,
    Approval,
    OryneAgent,
    OryneAPIError,
    PaymentEvent,
    PaymentRefusedError,
    RefusalSource,
)
from .guard import BeforePay, PayeeRule, PaymentCheck, parse_payee_rule, payee_refusal
from .payment import (
    PAYMENT_HEADER,
    PAYMENT_RESPONSE_HEADER,
    PaymentRequirements,
    SettleResponse,
    StellarError,
    agent_signature_scval,
    contract_error_name,
    sign_payment,
)
from .tools import OryneTool, anthropic_tools, openai_tools, oryne_tools, run_tool
from .units import from_base_units, to_base_units

__version__ = "0.4.0"

__all__ = [
    "DEFAULT_API_URL",
    "PAYMENT_HEADER",
    "PAYMENT_RESPONSE_HEADER",
    "Approval",
    "BeforePay",
    "OryneAPIError",
    "OryneAgent",
    "PayeeRule",
    "PaymentCheck",
    "PaymentEvent",
    "PaymentRefusedError",
    "PaymentRequirements",
    "RefusalSource",
    "SettleResponse",
    "StellarError",
    "agent_signature_scval",
    "contract_error_name",
    "from_base_units",
    "parse_payee_rule",
    "payee_refusal",
    "sign_payment",
    "to_base_units",
]
