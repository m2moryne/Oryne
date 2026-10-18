import { Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DebugChat, type ChatMessage } from '../../app/dev/DebugChat'
import { useEnterPreview } from '../../app/preview'
import { Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { askDebugger, type DebugTurn } from '../api'
import { useLive } from '../LiveContext'
import { usd, when } from '../shared'

const intro: ChatMessage = {
  from: 'ai',
  text: 'Ask me why a payment was refused, why an agent can’t pay, or what to change in a mandate. I read your wallet, your agents’ mandates, recent payments and approvals.',
}

const starters = ['Why was my last payment refused?', 'Which agent is closest to its budget?', 'Is anything stopping my agents from paying?']

/** The AI debugger for a real account: Claude, grounded in this wallet's own data. */
export default function Debugger() {
  const live = useLive()
  const enterPreview = useEnterPreview()
  const [messages, setMessages] = useState<ChatMessage[]>([intro])
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  // The Logs page sends a failed request here with its question ready.
  const location = useLocation()
  const navigate = useNavigate()
  const handedOver = (location.state as { ask?: string } | null)?.ask

  const enabled = live.info?.features?.aiDebugger ?? false
  const refused = live.payments.filter((payment) => payment.status !== 'settled').slice(0, 8)
  const agentName = (key: string | null) =>
    live.wallet?.agents.find((agent) => agent.publicKey === key)?.name ?? 'an agent'

  const ask = async (question: string) => {
    if (!live.session || !live.wallet || busy) return
    // The conversation so far, as the API wants it: real turns only, no intro or failures.
    const history: DebugTurn[] = messages
      .filter((message) => message !== intro && !message.failed && message.text)
      .map((message) => ({ role: message.from === 'you' ? 'user' : 'assistant', content: message.text }))
    const turns: DebugTurn[] = [...history, { role: 'user', content: question }]

    setBusy(true)
    setMessages((current) => [...current, { from: 'you', text: question }, { from: 'ai', text: '', pending: true }])
    const update = (patch: Partial<ChatMessage>) =>
      setMessages((current) => [...current.slice(0, -1), { ...current[current.length - 1], ...patch }])

    abort.current = new AbortController()
    let text = ''
    try {
      await askDebugger(
        live.wallet.id,
        live.session.token,
        turns,
        (chunk) => {
          text += chunk
          update({ text })
        },
        abort.current.signal,
      )
      update({ pending: false })
    } catch (error) {
      if (abort.current.signal.aborted) return
      update({ text: (error as Error).message, pending: false, failed: true })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!handedOver || !enabled || !live.wallet) return
    navigate(location.pathname, { replace: true, state: null })
    void ask(handedOver)
    // Runs once per hand-over; ask() reads current state when it is called.
  }, [handedOver, enabled, live.wallet])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">AI debugger</h1>
        <p className="mt-1 text-sm text-muted">
          Ask why a payment was refused or an agent can’t pay. Claude reads your wallet, mandates and payments.
        </p>
      </div>

      {!enabled ? (
        <Panel>
          <div className="flex flex-col items-start gap-5 py-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm">The AI debugger isn’t switched on for this server yet.</p>
              <p className="mt-1 text-sm text-muted">See how it works with sample data in the preview account.</p>
            </div>
            <Button variant="outline" size="sm" leadingIcon={Eye} onClick={() => enterPreview('/dev/debugger')}>
              Preview it
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
          <Panel title="Refused payments" flush>
            {refused.length === 0 ? (
              <div className="space-y-2 p-5">
                <p className="text-sm text-muted">No refused payments. Try asking:</p>
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={busy}
                    onClick={() => ask(starter)}
                    className="block w-full rounded-full border border-taupe/60 px-4 py-2 text-left text-sm transition-colors hover:border-charcoal disabled:opacity-45"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-taupe/30">
                {refused.map((payment) => (
                  <li key={payment.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        ask(
                          `Why was payment ${payment.id} refused? ${agentName(payment.agent)} tried to pay ${usd(payment.amount)}${payment.resource ? ` for ${payment.resource}` : ''}.`,
                        )
                      }
                      className="w-full px-5 py-3 text-left transition-colors hover:bg-charcoal/[0.04] disabled:opacity-45"
                    >
                      <span className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{agentName(payment.agent)} · {usd(payment.amount)}</span>
                        <span className="shrink-0 font-mono text-xs text-burgundy">{payment.reason ?? payment.status}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {payment.resource ?? 'Payment'} · {when(payment.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <DebugChat
            messages={messages}
            onSend={ask}
            busy={busy}
            placeholder="Why can’t my agent pay?"
            footnote="Answers come from Claude and can be wrong; check before you change a mandate."
          />
        </div>
      )}
    </div>
  )
}
