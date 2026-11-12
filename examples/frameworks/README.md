# Framework examples

The same research agent, built five ways: with the **Vercel AI SDK** and the **OpenAI Agents SDK** in
TypeScript, and with **LangChain**, **CrewAI** and the **OpenAI Agents SDK** in Python. Each gets
Oryne's four tools (`fetch_paid`, `wallet_status`, `request_approval`, `find_service`) from the
framework integration in [`@oryne/agent`](../../packages/agent) or [`oryne`](../../packages/python),
and pays for sources from the demo merchant out of its own wallet, inside the limits you set.

```
$ npm run ai-sdk -- "What is x402?"
🧭  question: What is x402?
🔧  wallet_status()
💳  paying 0.05 USDC for /search
✅  paid · tx 79053506d2d1…
🔧  fetch_paid({"url":"https://demo.oryne.org/search?q=x402","maxPrice":"0.06"})

x402 is … (bought: search, 0.05 USDC)
```

They run on **Stellar testnet** by default: test USDC, nothing real is spent.

| File | Framework |
|---|---|
| [`typescript/src/ai-sdk.ts`](typescript/src/ai-sdk.ts) | Vercel AI SDK, with `aiSdkTools()` |
| [`typescript/src/openai-agents.ts`](typescript/src/openai-agents.ts) | OpenAI Agents SDK (JS), with `openAIAgentsTools()` |
| [`python/langchain_agent.py`](python/langchain_agent.py) | LangChain, with `oryne_langchain_tools()` |
| [`python/crewai_agent.py`](python/crewai_agent.py) | CrewAI, with `oryne_crewai_tools()` |
| [`python/openai_agents_agent.py`](python/openai_agents_agent.py) | OpenAI Agents SDK (Python), with `oryne_openai_agents_tools()` |

## What you need

- An **Oryne account** at [oryne.org](https://oryne.org), in **Test** mode
- A key for a model with tool calling. **DeepSeek** by default ([platform.deepseek.com](https://platform.deepseek.com)
  → API keys); any OpenAI-compatible API works (OpenAI, Groq, Together, a local Ollama…).
- **Node.js 22.18+** for TypeScript, **Python 3.10+** for Python (3.10 to 3.13 for CrewAI)

## Set up (once)

**1. Give the agent a wallet.** In the Oryne dashboard (Test mode):

1. **Funds → Add money → Test USDC**: add some test USDC to your wallet.
2. **Agents → Connect agent**: name it, set **1 USDC per payment** and a **5 USDC budget**, sign.
3. Copy the **secret** (S…) it shows. It's shown once. (Lost it? Open the agent → *Get a new key*.)

**2. Configure.** In this folder:

```bash
cp .env.example .env
```

Fill in `ORYNE_AGENT_SECRET` and `LLM_API_KEY`. For OpenAI instead of DeepSeek, also set
`LLM_BASE_URL=https://api.openai.com/v1` and `LLM_MODEL=gpt-4o-mini`.

## Run

**TypeScript**

```bash
cd typescript
npm install
npm run ai-sdk -- "your question"
npm run openai-agents -- "your question"
```

**Python**

```bash
cd python
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python langchain_agent.py "your question"
python openai_agents_agent.py "your question"

pip install "oryne[crewai]>=0.3.0"                    # Python 3.10 to 3.13
python crewai_agent.py "your question"
```

## Try the limits

The demo merchant's `/report` costs 30 USDC, over the 1 USDC per-payment limit. Ask for "the full
report on agent payments": the wallet refuses (`OverPerTxLimit`), the agent calls `request_approval`,
and you approve or decline it under **Approvals** in the dashboard. Approving lets that one payment
through; the limit stays.

## How it fits together

`shared.ts` / `shared.py` make the agent's wallet (`OryneAgent`, printing each payment), read the model
settings and hold the instructions. Each example file only hands Oryne's tools to its framework:

```ts
tools: aiSdkTools(oryneTools(oryne), { tool, jsonSchema })     // ai-sdk.ts
```

```python
tools=oryne_langchain_tools(oryne)                                # langchain_agent.py
```

The model decides what to buy. The wallet contract on Stellar decides what's allowed: a payment over
the agent's limits, or to a service it may not pay, is refused on-chain whatever the model asks.
