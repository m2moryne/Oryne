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

## Options

| Option | |
|---|---|
| `secret` | The agent's secret key (`S…`). |
| `apiUrl` | Oryne API. Defaults to `ORYNE_API_URL`, then `https://oryne.onrender.com` (Stellar testnet). |
| `maxPerRequest` | Most this client pays for one request, whatever a service asks, e.g. `'1'`. |
| `onPayment` | Called with `paying`, `paid` and `refused` events. |

Other methods: `agent.me()` (the agent, its mandate and what's left of its budget), `agent.approval(id)`.

## Links

- [Oryne](https://oryne.org)
- [@oryne/mcp](https://www.npmjs.com/package/@oryne/mcp): the same, as tools for MCP clients like Claude
- [@oryne/merchant](https://www.npmjs.com/package/@oryne/merchant): charge agents for your API
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
