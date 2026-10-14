import { Receipt } from 'lucide-react'
import { EmptyState, Panel } from '../../app/ui'
import { useLive } from '../LiveContext'
import { AddressLink, TxLink, usd, when } from '../shared'

/** Every payment agents made or tried from this wallet, as settled (or refused) on Stellar. */
export default function LiveActivity() {
  const live = useLive()
  const agentName = (key: string | null) =>
    live.wallet?.agents.find((agent) => agent.publicKey === key)?.name ?? (key ? 'Removed agent' : 'Unknown')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">Activity</h1>
      <Panel flush>
        {live.payments.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet">
            Payments appear here as soon as an agent pays a service.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-5 py-3 font-medium md:px-6">What</th>
                  <th scope="col" className="px-4 py-3 font-medium">Agent</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paid to</th>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {live.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="max-w-64 truncate px-5 py-3 md:px-6">{payment.resource ?? '—'}</td>
                    <td className="px-4 py-3">{agentName(payment.agent)}</td>
                    <td className="px-4 py-3"><AddressLink address={payment.payee} /></td>
                    <td className="px-4 py-3">
                      {payment.tx_hash ? (
                        <span className="flex items-center gap-2">
                          {payment.approved_by_owner ? 'Approved' : 'Settled'} <TxLink hash={payment.tx_hash} />
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-burgundy">{payment.reason ?? payment.status}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{when(payment.created_at)}</td>
                    <td className="px-5 py-3 text-right tabular-nums md:px-6">
                      <span className={payment.status === 'settled' ? undefined : 'text-muted line-through'}>{usd(payment.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
