import { Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState, Panel, Stat } from '../../app/ui'
import { api } from '../api'
import { useLive } from '../LiveContext'

type Totals = { requests: number; errors: number; settled: number; volume: string; refused: number }

/** Limits this server enforces today. Kept in step with services/api. */
const limits = [
  { what: 'Test USDC from the faucet', value: 'Up to 1,000 per request' },
  { what: 'Card top-up', value: '1 to 500 USDC each' },
  { what: 'Service listings', value: '20 per account' },
  { what: 'AI debugger', value: '30 questions an hour' },
  { what: 'Teammates', value: '25 per account' },
]

/** The plan, this month's usage and invoices. Testnet is free, so there's nothing to pay yet. */
export default function Billing() {
  const live = useLive()
  const token = live.session?.token
  const [totals, setTotals] = useState<Totals | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let current = true
    api<{ totals: Totals }>('/v1/usage?days=30', { token })
      .then((data) => current && setTotals(data.totals))
      .catch((reason: Error) => current && setError(reason.message))
    return () => {
      current = false
    }
  }, [token])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">Billing</h1>
        <p className="mt-1 text-sm text-muted">Your plan, what you used in the last 30 days, and invoices.</p>
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel title="Plan">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-2xl tracking-[-0.02em]">Testnet</p>
            <p className="mt-1 text-sm text-muted">Everything on the Stellar test network, with test USDC.</p>
          </div>
          <p className="text-2xl tracking-[-0.02em] tabular-nums">Free</p>
        </div>
        <p className="mt-5 border-t border-taupe/40 pt-4 text-sm leading-relaxed text-muted">
          Pricing for mainnet hasn’t been set yet. Nothing is charged on testnet, and you’ll hear from us before any paid
          plan starts. Questions: <a href="mailto:info@oryne.org" className="underline underline-offset-4">info@oryne.org</a>.
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="API requests, 30 days" value={totals ? totals.requests.toLocaleString() : '—'} note={totals ? `${totals.errors.toLocaleString()} failed` : undefined} />
        <Stat label="Payments settled" value={totals ? totals.settled.toLocaleString() : '—'} note={totals ? `${totals.refused.toLocaleString()} refused` : undefined} />
        <Stat label="Volume" value={totals ? totals.volume : '—'} note="Test USDC" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Limits" flush>
          <dl className="divide-y divide-taupe/30 text-sm">
            {limits.map((limit) => (
              <div key={limit.what} className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-3 md:px-6">
                <dt>{limit.what}</dt>
                <dd className="text-muted">{limit.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Invoices" flush>
          <EmptyState icon={Receipt} title="No invoices">
            Testnet is free, so there’s nothing to bill.
          </EmptyState>
        </Panel>
      </div>
    </div>
  )
}
