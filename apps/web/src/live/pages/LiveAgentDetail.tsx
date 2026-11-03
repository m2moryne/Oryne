import { Keypair } from '@stellar/stellar-sdk/base'
import { ArrowLeft, KeyRound, Pause, Play, Unplug } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Dialog, Field, inputClasses, Meter, Panel, StatusPill } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { api, type Intent, type LiveAgent } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, TxLink, useAction, useBase, usd, when } from '../shared'
import { AgentSecret } from './LiveAgents'

type Replaced = { publicKey: string; secret: string; oldRemoved: boolean }

/**
 * Lost the secret: an email code, then the agent gets a new key with the same
 * name and mandate (two signatures: add the new key, remove the old one).
 * Oryne never stores agent secrets, so the old one can't be shown again.
 */
function ReplaceKey({
  agent,
  open,
  onClose,
  onReplaced,
  onNewKey,
  replaced,
}: {
  agent: LiveAgent
  open: boolean
  onClose: () => void
  onReplaced: (result: Replaced) => void
  /** Called once the new key is on the wallet, before the old one goes, so the page follows it. */
  onNewKey: (publicKey: string) => void
  replaced: Replaced | null
}) {
  const live = useLive()
  const action = useAction()
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'add' | 'remove' | null>(null)

  const sendCode = () =>
    action.run(async () => {
      const result = await api<{ sent: boolean; email: string | null }>('/v1/confirm/email', {
        body: { action: 'replace-agent-key' },
        token: live.token,
      })
      setSentTo(result.sent ? result.email : null)
    })

  const confirm = (event: FormEvent) => {
    event.preventDefault()
    const keypair = Keypair.random()
    void action.run(async () => {
      setStep('add')
      try {
        await live.sign((token) =>
          api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}/replace`, {
            body: { publicKey: keypair.publicKey(), code: code || undefined },
            token,
          }),
        )
      } finally {
        setStep(null)
      }
      // The new key works from here on: show its secret even if removing the old one fails.
      onNewKey(keypair.publicKey())
      let oldRemoved = false
      setStep('remove')
      try {
        await live.sign((token) => api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}`, { method: 'DELETE', token }))
        oldRemoved = true
      } catch {
        // Shown below: the old key is still on the wallet until disconnected.
      } finally {
        setStep(null)
      }
      onReplaced({ publicKey: keypair.publicKey(), secret: keypair.secret(), oldRemoved })
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={replaced ? 'New key ready' : 'Give this agent a new key'}
      description={replaced ? undefined : 'For a lost secret. Same name, budget and limits; the old secret stops working.'}
    >
      {replaced ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            {replaced.oldRemoved
              ? 'The old key is removed from your wallet. Put this secret wherever the agent runs.'
              : 'The new key is on your wallet, but removing the old one didn’t go through. Disconnect it from the agent list.'}
          </p>
          <AgentSecret secret={replaced.secret} />
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : sentTo === undefined ? (
        <div className="space-y-5 text-sm leading-relaxed">
          <p className="text-muted">
            Oryne never keeps an agent&rsquo;s secret, so it can&rsquo;t show the old one again. Instead {agent.name} gets a
            new key: same budget, limits and history. Anything using the old secret stops working.
          </p>
          <p className="text-muted">First we email you a code to confirm it&rsquo;s you, then you sign twice with your passkey.</p>
          <ErrorNote error={action.error} />
          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={sendCode} disabled={action.busy}>
              {action.busy ? 'Sending…' : 'Email me a code'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-5">
          {sentTo ? (
            <Field label="Code" hint={`Sent to ${sentTo}. It expires in 10 minutes.`}>
              {(id) => (
                <input
                  id={id}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  className={`${inputClasses} tracking-[0.3em]`}
                />
              )}
            </Field>
          ) : (
            <p className="text-sm text-muted">Your account has no email, so your wallet signature confirms it&rsquo;s you.</p>
          )}
          <ErrorNote error={action.error} />
          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={action.busy || (!!sentTo && code.length !== 6)}>
              {step === 'add'
                ? 'Sign 1 of 2: add the new key…'
                : step === 'remove'
                  ? 'Sign 2 of 2: remove the old key…'
                  : 'Confirm and sign'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

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
  const base = useBase()
  const navigate = useNavigate()
  const pause = useAction()
  const remove = useAction()
  const [replacing, setReplacing] = useState(false)
  const [replaced, setReplaced] = useState<Replaced | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)

  // After a new key, this page (still at the old key's address) shows the agent under its new key.
  const agent = live.wallet!.agents.find((candidate) => candidate.publicKey === (newKey ?? key))
  if (!agent) return <Navigate to={`${base}/agents`} replace />
  const closeReplace = () => {
    setReplacing(false)
    if (replaced) navigate(`${base}/agents/${replaced.publicKey}`, { replace: true })
  }

  const paused = agent.status === 'paused'
  const budget = Number(agent.budget)
  const remaining = agent.remaining !== undefined ? Number(agent.remaining) : budget
  const payments = live.payments.filter((payment) => payment.agent === agent.publicKey)

  return (
    <div className="space-y-6">
      <Link to={`${base}/agents`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-charcoal">
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
          <Panel title="Lost the secret?">
            <p className="text-sm leading-relaxed text-muted">
              Give this agent a new key after an email code. Same name, budget and limits; the old secret stops working.
            </p>
            <Button variant="outline" size="sm" leadingIcon={KeyRound} className="mt-4" onClick={() => setReplacing(true)}>
              Get a new key
            </Button>
            <ReplaceKey agent={agent} open={replacing} onClose={closeReplace} onReplaced={setReplaced} onNewKey={setNewKey} replaced={replaced} />
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
                if (ok) navigate(`${base}/agents`)
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
