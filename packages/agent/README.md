# @oryne/agent

Give an AI agent a wallet it can spend from, with limits it cannot break.

`agent.fetch()` works like `fetch()`. When a service answers `402 Payment Required` ([x402](https://x402.org)), it pays in USDC from the agent's Oryne wallet on Stellar and retries. The wallet's smart contract checks every payment against the mandate the owner set: per-payment limit, budget, allowed payees, expiry. Nothing the agent does can get past it.

```sh
npm install @oryne/agent
```

## Use

Connect an agent in the [Oryne dashboard](https://oryne.org/app). You get its secret key once.

```ts
import { OryneAgent, PaymentRefusedError } from '@oryne/agent'

const agent = new OryneAgent({ secret: process.env.ORYNE_AGENT_SECRET! })

const response = await agent.fetch('https://api.example.com/search?q=stellar')
console.log(await response.json())
```

When the wallet refuses a payment, `fetch` throws `PaymentRefusedError` with the reason (`OverPerTxLimit`, `OverBudget`, `PayeeNotAllowed`, …). The agent can then ask the owner:

```ts
try {
  await agent.fetch(url)
} catch (error) {
  if (!(error instanceof PaymentRefusedError)) throw error
  const approval = await agent.requestApproval({
    payTo: error.requirements.payTo,
    amount: '30',
    description: 'Research report for the weekly summary',
    resource: error.requirements.resource,
    reason: error.reason,
  })
  await agent.waitForApproval(approval.id) // the owner approves in the dashboard
  await agent.fetch(url)                   // now within what was approved
}
```

## Check a payment before signing

The wallet contract is the hard limit. It refuses anything outside the mandate, whatever the agent signs. Before signing, the SDK can also check whether a payment request makes sense at all. That catches a request that is inside the mandate but still wrong: a service that suddenly asks for more, or a hijacked endpoint that asks to be paid at someone else's address.

```ts
const agent = new OryneAgent({
  secret: process.env.ORYNE_AGENT_SECRET!,
  payees: 'directory', // only services in the Oryne directory, at the address they're listed with
  // Your own rule, last before signing: true to pay, or a reason to refuse.
  beforePay: ({ url }) => new URL(url).hostname.endsWith('.example.com') || 'only example.com services',
})

// This search should cost at most 0.10; a 402 asking more is refused unpaid.
await agent.fetch('https://api.example.com/search?q=stellar', { maxPrice: '0.10' })
```

A refusal here throws `PaymentRefusedError` with `source: 'client'`. Nothing was signed and no money moved. Refusals from the wallet contract have `source: 'wallet'`.

The directory doesn't verify who owns a listed URL yet. `payees: 'directory'` stops payments to unlisted hosts and to addresses a host isn't listed with, but for a guarantee, set the allowed payees in the agent's on-chain mandate in the dashboard.

## As tools for your agent framework

`oryneTools(agent)` gives your model the same four tools as Oryne's MCP server: `fetch_paid` (fetch a URL, paying a 402 inside the mandate), `wallet_status`, `request_approval` and `find_service`. Each returns text for the model; a refused payment comes back as an explanation, not an exception. The wallet contract enforces the mandate whatever the model asks.

The adapters take the framework's own helpers, so Oryne adds no dependencies and works with the version you have:

```ts
import { OryneAgent, oryneTools, aiSdkTools, openAIAgentsTools, langChainTools } from '@oryne/agent'

const tools = oryneTools(new OryneAgent({ secret: process.env.ORYNE_AGENT_SECRET! }))
```

**Vercel AI SDK**

```ts
import { generateText, jsonSchema, stepCountIs, tool } from 'ai'

const { text } = await generateText({ model, tools: aiSdkTools(tools, { tool, jsonSchema }), stopWhen: stepCountIs(5), prompt })
```

**OpenAI Agents SDK**

```ts
import { Agent, run, tool } from '@openai/agents'

const researcher = new Agent({ name: 'Researcher', instructions: '…', tools: openAIAgentsTools(tools, { tool }) })
await run(researcher, 'Find the latest notes on x402')
```

**LangChain.js / LangGraph.js**

```ts
import { tool } from '@langchain/core/tools'

const llmWithTools = llm.bindTools(langChainTools(tools, { tool }))
```

**Any OpenAI-style or Claude tool calling** (OpenAI, DeepSeek, Groq, Ollama, Anthropic): `openAITools(tools)` or `anthropicTools(tools)` give the tool list, and `runOryneTool(tools, name, args)` runs a call and returns the text to send back.

`oryneTools(agent, { approvalTimeoutMs, maxResponseChars, only: ['fetch_paid'] })` tunes them.

## Options

| Option | |
|---|---|
| `secret` | The agent's secret key (`S…`). |
| `apiUrl` | Oryne API. Defaults to `ORYNE_API_URL`, then `https://testnet-apiv1.oryne.org` (Stellar testnet). |
| `maxPerRequest` | Most this client pays for one request, whatever a service asks, e.g. `'1'`. |
| `payees` | Who it may pay: `'any'` (default), `'directory'`, or an array of Stellar addresses. |
| `beforePay` | `({ url, requirements, amount }) => true \| false \| reason`. Last say before signing. |
| `onPayment` | Called with `paying`, `paid` and `refused` events. |

Per request: `agent.fetch(url, { ...init, maxPrice: '0.10', onPayment })`.

Other methods: `agent.me()` (the agent, its mandate and what's left of its budget), `agent.approval(id)`.

## Links

- [Oryne](https://oryne.org)
- [@oryne/mcp](https://www.npmjs.com/package/@oryne/mcp): the same, as tools for MCP clients like Claude
- [@oryne/merchant](https://www.npmjs.com/package/@oryne/merchant): charge agents for your API
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
