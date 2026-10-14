import { Check, ClipboardCheck, X } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { api, type Intent } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, TxLink, usd, when } from '../shared'

/** Payments an agent's mandate refused and it asked about. Approving signs approve_once. */
export default function LiveApprovals() {
  const live = useLive()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const agentName = (key: string) => live.wallet?.agents.find((agent) => agent.publicKey === key)?.name ?? 'Agent'

  const pending = live.approvals.filter((approval) => approval.status === 'pending')
  const history = live.approvals.filter((approval) => approval.status !== 'pending').slice(0, 20)

  const act = async (id: string, approve: boolean) => {
    setBusy(id)
    setError(null)
    try {
      if (approve) {
        await live.sign((token) => api<Intent>(`/v1/approvals/${id}/approve`, { method: 'POST', token }))
      } else {
        await api(`/v1/approvals/${id}/decline`, { method: 'POST', token: live.token })
        await live.refresh()
      }
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">Approvals</h1>
      <ErrorNote error={error} />

      <Panel title={`Waiting for you${pending.length ? ` (${pending.length})` : ''}`} flush>
        {pending.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to approve">
            When an agent&rsquo;s wallet refuses a payment, the agent can ask you here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-taupe/30">
            {pending.map((approval) => (
              <li key={approval.id} className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-5 md:px-6">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="font-medium">{approval.description || 'Payment'}</p>
                  <p className="mt-1 text-sm text-muted">
                    {agentName(approval.agent)} → <AddressLink address={approval.payee} /> · {when(approval.createdAt)}
                  </p>
                  {approval.resource && <p className="mt-1 truncate text-xs text-muted">{approval.resource}</p>}
                </div>
                <div className="basis-48">
                  <p className="text-2xl tracking-[-0.02em] tabular-nums">{usd(approval.amount)}</p>
                  {approval.reason && <p className="mt-1 font-mono text-xs text-burgundy">{approval.reason}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" leadingIcon={X} disabled={!!busy} onClick={() => act(approval.id, false)}>
                    Decline
                  </Button>
                  <Button size="sm" leadingIcon={Check} disabled={!!busy} onClick={() => act(approval.id, true)}>
                    {busy === approval.id ? 'Waiting for your signature…' : 'Approve once'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {history.length > 0 && (
        <Panel title="Decided" flush>
          <ul className="divide-y divide-taupe/30">
            {history.map((approval) => (
              <li key={approval.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 text-sm md:px-6">
                <span className="min-w-0 flex-1 truncate">{approval.description || 'Payment'}</span>
                <span className="tabular-nums">{usd(approval.amount)}</span>
                <span className="w-24 capitalize text-muted">{approval.status}</span>
                <span className="w-36 text-right">{approval.txHash && <TxLink hash={approval.txHash} />}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
