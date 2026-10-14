import { serve } from '@hono/node-server'
import { paywall } from '@oryne/merchant'
import { Hono } from 'hono'

/**
 * A tiny paid API for trying Oryne end to end. Run `npm run setup` in the
 * repo root first: it creates a funded testnet address with a USDC
 * trustline and writes MERCHANT_ADDRESS to .env.
 */

const payTo = process.env.MERCHANT_ADDRESS
if (!payTo) {
  console.error('Set MERCHANT_ADDRESS (run `npm run setup` in the repo root).')
  process.exit(1)
}
const facilitator = process.env.FACILITATOR_URL ?? 'http://localhost:8787/v1/x402'
const pay = paywall({ payTo, facilitator })

const app = new Hono()

app.get('/', (c) =>
  c.json({
    name: 'Oryne demo merchant',
    routes: { '/quote': '0.01 USDC', '/search?q=': '0.05 USDC', '/report': '30 USDC (over most mandates)' },
  }),
)

app.get('/quote', pay('0.01', 'A random quote'), (c) =>
  c.json({ quote: 'The best way to predict the future is to invent it.', author: 'Alan Kay' }),
)

app.get('/search', pay('0.05', 'Search results'), (c) => {
  const q = c.req.query('q') ?? ''
  return c.json({ query: q, results: [`${q}: result one`, `${q}: result two`, `${q}: result three`] })
})

app.get('/report', pay('30', 'A long research report'), (c) =>
  c.json({ title: 'Agent payments on Stellar', pages: 42, summary: 'Small, frequent, final payments.' }),
)

const port = Number(process.env.PORT ?? 8788)
serve({ fetch: app.fetch, port }, () => console.log(`Demo merchant on http://localhost:${port}, paid to ${payTo}`))
