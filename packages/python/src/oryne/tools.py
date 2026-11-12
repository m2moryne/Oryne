"""Oryne's agent tools for any LLM framework.

The same four tools the MCP server gives Claude and Cursor (``fetch_paid``,
``wallet_status``, ``request_approval``, ``find_service``), as plain definitions
with a JSON Schema and a ``run`` that returns text for the model::

    from oryne import OryneAgent
    from oryne.tools import oryne_tools, openai_tools, anthropic_tools, run_tool

    tools = oryne_tools(OryneAgent(os.environ["ORYNE_AGENT_SECRET"]))
    openai_tools(tools)     # OpenAI-style function calling (also DeepSeek, Groq, Ollama, ...)
    anthropic_tools(tools)  # Claude's Messages API
    run_tool(tools, call.function.name, call.function.arguments)  # -> text to send back

Ready-made tools for LangChain, CrewAI and the OpenAI Agents SDK are in
:mod:`oryne.integrations`. The wallet contract enforces the agent's mandate
whatever a model asks, so these tools can be given to a model as they are.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Literal

from .agent import OryneAgent, PaymentEvent, PaymentRefusedError
from .units import from_base_units

ToolName = Literal["fetch_paid", "wallet_status", "request_approval", "find_service"]

_AMOUNT = re.compile(r"^\d+(\.\d{1,7})?$")


@dataclass(frozen=True)
class OryneTool:
    """One tool: its name, what it does, a JSON Schema for its input, and how to run it."""

    name: ToolName
    description: str
    parameters: dict[str, Any]
    #: Runs the tool with keyword arguments. Returns text for the model; failures are
    #: described in the text, not raised.
    run: Callable[..., str]


def _text(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, indent=2)


def oryne_tools(
    agent: OryneAgent,
    *,
    approval_timeout: float = 120,
    max_response_chars: int = 50_000,
    only: Iterable[ToolName] | None = None,
) -> list[OryneTool]:
    """The four Oryne tools for ``agent``.

    :param approval_timeout: Seconds ``request_approval`` waits for the owner to decide.
    :param max_response_chars: Longest response body ``fetch_paid`` hands back to the model.
    :param only: Only these tools (by name). Default: all four.
    """

    def fetch_paid(url: str = "", method: str = "GET", body: str | None = None, maxPrice: str | None = None, **_: Any) -> str:  # noqa: N803
        url = str(url or "")
        method = str(method or "GET").upper()
        if not re.match(r"^https?://", url):
            return "Not fetched: url must be a full address starting with https://"
        if maxPrice and not _AMOUNT.match(str(maxPrice)):
            return 'Not fetched: maxPrice must be an amount like "0.10"'

        payments: list[str] = []

        def on_payment(event: PaymentEvent) -> None:
            if event.type == "paid" and event.settlement:
                payments.append(f"Paid {event.amount} USDC (tx {event.settlement.get('transaction')})")

        kwargs: dict[str, Any] = {}
        if body:
            kwargs["content"] = body
            kwargs["headers"] = {"content-type": "application/json"}
        try:
            response = agent.fetch(url, method, max_price=maxPrice or None, on_payment=on_payment, **kwargs)
        except PaymentRefusedError as error:
            r = error.requirements
            asked = f"Service asked for {from_base_units(int(r['maxAmountRequired']))} USDC to {r['payTo']}.\n"
            if error.source == "client":
                return (
                    f"Not paid: {error.reason}. Nothing was signed and no money moved.\n{asked}"
                    "Do not try to pay this another way. If you think it is legitimate, tell your owner."
                )
            return (
                f"The wallet refused this payment: {error.reason}.\n{asked}"
                "If it is needed, call request_approval with payTo, amount and a short description."
            )
        except Exception as error:  # noqa: BLE001 - the model gets the reason as text
            return f"Request failed: {error}"
        content = response.text[:max_response_chars]
        return "".join(f"{line}\n" for line in payments) + f"HTTP {response.status_code}\n\n{content}"

    def wallet_status(**_: Any) -> str:
        try:
            return _text(agent.me(refresh=True))
        except Exception as error:  # noqa: BLE001
            return f"Could not read the wallet: {error}"

    def request_approval(
        payTo: str = "",  # noqa: N803
        amount: str = "",
        description: str = "",
        resource: str | None = None,
        **_: Any,
    ) -> str:
        if not payTo or not _AMOUNT.match(str(amount)) or not description:
            return 'Not asked: give payTo (a Stellar address), amount (like "12.50") and a description.'
        try:
            approval = agent.request_approval(pay_to=payTo, amount=str(amount), description=description, resource=resource or None)
            decided = agent.wait_for_approval(approval["id"], timeout=approval_timeout)
        except Exception as error:  # noqa: BLE001
            return f"Could not ask for approval: {error}"
        if decided["status"] == "pending":
            return f"Approval {approval['id']} is still waiting for the owner. Check again later."
        return f"The owner {decided['status']} the request."

    def find_service(query: str = "", **_: Any) -> str:
        try:
            response = agent._http.get(f"{agent.api_url}/v1/services", params={"q": str(query)})
            if response.status_code >= 400:
                return f"The directory answered HTTP {response.status_code}."
            return _text(response.json())
        except Exception as error:  # noqa: BLE001
            return f"Could not search the directory: {error}"

    tools = [
        OryneTool(
            "fetch_paid",
            "Fetches a URL. If the service answers 402 Payment Required, pays it in USDC from your Oryne wallet "
            "within your mandate and returns the response. If the wallet refuses (over limit, payee not allowed), "
            "says why; use request_approval to ask the owner.",
            {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The full URL to fetch, https://..."},
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE"], "description": "HTTP method. Default GET."},
                    "body": {"type": "string", "description": "Request body (JSON), for POST or PUT"},
                    "maxPrice": {
                        "type": "string",
                        "description": 'Most you expect this request to cost in USDC, e.g. "0.10". Anything higher is refused unpaid.',
                    },
                },
                "required": ["url"],
                "additionalProperties": False,
            },
            fetch_paid,
        ),
        OryneTool(
            "wallet_status",
            "Shows your Oryne wallet, its balance, your limits and how much budget you have left.",
            {"type": "object", "properties": {}, "additionalProperties": False},
            wallet_status,
        ),
        OryneTool(
            "request_approval",
            "Asks your owner to approve one payment your mandate does not allow. Waits for an answer for a while. "
            "Once approved, retry the request with fetch_paid.",
            {
                "type": "object",
                "properties": {
                    "payTo": {"type": "string", "description": "The Stellar address to pay (from the refused payment)"},
                    "amount": {"type": "string", "description": 'Amount in USDC, e.g. "12.50"'},
                    "description": {"type": "string", "description": "What it is for, in one sentence the owner will read"},
                    "resource": {"type": "string", "description": "The URL the payment is for"},
                },
                "required": ["payTo", "amount", "description"],
                "additionalProperties": False,
            },
            request_approval,
        ),
        OryneTool(
            "find_service",
            "Searches the Oryne directory for services that accept agent payments.",
            {
                "type": "object",
                "properties": {"query": {"type": "string", "description": 'What you need, e.g. "web search" or "weather"'}},
                "required": ["query"],
                "additionalProperties": False,
            },
            find_service,
        ),
    ]
    if only is not None:
        wanted = set(only)
        tools = [tool for tool in tools if tool.name in wanted]
    return tools


def run_tool(tools: list[OryneTool], name: str, arguments: str | dict[str, Any] | None) -> str:
    """Runs the tool a model called, by name. ``arguments`` may be the JSON string models send, or a dict."""
    tool = next((candidate for candidate in tools if candidate.name == name), None)
    if tool is None:
        return f"Unknown tool: {name}"
    if arguments is None or arguments == "":
        arguments = {}
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except ValueError:
            return f"The arguments for {name} weren't valid JSON."
    if not isinstance(arguments, dict):
        return f"The arguments for {name} must be an object."
    return tool.run(**arguments)


def openai_tools(tools: list[OryneTool]) -> list[dict[str, Any]]:
    """OpenAI-style function tools (Chat Completions; also DeepSeek, Groq, Together, Ollama, ...)."""
    return [
        {"type": "function", "function": {"name": tool.name, "description": tool.description, "parameters": tool.parameters}}
        for tool in tools
    ]


def anthropic_tools(tools: list[OryneTool]) -> list[dict[str, Any]]:
    """Tools for Claude's Messages API (``tools`` in ``messages.create``)."""
    return [{"name": tool.name, "description": tool.description, "input_schema": tool.parameters} for tool in tools]
