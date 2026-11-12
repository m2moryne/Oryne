import { serve } from '@hono/node-server'
import { paywall } from '@oryne/merchant'
import { Hono } from 'hono'

/**
 * A tiny paid API for trying Oryne end to end: what an AI agent buys in the
 * examples (examples/research-agent). Hosted on testnet at
 * https://demo.oryne.org (deploy/docker).
 *
 * Locally, run `npm run setup` in the repo root first: it creates a funded
 * testnet address with a USDC trustline and writes MERCHANT_ADDRESS to .env.
 */

const payTo = process.env.MERCHANT_ADDRESS
if (!payTo) {
  console.error('Set MERCHANT_ADDRESS (run `npm run setup` in the repo root).')
  process.exit(1)
}
const facilitator = process.env.FACILITATOR_URL ?? 'http://localhost:8787/v1/x402'
const pay = paywall({ payTo, facilitator })

/** Demo data: short, general notes an agent can search. Not live news. */
const notes = [
  { title: 'What x402 is', text: 'x402 uses the HTTP 402 Payment Required status: a service answers with a price, the client pays and retries the same request with proof of payment.' },
  { title: 'Why agents need their own wallets', text: 'An agent that pays per request needs money it can spend without a person approving each payment, and limits it cannot exceed.' },
  { title: 'Limits enforced on-chain', text: 'With Oryne the limits (a budget, a cap per payment, allowed payees) live in a smart contract wallet, so a buggy or tricked agent cannot overspend.' },
  { title: 'Stellar for small payments', text: 'Stellar settles in about five seconds with fees well under a cent, which makes payments of a few cents practical.' },
  { title: 'USDC on Stellar', text: 'Circle issues USDC natively on Stellar, so agents can hold and spend a dollar-stable token.' },
  { title: 'Approvals', text: 'When a payment is over its limits, an Oryne agent can ask its owner to approve that one payment instead of failing outright.' },
  { title: 'Passkeys as owners', text: 'Oryne wallets can be owned by a passkey, so the owner signs with a fingerprint or face instead of a seed phrase.' },
]

const app = new Hono()

app.get('/', (c) =>
  c.json({
    name: 'Oryne demo merchant',
    network: 'Stellar testnet (test USDC)',
    routes: {
      '/quote': { price: '0.01 USDC', what: 'A quote about invention' },
      '/search?q=topic': { price: '0.05 USDC', what: 'Notes matching a topic, e.g. x402, stellar, approvals' },
      '/report': { price: '30 USDC', what: 'A full research report on agent payments (over most mandates)' },
    },
  }),
)

app.get('/quote', pay('0.01', 'A random quote'), (c) =>
  c.json({ quote: 'The best way to predict the future is to invent it.', author: 'Alan Kay' }),
)

app.get('/search', pay('0.05', 'Search results'), (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase()
  const words = q.split(/\W+/).filter((word) => word.length > 2)
  const matches = notes.filter((note) => words.some((word) => `${note.title} ${note.text}`.toLowerCase().includes(word)))
  return c.json({ query: q, results: (matches.length ? matches : notes).slice(0, 3), note: 'Demo data' })
})

app.get('/report', pay('30', 'A long research report'), (c) =>
  c.json({
    title: 'Agent payments on Stellar',
    note: 'Demo data',
    sections: notes.map((note) => ({ heading: note.title, body: note.text })),
    conclusion: 'Small, frequent, final payments with limits enforced by the wallet itself make it safe to let agents spend.',
  }),
)

const port = Number(process.env.PORT ?? 8788)
// HOST=127.0.0.1 behind a reverse proxy; unset listens on every interface.
const hostname = process.env.HOST
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Demo merchant on http://${hostname ?? 'localhost'}:${port}, paid to ${payTo}`))
