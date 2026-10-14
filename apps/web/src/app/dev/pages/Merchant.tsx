import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../../lib/cn'
import { compact, shortKey, strkey, useLiveFeed, usdc } from '../../../lib/network'
import { useStore } from '../../store'
import { Panel, Stat, Toggle } from '../../ui'
import { CodeBlock, Mono } from '../devUi'

type Route = { method: string; path: string; price: string; unit: string; enabled: boolean }

const startRoutes: Route[] = [
  { method: 'GET', path: '/v1/search', price: '0.008', unit: 'call', enabled: true },
  { method: 'GET', path: '/v1/extract', price: '0.02', unit: 'page', enabled: true },
  { method: 'POST', path: '/v1/batch', price: '0.50', unit: 'job', enabled: true },
  { method: 'GET', path: '/v1/health', price: '0', unit: 'call', enabled: false },
]

const setup = (payTo: string) => ({
  'Express': `import express from 'express'
import { paywall } from '@oryne/merchant'

const app = express()
const pay = paywall({ payTo: '${payTo}', network: 'stellar-testnet' })

app.get('/v1/search', pay('0.008'), search)
app.get('/v1/extract', pay('0.02'), extract)
app.post('/v1/batch', pay('0.50'), batch)`,
  'Next.js': `// middleware.ts
import { paywall } from '@oryne/merchant/next'

export default paywall({
  payTo: '${payTo}',
  routes: { '/api/search': '0.008', '/api/extract': '0.02' },
})`,
  'FastAPI': `from fastapi import FastAPI
from oryne.merchant import Paywall

app = FastAPI()
pay = Paywall(pay_to="${payTo}", network="stellar-testnet")

@app.get("/v1/search", dependencies=[pay("0.008")])
def search(q: str): ...`,
})

/** The other side of a payment: a developer charging agents for an API. */
export default function Merchant() {
  const { state } = useStore()
  const payTo = strkey(`merchant-${state.dev.org.name}`)
  const [routes, setRoutes] = useState(startRoutes)
  const [listed, setListed] = useState(true)
  // Borrow the network feed and pretend it's this merchant's incoming payments.
  const incoming = useLiveFeed(8).filter((item) => item.status === 'settled')

  const update = (index: number, patch: Partial<Route>) =>
    setRoutes((current) => current.map((route, i) => (i === index ? { ...route, ...patch } : route)))

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Accept payments</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Earned, 30 days" value="4,812.40 USDC" note="Settled to your address" />
        <Stat label="Paid calls, 24 h" value={compact(184_220)} note="From 3,412 agents" />
        <Stat label="Average price" value="0.011 USDC" note="Per paid call" />
        <Stat label="Chargebacks" value="0" note="Settled payments are final" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Panel title="Charge agents in three lines" className="xl:col-span-3">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            The middleware answers unpaid requests with <Mono>402 Payment Required</Mono>, verifies the
            agent&rsquo;s signed USDC transfer through the facilitator, and lets the request through once
            it settles. Any x402 client can pay you, not only Oryne agents.
          </p>
          <CodeBlock samples={setup(shortKey(payTo, 6, 4))} />
        </Panel>

        <div className="space-y-4 xl:col-span-2">
          <Panel title="Where you get paid">
            <p className="font-mono text-[0.8125rem] break-all">{payTo}</p>
            <p className="mt-2 text-sm text-muted">
              Any Stellar address with a USDC trustline. Cash out to a bank or mobile money through an
              anchor.
            </p>
          </Panel>
          <Panel title="Directory">
            <Toggle
              label="List in the Oryne directory"
              note="Agents can find you through the MCP server's find_service tool."
              checked={listed}
              onChange={setListed}
            />
            {listed && (
              <Link to="/directory" className="mt-4 inline-block text-sm underline underline-offset-4">
                See the directory
              </Link>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Priced routes" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Route</th>
                <th scope="col" className="px-4 py-3 font-medium">Price, USDC</th>
                <th scope="col" className="px-4 py-3 font-medium">Per</th>
                <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">Charging</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {routes.map((route, index) => (
                <tr key={route.path} className={cn(!route.enabled && 'text-muted')}>
                  <td className="px-5 py-3 font-mono text-[0.8125rem] md:px-6">
                    {route.method} {route.path}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Price for ${route.path}`}
                      value={route.price}
                      inputMode="decimal"
                      onChange={(event) => update(index, { price: event.target.value })}
                      className="w-24 border border-taupe/60 bg-transparent px-2 py-1 font-mono text-[0.8125rem] tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-3">{route.unit}</td>
                  <td className="px-5 py-3 text-right md:px-6">
                    <input
                      type="checkbox"
                      aria-label={`Charge for ${route.path}`}
                      checked={route.enabled}
                      onChange={(event) => update(index, { enabled: event.target.checked })}
                      className="size-4 accent-current"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Incoming payments" flush>
        <ul className="divide-y divide-taupe/30">
          {incoming.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 text-sm md:px-6">
              <span className="w-36 font-mono text-xs">{shortKey(item.agent)}</span>
              <span className="min-w-0 flex-1 text-muted">from wallet {shortKey(item.wallet)}</span>
              <span className="font-mono text-xs text-muted">{shortKey(item.hash, 6, 4)}</span>
              <span className="w-28 text-right tabular-nums">+{usdc(item.amount)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
