import { ArrowLeft, Pause, Play, Unplug } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Field, inputClasses, Meter, Panel, StatusPill } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { api, type Intent, type LiveAgent } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, TxLink, useAction, usd, when } from '../shared'

function PolicyForm({ agent }: { agent: LiveAgent }) {
  const live = useLive()
  const action = useAction()
  const [perTx, setPerTx] = useState(agent.perTx)
  const [budget, setBudget] = useState(agent.budget)
  const [windowDays, setWindowDays] = useState(String(agent.windowDays))
  const [payees, setPayees] = useState(agent.payees.join('\n'))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void action.run(() =>
      live.sign((token) =>
        api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}`, {
          method: 'PATCH',
          body: {
            perTx,
            budget,
            windowDays: Number(windowDays),
            payees: payees.split(/\s+/).map((line) => line.trim()).filter(Boolean),
          },
          token,
        }),
      ),
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Per payment">
          {(id) => <input id={id} value={perTx} inputMode="decimal" onChange={(event) => setPerTx(event.target.value)} className={inputClasses} />}
        </Field>
        <Field label="Budget">
          {(id) => <input id={id} value={budget} inputMode="decimal" onChange={(event) => setBudget(event.target.value)} className={inputClasses} />}
        </Field>
        <Field label="Days">
          {(id) => <input id={id} value={windowDays} inputMode="numeric" onChange={(event) => setWindowDays(event.target.value)} className={inputClasses} />}
        </Field>
      </div>
      <Field label="Allowed payees" hint="One Stellar address per line. Leave empty to allow any.">
        {(id) => (
          <textarea id={id} rows={3} value={payees} onChange={(event) => setPayees(event.target.value)} className={`${inputClasses} font-mono text-xs`} />
        )}
      </Field>
      <Button type="submit" size="sm" disabled={action.busy}>
        {action.busy ? 'Waiting for your signature…' : 'Save mandate'}
      </Button>
      {action.done && (
        <p className="text-sm text-muted">
          Updated on-chain in <TxLink hash={action.done} />
        </p>
      )}
      <ErrorNote error={action.error} />
    </form>
  )
}

export default function LiveAgentDetail() {
  const { key } = useParams()
  const live = useLive()
  const navigate = useNavigate()
  const pause = useAction()
  const remove = useAction()

  const agent = live.wallet!.agents.find((candidate) => candidate.publicKey === key)
  if (!agent) return <Navigate to="/app/agents" replace />

  const paused = agent.status === 'paused'
  const budget = Number(agent.budget)
  const remaining = agent.remaining !== undefined ? Number(agent.remaining) : budget
  const payments = live.payments.filter((payment) => payment.agent === agent.publicKey)

  return (
    <div className="space-y-6">
      <Link to="/app/agents" className="inline-flex items-center gap-2 text-sm text-muted hover:text-charcoal">
        <Icon icon={ArrowLeft} size={16} /> All agents
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl tracking-[-0.03em]">{agent.name}</h1>
            <StatusPill status={paused ? 'paused' : 'active'} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {agent.kind} agent · key <AddressLink address={agent.publicKey} /> · connected {when(agent.createdAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leadingIcon={paused ? Play : Pause}
          disabled={pause.busy}
          onClick={() =>
            pause.run(() =>
              live.sign((token) =>
                api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}/pause`, {
                  body: { paused: !paused },
                  token,
                }),
              ),
            )
          }
        >
          {pause.busy ? 'Waiting for your signature…' : paused ? 'Resume agent' : 'Pause agent'}
        </Button>
      </div>
      <ErrorNote error={pause.error} />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title={`Budget, every ${agent.windowDays} days`}>
            <Meter spent={Math.max(budget - remaining, 0)} budget={budget} />
            <p className="mt-4 text-sm text-muted">
              {usd(agent.remaining)} left · read live from the wallet contract
            </p>
          </Panel>

          <Panel title="Payments" flush>
            {payments.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-taupe/30">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 text-sm md:px-6">
                    <span className="min-w-0 flex-1 truncate">{payment.resource ?? payment.payee}</span>
                    <span className={payment.status === 'settled' ? 'tabular-nums' : 'tabular-nums text-muted line-through'}>
                      {usd(payment.amount)}
                    </span>
                    <span className="w-40 text-right text-xs text-muted">
                      {payment.tx_hash ? <TxLink hash={payment.tx_hash} /> : payment.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Mandate">
            <PolicyForm key={`${agent.perTx}-${agent.budget}-${agent.payees.join()}`} agent={agent} />
          </Panel>
          <Panel title="Disconnect">
            <p className="text-sm leading-relaxed text-muted">
              Calls remove_agent on your wallet. The agent&rsquo;s key stops working on the next ledger.
            </p>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={Unplug}
              className="mt-4"
              disabled={remove.busy}
              onClick={async () => {
                const ok = await remove.run(() =>
                  live.sign((token) =>
                    api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}`, { method: 'DELETE', token }),
                  ),
                )
                if (ok) navigate('/app/agents')
              }}
            >
              {remove.busy ? 'Waiting for your signature…' : 'Disconnect agent'}
            </Button>
            <ErrorNote error={remove.error} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
