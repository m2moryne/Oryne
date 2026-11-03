import { Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState, Panel, Stat } from '../../app/ui'
import { dollars, feePercent, pricing } from '../../lib/pricing'
import { api, MODE } from '../api'
import { useLive } from '../LiveContext'

type BillingData = {
  plan: string
  /** False in test mode: nothing is charged, the figures show what live mode would cost. */
  charged: boolean
  month: { label: string; start: number; end: number }
  payments: number
  volume: string
  freeAllowance: string
  freeUsed: string
  billable: string
  fee: string
  due: string
}

/** Limits this server enforces today. Kept in step with services/api. */
const limits = [
  { what: 'Test USDC from the faucet', value: 'Up to 1,000 per request', test: true },
  { what: 'Card top-up', value: '1 to 500 USDC each' },
  { what: 'Service listings', value: '20 per account' },
  { what: 'AI debugger', value: '30 questions an hour' },
  { what: 'Teammates', value: '25 per account' },
]

const usdc = (value: string | undefined) => (value === undefined ? '—' : dollars(Number(value)))

/** This month's agent payments, the fee they carry, and invoices. No subscription: see /pricing. */
export default function Billing() {
  const live = useLive()
  const token = live.session?.token
  const [data, setData] = useState<BillingData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let current = true
    api<BillingData>('/v1/billing', { token })
      .then((next) => current && setData(next))
      .catch((reason: Error) => current && setError(reason.message))
    return () => {
      current = false
    }
  }, [token])

  const charged = data?.charged ?? MODE === 'live'
  const used = data ? Math.min(Number(data.freeUsed) / Number(data.freeAllowance), 1) : 0
  const due = data ? Number(data.due) : 0
  const fee = data ? Number(data.fee) : 0

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Billing</h1>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      {!charged && (
        <p className="border border-taupe/60 px-4 py-2.5 text-sm text-muted">
          <span className="font-medium text-charcoal">Test mode is free.</span> The figures below are what this month would
          cost in live mode, so you can see the fee before real money is involved.
        </p>
      )}

      <Panel title={`${data?.month.label ?? 'This month'} so far`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="type-label text-muted">{charged ? 'Fee so far' : 'Fee in live mode'}</p>
            <p className="mt-3 text-4xl tracking-[-0.03em] tabular-nums">{data ? dollars(due) : '—'}</p>
            <p className="mt-2 text-sm text-muted">
              {!data
                ? ' '
                : fee > 0 && due === 0
                  ? `${dollars(fee)} so far, under ${dollars(pricing.minimumBill)}, so not billed`
                  : Number(data.billable) > 0
                    ? `${feePercent} of ${usdc(data.billable)} past the free allowance`
                    : 'Inside the free allowance'}
            </p>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-sm">
              <span>Free allowance</span>
              <span className="tabular-nums text-muted">
                {usdc(data?.freeUsed)} of {usdc(data?.freeAllowance)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-taupe/30">
              <div className="h-full rounded-full bg-charcoal transition-[width] duration-500" style={{ width: `${used * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Resets on the 1st of each month (UTC).</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Plan" value="Pay as you go" note="Every feature, no monthly fee" />
        <Stat label="Agent payments" value={usdc(data?.volume)} note={data ? `${data.payments.toLocaleString()} settled this month` : undefined} />
        <Stat label="Payments you receive" value="Free" note="No fee on what agents pay you" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Invoices" flush>
          <EmptyState icon={Receipt} title="No invoices yet">
            {charged
              ? 'Each month’s fee is billed at the start of the next. You’ll see invoices here.'
              : 'Test mode is never billed. Invoices appear here once you use live mode.'}
          </EmptyState>
        </Panel>
        <Panel title="Limits" flush>
          <dl className="divide-y divide-taupe/30 text-sm">
            {limits
              .filter((limit) => !limit.test || MODE === 'test')
              .map((limit) => (
                <div key={limit.what} className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-3 md:px-6">
                  <dt>{limit.what}</dt>
                  <dd className="text-muted">{limit.value}</dd>
                </div>
              ))}
          </dl>
        </Panel>
      </div>
    </div>
  )
}
