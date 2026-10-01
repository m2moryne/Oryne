import { Download } from 'lucide-react'
import { Icon } from '../../../components/Icon'
import { formatDate, money } from '../../format'
import { Meter, Panel, Stat } from '../../ui'
import { billing } from '../devData'
import { Mono } from '../devUi'

/**
 * Plan, this period's usage and past invoices. The pricing model here is a
 * placeholder to show the shape of the page; none of it has been decided.
 */
export default function Billing() {
  const billable = Math.max(billing.volume - billing.includedVolume, 0)
  const fee = billable * billing.feeRate

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Billing</h1>

      <p className="border border-burgundy/50 px-4 py-2.5 text-sm text-muted">
        <span className="font-medium text-charcoal">Illustrative pricing.</span> The plan, rate and
        figures on this page are placeholders, not a published price.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Plan" value={billing.plan} note={billing.note} />
        <Stat label="Volume this period" value={money(billing.volume)} note={`${billing.payments.toLocaleString()} payments settled`} />
        <Stat label="Fees so far" value={money(fee)} note={`${(billing.feeRate * 100).toFixed(1)}% above the free allowance`} />
        <Stat label="Next invoice" value={formatDate(billing.periodEnds)} note="Charged to the card on file" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="How this period adds up" className="xl:col-span-2">
          <dl className="divide-y divide-taupe/30 text-sm">
            <div className="flex justify-between gap-6 pb-3">
              <dt className="text-muted">Settled payment volume</dt>
              <dd className="tabular-nums">{money(billing.volume)}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-muted">Free allowance</dt>
              <dd className="tabular-nums">− {money(billing.includedVolume)}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-muted">Billable volume</dt>
              <dd className="tabular-nums">{money(billable)}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-muted">Rate</dt>
              <dd className="tabular-nums">{(billing.feeRate * 100).toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between gap-6 pt-3 text-base font-medium">
              <dt>Fees so far</dt>
              <dd className="tabular-nums">{money(fee)}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Test-mode traffic is always free. API calls are not metered; only settled live payments
            count.
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel title="Free allowance">
            <Meter spent={Math.min(billing.volume, billing.includedVolume)} budget={billing.includedVolume} />
            <p className="mt-4 text-sm text-muted">Used up for this period. It resets with the next invoice.</p>
          </Panel>
          <Panel title="Payment method">
            <p className="text-sm">Card ending 4242</p>
            <p className="mt-1 text-sm text-muted">Expires 08 / 2028 · Billing email from Settings</p>
          </Panel>
        </div>
      </div>

      <Panel title="Invoices" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-6 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Period</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Volume</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {billing.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-6 py-3.5">
                    <Mono>{invoice.id}</Mono>
                  </td>
                  <td className="px-4 py-3.5">{invoice.period}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-muted">{money(invoice.volume)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{money(invoice.amount)}</td>
                  <td className="px-4 py-3.5 text-muted">{invoice.status}</td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5 text-muted" title="Not available in the preview">
                      <Icon icon={Download} size={14} /> PDF
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
