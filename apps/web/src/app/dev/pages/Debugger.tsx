import { ArrowUp, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { cn } from '../../../lib/cn'
import { useStore } from '../../store'
import { Panel } from '../../ui'
import { mockLogs, type LogEntry } from '../devData'
import { CodeBlock, ModeTag, Mono } from '../devUi'

type Message = { from: 'you' | 'ai'; text: string; code?: string; log?: LogEntry }

type ApiError = { error?: { type?: string; code?: string; message?: string; param?: string; retry_after?: number } }

const errorOf = (log: LogEntry) => (log.response as ApiError).error ?? {}

/**
 * What the debugger says about a failed request. In the preview these are
 * written by hand for each kind of failure in the sample logs; the real one
 * reads the request, the agent's mandate and the contract's answer.
 */
function diagnose(log: LogEntry): Pick<Message, 'text' | 'code'> {
  const error = errorOf(log)
  const where = `${log.method} ${log.path} answered ${log.status} (${error.code ?? 'error'})`
  switch (log.status) {
    case 402:
      return {
        text: `${where}. The payment was refused by the agent's mandate on Stellar, not by the merchant: the agent has spent its whole budget for this period, so the wallet contract rejected the transfer and no money moved.\n\nFix: raise the agent's monthly budget, wait for the period to reset, or have the agent ask the owner to approve this one payment.`,
        code: `// Ask the owner to approve a payment beyond the mandate
const approval = await oryne.approvals.create({
  agent: '${(log.request as { agent?: string } | undefined)?.agent ?? 'agt_…'}',
  amount: ${(log.request as { amount?: number } | undefined)?.amount ?? 1200},
  reason: 'Over this month’s budget',
})`,
      }
    case 401:
      return {
        text: `${where}. The key "${log.keyName}" has been revoked, so every request it signs is rejected before it reaches your agents.\n\nFix: create a new ${log.mode} key under API keys and replace it on that server. If you rotated keys recently, an old one is still deployed there.`,
      }
    case 400:
      return {
        text: `${where}. ${error.message ?? 'A parameter is invalid.'} The \`${error.param ?? 'amount'}\` field is in the smallest unit (cents), as an integer: 12.50 USD is 1250.`,
        code: `await oryne.payments.create({ agent, amount: Math.round(price * 100), currency: 'usd' })`,
      }
    case 404:
      return {
        text: `${where}. ${error.message ?? 'The resource does not exist.'} Usually the ID was copied with a typo, the agent was removed, or it exists in the other mode: test and live agents are separate.`,
      }
    case 429:
      return {
        text: `${where}. This key sent too many requests in a short window. Wait ${error.retry_after ?? 2} s (the Retry-After header says how long), then retry with the same idempotency key so a payment can't run twice.`,
        code: `if (response.status === 429) {
  await sleep(Number(response.headers.get('retry-after') ?? 2) * 1000)
  return retry({ idempotencyKey })
}`,
      }
    default:
      return {
        text: `${where}. The error was on Oryne's side and the request was not processed. It is safe to retry with the same idempotency key${log.idempotencyKey ? ` (${log.idempotencyKey})` : ''}. If it keeps failing, check the status page.`,
      }
  }
}

const intro: Message = {
  from: 'ai',
  text: 'Paste a request ID (req_…), or pick a failed request. I read its log and the agent’s mandate, and tell you what went wrong and how to fix it.',
}

/** Chat-style debugger over the console's logs. Preview: answers come from the sample data. */
export default function Debugger() {
  const { state } = useStore()
  const mode = state.dev.mode
  const logs = useMemo(() => mockLogs().filter((log) => log.mode === mode), [mode])
  const failures = useMemo(() => logs.filter((log) => log.status >= 400).slice(0, 8), [logs])
  const [messages, setMessages] = useState<Message[]>([intro])
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)

  // A new mode means different logs: start the conversation over.
  useEffect(() => {
    setMessages([intro])
  }, [mode])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages])

  const ask = (question: string, log?: LogEntry) => {
    const id = /req_[A-Za-z0-9]+/.exec(question)?.[0]
    const found = log ?? logs.find((entry) => entry.id === id)
    let answer: Message
    if (found && found.status < 400) {
      answer = {
        from: 'ai',
        text: `${found.method} ${found.path} succeeded with ${found.status} in ${found.latency} ms. Nothing to fix; if something downstream looked wrong, send me that request instead.`,
        log: found,
      }
    } else if (found) {
      answer = { from: 'ai', ...diagnose(found), log: found }
    } else if (id) {
      answer = {
        from: 'ai',
        text: `I can't find ${id} in ${mode} mode. Logs are kept per mode: switch the toggle at the top right if it was a ${mode === 'test' ? 'live' : 'test'} request.`,
      }
    } else {
      const latest = failures[0]
      answer = latest
        ? { from: 'ai', ...diagnose(latest), log: latest, text: `Your most recent failure: ${diagnose(latest).text}` }
        : { from: 'ai', text: `No failed requests in ${mode} mode. Paste a request ID to look at a specific one.` }
    }
    setMessages((current) => [...current, { from: 'you', text: question }, answer])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    ask(draft.trim())
    setDraft('')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-3 text-2xl tracking-[-0.02em]">
          AI debugger <ModeTag mode={mode} />
        </h1>
        <p className="mt-1 text-sm text-muted">
          Ask why a request failed or a payment was refused. It reads your logs and the agent’s mandate.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <Panel title="Recent failures" flush>
          {failures.length === 0 ? (
            <p className="p-5 text-sm text-muted">No failed requests in {mode} mode.</p>
          ) : (
            <ul className="divide-y divide-taupe/30">
              {failures.map((log) => (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => ask(`Why did ${log.id} fail?`, log)}
                    className="w-full px-5 py-3 text-left transition-colors hover:bg-charcoal/[0.04]"
                  >
                    <span className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">
                        {log.method} {log.path}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-burgundy">{log.status}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">{errorOf(log).message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel flush className="flex min-h-[32rem] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-6">
            {messages.map((message, index) => (
              <div key={index} className={cn('flex gap-3', message.from === 'you' && 'justify-end')}>
                {message.from === 'ai' && (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream">
                    <Icon icon={Sparkles} size={15} />
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[42rem] space-y-3 text-sm leading-relaxed',
                    message.from === 'you' && 'bg-charcoal px-4 py-2.5 text-cream',
                  )}
                >
                  {message.text.split('\n\n').map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {message.log && (
                    <p className="text-xs text-muted">
                      From <Mono>{message.log.id}</Mono> · {message.log.keyName} · {message.log.client}
                    </p>
                  )}
                  {message.code && <CodeBlock label="Suggested change" code={message.code} />}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex items-center gap-2 border-t border-taupe/40 p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Why did req_… fail?"
              aria-label="Ask the debugger"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream transition-opacity disabled:opacity-40"
            >
              <Icon icon={ArrowUp} size={18} />
            </button>
          </form>
        </Panel>
      </div>
    </div>
  )
}
