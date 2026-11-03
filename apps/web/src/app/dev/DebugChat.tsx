import { ArrowUp, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { CodeBlock } from './devUi'

export type ChatMessage = {
  from: 'you' | 'ai'
  text: string
  /** Shown under the answer, e.g. which request it was read from. */
  note?: ReactNode
  /** Extra code shown as a block under the text. */
  code?: string
  /** Still streaming in. */
  pending?: boolean
  failed?: boolean
}

/** `inline code` inside a line of text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={index} className="bg-charcoal/[0.08] px-1 font-mono text-[0.8125rem]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** Just enough markdown for debugger answers: paragraphs, lists, **bold**, `code` and fenced code. */
function Answer({ text }: { text: string }) {
  const pieces = text.split(/```[\w-]*\n?/)
  return (
    <>
      {pieces.map((piece, index) =>
        index % 2 === 1 ? (
          <CodeBlock key={index} label="Code" code={piece.replace(/\n$/, '')} />
        ) : (
          piece
            .split(/\n{2,}/)
            .filter((block) => block.trim())
            .map((block, blockIndex) => {
              const lines = block.split('\n').filter(Boolean)
              const listed = lines.every((line) => /^\s*([-*]|\d+\.)\s/.test(line))
              const clean = (line: string) => line.replace(/^\s*([-*]|\d+\.)\s/, '').replace(/\*\*(.+?)\*\*/g, '$1')
              return listed ? (
                <ul key={`${index}-${blockIndex}`} className="list-disc space-y-1 pl-5">
                  {lines.map((line, lineIndex) => (
                    <li key={lineIndex}>
                      <Inline text={clean(line)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={`${index}-${blockIndex}`} className="whitespace-pre-line">
                  <Inline text={block.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '')} />
                </p>
              )
            })
        ),
      )}
    </>
  )
}

/**
 * The debugger's conversation: messages scroll behind a floating glass input.
 * It fills its parent's height, so the parent decides how tall it is.
 */
export function DebugChat({
  messages,
  onSend,
  busy,
  placeholder,
  empty,
}: {
  messages: ChatMessage[]
  onSend: (question: string) => void
  busy?: boolean
  placeholder: string
  /** Shown in place of the conversation before the first question. */
  empty?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Follow the conversation as it grows, including while an answer streams in.
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages])

  // A new or different chat starts with the cursor in the input.
  useEffect(() => {
    if (messages.length === 0) input.current?.focus({ preventScroll: true })
  }, [messages.length === 0])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || busy) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <section className="tone-white relative h-full min-h-0 overflow-hidden rounded-t-2xl border border-b-0 border-taupe/50">
      <div ref={scroller} className="h-full overflow-y-auto px-5 pb-36 pt-6 md:px-8">
        {messages.length === 0 && empty ? (
          <div className="flex min-h-full items-center justify-center pb-10">{empty}</div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message, index) => (
              <div key={index} className={cn('flex gap-3', message.from === 'you' && 'justify-end')}>
                {message.from === 'ai' && (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream">
                    <Icon icon={Sparkles} size={15} />
                  </span>
                )}
                <div
                  className={cn(
                    'min-w-0 max-w-[44rem] space-y-3 text-sm leading-relaxed',
                    message.from === 'you' && 'rounded-2xl bg-charcoal px-4 py-2.5 text-cream',
                    message.failed && 'text-burgundy',
                  )}
                >
                  {message.from === 'ai' ? <Answer text={message.text} /> : <p className="whitespace-pre-line">{message.text}</p>}
                  {message.pending && !message.text && <p className="animate-pulse text-muted">Reading your account…</p>}
                  {message.note && <p className="text-xs text-muted">{message.note}</p>}
                  {message.code && <CodeBlock label="Suggested change" code={message.code} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floats over the end of the conversation, which shows through the glass as it scrolls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-5 md:px-8 md:pb-6">
        <form
          onSubmit={submit}
          className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-taupe/40 bg-white/35 py-1.5 pl-5 pr-1.5 shadow-[0_10px_40px_-12px_rgba(10,16,26,0.25),inset_0_1px_0_rgba(255,255,255,0.45)] ring-1 ring-inset ring-white/30 backdrop-blur-xl backdrop-saturate-150 transition-colors focus-within:border-charcoal/50"
        >
          <input
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            aria-label="Ask the debugger"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || busy}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-charcoal text-cream transition-opacity disabled:opacity-40"
          >
            <Icon icon={ArrowUp} size={18} />
          </button>
        </form>
      </div>
    </section>
  )
}
