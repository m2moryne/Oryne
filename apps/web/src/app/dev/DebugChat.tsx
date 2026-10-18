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
 * The debugger's conversation: messages scroll inside a fixed-height panel and
 * the input sits at its bottom, as a pill.
 */
export function DebugChat({
  messages,
  onSend,
  busy,
  placeholder,
  footnote,
}: {
  messages: ChatMessage[]
  onSend: (question: string) => void
  busy?: boolean
  placeholder: string
  footnote?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  // Follow the conversation as it grows, including while an answer streams in.
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || busy) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    // Its own surface rather than <Panel>, whose inner wrapper would break the fixed-height column.
    <section className="tone-white flex h-[calc(100svh-15rem)] min-h-[30rem] flex-col border border-taupe/50">
      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 md:p-6">
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

      <div className="border-t border-taupe/40 p-3 md:p-4">
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-full border border-taupe/60 bg-white py-1.5 pl-5 pr-1.5 transition-colors focus-within:border-charcoal"
        >
          <input
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
        {footnote && <p className="mt-2 px-4 text-xs text-muted">{footnote}</p>}
      </div>
    </section>
  )
}
