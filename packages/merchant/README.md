# @oryne/merchant

Charge AI agents per request for your API, in USDC on Stellar.

Requests that haven't paid get `402 Payment Required` with the price ([x402](https://x402.org)). Paid ones are settled on Stellar through the Oryne facilitator before your handler runs. No accounts or API keys for your customers: an agent with a wallet just pays.

```sh
npm install @oryne/merchant
```

## Hono

```ts
import { Hono } from 'hono'
import { paywall } from '@oryne/merchant'

const pay = paywall({
  payTo: 'G…', // your Stellar address
  facilitator: 'https://oryne.onrender.com/v1/x402',
})

const app = new Hono()
app.get('/search', pay('0.01', 'One search'), (c) => c.json({ results: [] }))
```

## Express

```ts
import express from 'express'
import { expressPaywall } from '@oryne/merchant'

const pay = expressPaywall({ payTo: 'G…', facilitator: 'https://oryne.onrender.com/v1/x402' })

const app = express()
app.get('/search', pay('0.01'), (req, res) => res.json({ results: [] }))
```

## Anything else

`createPaywall(options).handle({ price, url, paymentHeader })` tells you whether a request has paid, and what to answer if it hasn't.

## Options

| Option | |
|---|---|
| `payTo` | Your Stellar address. A `G…` account needs a trustline to USDC. |
| `facilitator` | The Oryne facilitator, e.g. `https://oryne.onrender.com/v1/x402` (testnet). |
| `network`, `asset`, `decimals` | Read from the facilitator's API if left out. |

## Links

- [Oryne](https://oryne.org)
- [@oryne/agent](https://www.npmjs.com/package/@oryne/agent): the paying side
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
