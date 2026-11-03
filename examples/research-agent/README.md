# Research agent

A small AI agent with its own wallet. **DeepSeek** does the thinking; **Oryne** gives it money it can
spend on paid APIs, inside limits you set. The limits live in a smart contract on Stellar, so the agent
can't go past them, however it's prompted.

```
$ npm start "Research agent payments on Stellar"
🧭  question: Research agent payments on Stellar
🔧  list_services()
🔧  buy(/search?q=stellar)
💳  paying 0.05 USDC for /search
✅  paid · tx 79053506d2d1…
🔧  buy(/report)
💳  paying 30 USDC for /report
⛔  refused by the wallet: OverPerTxLimit
🔧  request_approval(/report, The full report answers the question directly.)
🙋  asked the owner to approve 30 USDC · open Approvals in the Oryne dashboard
👍  owner: approved
💳  paying 30 USDC for /report
✅  paid · tx 372f1e32ed15…

Here's what I found… (bought: search 0.05 USDC, report 30 USDC)
```

It runs on **Stellar testnet** by default: test USDC, nothing real is spent.

## What you need

- **Node.js 22.18 or newer** (`node --version`)
- A **DeepSeek API key**: [platform.deepseek.com](https://platform.deepseek.com) → API keys
- An **Oryne account** at [oryne.org](https://oryne.org), in **Test** mode

## Run it (5 minutes)

**1. Get the code and install it.** This installs [`@oryne/agent`](https://www.npmjs.com/package/@oryne/agent)
from npm, the same package you'd use in your own project.

```bash
git clone https://github.com/m2moryne/Oryne.git
cd Oryne/examples/research-agent
npm install
```

**2. Give the agent a wallet.** In the Oryne dashboard (Test mode):

1. **Funds → Add money → Test USDC**: add 50 test USDC to your wallet.
2. **Agents → Connect agent**: name it, set **1 USDC per payment** and a **5 USDC budget**, sign.
3. Copy the **secret** (S…) it shows. It's shown once. (Lost it? Open the agent → *Get a new key*.)

**3. Configure.**

```bash
cp .env.example .env
```

Open `.env` and fill in `ORYNE_AGENT_SECRET` (step 2) and `DEEPSEEK_API_KEY`. Leave the rest as is.

**4. Run.**

```bash
npm start "Research agent payments on Stellar"
```

When it asks for approval, open **Approvals** in the dashboard and approve: the agent carries on and
pays. Every payment shows under **Activity**, with its Stellar transaction.

## How it works

All of it is in [`src/agent.ts`](src/agent.ts), about 200 lines.

- **The wallet:** `new OryneAgent({ secret })` from `@oryne/agent`. Its `agent.fetch()` works like
  `fetch()`, except that when a service answers **402 Payment Required**, it pays from the agent's wallet
  and retries. That's the [x402](https://www.x402.org) protocol.
- **The brain:** DeepSeek's chat API with four tools the model can call:

  | Tool | What it does |
  |---|---|
  | `list_services` | What the shop sells, and prices (free) |
  | `wallet_status` | Balance, budget left, most it may pay at once |
  | `buy` | Calls a paid route with `agent.fetch()` |
  | `request_approval` | Asks you to approve one payment the wallet refused, and waits for your answer |

- **The shop:** Oryne's [demo merchant](../demo-merchant), hosted on testnet at
  `https://oryne-demo-merchant.onrender.com`. It sells a quote (0.01 USDC), search (0.05 USDC) and a
  report (30 USDC, deliberately over a 1 USDC per-payment limit, to show a refusal). It's 60 lines with
  [`@oryne/merchant`](https://www.npmjs.com/package/@oryne/merchant), if you want to sell your own API.

The refusal doesn't come from this code: the agent tries to pay, and the **wallet contract** says no.
That's the point: you can trust the limit even if the agent is buggy or tricked.

## Options

| Variable | Default | |
|---|---|---|
| `ORYNE_AGENT_SECRET` | (required) | The agent's secret key, S… |
| `DEEPSEEK_API_KEY` | (required) | Your DeepSeek key |
| `ORYNE_API_URL` | `https://oryne.onrender.com` | Testnet. For real USDC: `https://oryne-api-mainnet.onrender.com`, with an agent from Live mode |
| `MERCHANT_URL` | `https://oryne-demo-merchant.onrender.com` | Any x402 service on the same network |
| `DEEPSEEK_MODEL` | `deepseek-chat` | |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Any OpenAI-compatible API works |

The hosted services sleep when idle: the first request after a while can take up to a minute.

## Using Claude instead

Want the same thing inside Claude Desktop, Claude Code or Cursor, without code? Use the MCP server
[`@oryne/mcp`](https://www.npmjs.com/package/@oryne/mcp): **Connect agent** in the dashboard gives you
the config to paste.
