import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Answer } from '../app/dev/DebugChat'
import { cn } from '../lib/cn'
import { ApiError, askOryneAI, type AssistantTurn } from '../live/api'
import { Icon } from './Icon'

/**
 * OryneAI: a chat button in the bottom-right corner of the public site. It
 * opens a panel where visitors can ask anything about Oryne; answers stream
 * from the API's /v1/assistant. The conversation lasts for the browser tab.
 */

type Message = { role: 'user' | 'assistant'; content: string; pending?: boolean; failed?: boolean }

const STORAGE_KEY = 'oryne.ai.chat'
/** The API takes up to 16 turns; older ones are dropped from what's sent, not from the screen. */
const SENT_TURNS = 15

const starters = [
  'What is Oryne, in simple terms?',
  'How do the spending limits actually work?',
  'How do I give Claude a wallet?',
  'What does it cost?',
  'Is it live on mainnet?',
]

function loadChat(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Message[]
    return Array.isArray(saved) ? saved.filter((message) => !message.pending && !message.failed) : []
  } catch {
    return []
  }
}

export function OryneAI() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(loadChat)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((message) => !message.pending)))
    } catch {
      // Storage blocked: the chat just won't survive a reload.
    }
  }, [messages])

  // Follow the conversation as it grows, including while an answer streams in.
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // A streaming answer stops if the visitor leaves the page.
  useEffect(() => () => abort.current?.abort(), [])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setDraft('')
    const history: Message[] = [...messages.filter((message) => !message.failed), { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '', pending: true }])
    setBusy(true)
    const controller = new AbortController()
    abort.current = controller

    const turns: AssistantTurn[] = history.slice(-SENT_TURNS).map(({ role, content }) => ({ role, content }))
    // The API wants the conversation to start with a question.
    while (turns.length && turns[0].role !== 'user') turns.shift()

    let answer = ''
    try {
      await askOryneAI(
        turns,
        (chunk) => {
          answer += chunk
          setMessages([...history, { role: 'assistant', content: answer, pending: true }])
        },
        controller.signal,
      )
      setMessages([...history, { role: 'assistant', content: answer }])
    } catch (error) {
      if (controller.signal.aborted) return
      const reason = error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
      setMessages([...history, { role: 'assistant', content: answer ? `${answer}\n\n${reason}` : reason, failed: true }])
    } finally {
      if (abort.current === controller) abort.current = null
      setBusy(false)
    }
  }

  const reset = () => {
    abort.current?.abort()
    setBusy(false)
    setMessages([])
    input.current?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(draft)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="oryne-ai"
        aria-label={open ? 'Close OryneAI' : 'Ask OryneAI about Oryne'}
        className={cn(
          'fixed bottom-5 right-5 z-50 flex h-12 items-center gap-2 rounded-full bg-charcoal pl-4 pr-5 text-sm font-medium text-cream shadow-[0_12px_40px_-10px_rgba(10,16,26,0.55)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal md:bottom-6 md:right-6',
          open && 'max-sm:hidden',
        )}
      >
        <Icon icon={open ? X : Sparkles} size={18} />
        {open ? 'Close' : 'Ask OryneAI'}
      </button>

      {open && (
        <section
          id="oryne-ai"
          role="dialog"
          aria-label="OryneAI"
          className="tone-white fixed inset-0 z-50 flex flex-col overflow-hidden border-taupe/60 shadow-[0_24px_80px_-20px_rgba(10,16,26,0.45)] sm:inset-auto sm:bottom-22 sm:right-5 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-2xl sm:border md:right-6"
        >
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream">
              <Icon icon={Sparkles} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">OryneAI</h2>
              <p className="text-xs text-muted">Ask anything about Oryne</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                aria-label="Start a new chat"
                title="New chat"
                className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-charcoal/[0.06] hover:text-charcoal"
              >
                <Icon icon={RotateCcw} size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close OryneAI"
              className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-charcoal/[0.06] hover:text-charcoal"
            >
              <Icon icon={X} size={18} />
            </button>
          </header>

          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-live="polite">
            {messages.length === 0 ? (
              <div>
                <p className="text-sm leading-relaxed">
                  Hi, I’m OryneAI. I can explain what Oryne is building: wallets for AI agents, with spending limits
                  enforced on Stellar. What would you like to know?
                </p>
                <div className="mt-5 flex flex-col items-start gap-2">
                  {starters.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void ask(starter)}
                      className="rounded-full border border-taupe/70 px-3.5 py-1.5 text-left text-xs transition-colors hover:border-charcoal"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((message, index) =>
                  message.role === 'user' ? (
                    <div key={index} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-line rounded-2xl bg-charcoal px-4 py-2.5 text-sm leading-relaxed text-cream">
                        {message.content}
                      </p>
                    </div>
                  ) : (
                    <div
                      key={index}
                      className={cn('space-y-3 text-sm leading-relaxed', message.failed && 'text-burgundy')}
                    >
                      {message.content ? <Answer text={message.content} /> : null}
                      {message.pending && !message.content && <p className="animate-pulse text-muted">Thinking…</p>}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="border-t border-line p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-taupe/60 py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-charcoal/60">
              <textarea
                ref={input}
                rows={1}
                value={draft}
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void ask(draft)
                  }
                }}
                placeholder="Ask about Oryne…"
                aria-label="Your question for OryneAI"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none [field-sizing:content] placeholder:text-muted"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={!draft.trim() || busy}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream transition-opacity disabled:opacity-40"
              >
                <Icon icon={ArrowUp} size={18} />
              </button>
            </div>
            <p className="mt-2 px-1 text-[0.6875rem] text-muted">
              OryneAI can make mistakes. Never share secret keys or seed phrases.
            </p>
          </form>
        </section>
      )}
    </>
  )
}
