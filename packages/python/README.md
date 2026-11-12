# oryne (Python)

Give an AI agent a wallet it can spend from, with limits it cannot break.

`agent.fetch()` makes an HTTP request. When a service answers `402 Payment Required` ([x402](https://x402.org)), it pays in USDC from the agent's Oryne wallet on Stellar and retries. The wallet's smart contract checks every payment against the mandate the owner set: per-payment limit, budget, allowed payees, expiry. Nothing the agent does can get past it.

The same SDK as [`@oryne/agent`](https://www.npmjs.com/package/@oryne/agent) for TypeScript, for Python agents: LangChain, CrewAI, LlamaIndex, or a plain script.

```sh
pip install oryne
```

Needs Python 3.10 or later.

## Use

Connect an agent in the [Oryne dashboard](https://oryne.org/app). You get its secret key once.

```python
import os
from oryne import OryneAgent

agent = OryneAgent(os.environ["ORYNE_AGENT_SECRET"])

response = agent.fetch("https://api.example.com/search", params={"q": "stellar"})
print(response.json())
```

`fetch` takes the same keyword arguments as `httpx.Client.request` (`params`, `json`, `headers`, `content`, …) and returns an `httpx.Response`.

When the wallet refuses a payment, `fetch` raises `PaymentRefusedError` with the reason (`OverPerTxLimit`, `OverBudget`, `PayeeNotAllowed`, …). The agent can then ask the owner:

```python
from oryne import PaymentRefusedError

try:
    agent.fetch(url)
except PaymentRefusedError as refused:
    if refused.source != "wallet":
        raise  # refused before signing, see below
    approval = agent.request_approval(
        pay_to=refused.requirements["payTo"],
        amount="30",
        description="Research report for the weekly summary",
        resource=refused.requirements["resource"],
        reason=refused.reason,
    )
    agent.wait_for_approval(approval["id"])  # the owner approves in the dashboard
    agent.fetch(url)                         # now within what was approved
```

## Check a payment before signing

The wallet contract is the hard limit. Before signing, the SDK can also check whether a payment request makes sense at all. That catches a request that is inside the mandate but still wrong: a service that suddenly asks for more, or a hijacked endpoint that asks to be paid at someone else's address.

```python
agent = OryneAgent(
    os.environ["ORYNE_AGENT_SECRET"],
    payees="directory",  # only services in the Oryne directory, at the address they're listed with
    # Your own rule, last before signing: True to pay, or a reason to refuse.
    before_pay=lambda payment: payment.url.startswith("https://api.example.com/") or "only example.com",
)

# This search should cost at most 0.10; a 402 asking more is refused unpaid.
agent.fetch("https://api.example.com/search?q=stellar", max_price="0.10")
```

A refusal here raises `PaymentRefusedError` with `source == "client"`. Nothing was signed and no money moved. Refusals from the wallet contract have `source == "wallet"`.

The directory doesn't verify who owns a listed URL yet. `payees="directory"` stops payments to unlisted hosts and to addresses a host isn't listed with, but for a guarantee, set the allowed payees in the agent's on-chain mandate in the dashboard.

## Options

| Option | |
|---|---|
| `secret` | The agent's secret key (`S…`). |
| `api_url` | Oryne API. Defaults to `ORYNE_API_URL`, then `https://testnet-apiv1.oryne.org` (Stellar testnet). |
| `max_per_request` | Most this client pays for one request, whatever a service asks, e.g. `"1"`. |
| `payees` | Who it may pay: `"any"` (default), `"directory"`, or a list of Stellar addresses. |
| `before_pay` | `(PaymentCheck) -> True \| False \| reason`. Last say before signing. |
| `on_payment` | Called with a `PaymentEvent`: `paying`, then `paid` or `refused`. |
| `http` | Your own `httpx.Client`, e.g. with other timeouts or a proxy. |

Per request: `agent.fetch(url, max_price="0.10")`.

Amounts are strings (`"0.05"`), never floats, so money doesn't depend on float rounding.

Other methods: `agent.me()` (the agent, its mandate and what's left of its budget), `agent.approval(id)`. `OryneAgent` is a context manager that closes its HTTP client.

## As a tool for your agent framework

`fetch` is a plain function, so wrapping it as a tool is a few lines. With LangChain:

```python
from langchain_core.tools import tool

@tool
def fetch_paid(url: str, max_price: str = "1") -> str:
    """Fetch a URL. If it costs money, pay up to max_price USDC from the agent's wallet."""
    try:
        return agent.fetch(url, max_price=max_price).text[:20_000]
    except PaymentRefusedError as refused:
        return f"Not paid: {refused.reason}"
```

## Develop

```sh
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest                                  # unit tests, no network
ORYNE_TESTNET=1 .venv/bin/pytest -m testnet       # end to end on Stellar testnet
```

The unit tests compare signatures and encodings with fixtures produced by the TypeScript SDK, so the two can't drift apart.

## Links

- [Oryne](https://oryne.org)
- [@oryne/agent](https://www.npmjs.com/package/@oryne/agent): the TypeScript SDK
- [@oryne/mcp](https://www.npmjs.com/package/@oryne/mcp): the same as tools for MCP clients like Claude
- [Source](https://github.com/m2moryne/Oryne/tree/master/packages/python)

MIT licensed.
