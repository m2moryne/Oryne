import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import type { LogEntry, Mode } from './devData'

/** Copies `value` and confirms for a moment. Falls back silently if the clipboard is blocked. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable: the text is on screen to select by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors duration-200',
        className,
      )}
    >
      <Icon icon={copied ? Check : Copy} size={14} />
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}

/** A dark code panel with a copy button and, when given several samples, language tabs. */
export function CodeBlock({
  code,
  samples,
  label,
}: {
  code?: string
  /** Language name → code. Renders a tab per entry. */
  samples?: Record<string, string>
  /** Shown top left when there are no tabs, e.g. "Terminal". */
  label?: string
}) {
  const languages = samples ? Object.keys(samples) : []
  const [language, setLanguage] = useState(languages[0])
  const text = samples ? samples[language] : (code ?? '')

  return (
    <div className="border border-code-fg/10 bg-code text-code-fg">
      <div className="flex items-center justify-between border-b border-code-fg/10 pl-4 pr-1.5">
        {samples ? (
          <div role="tablist" aria-label="Language" className="flex">
            {languages.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={language === option}
                onClick={() => setLanguage(option)}
                className={cn(
                  '-mb-px mr-5 border-b py-3 text-xs font-medium transition-colors duration-200',
                  language === option
                    ? 'border-code-fg text-code-fg'
                    : 'border-transparent text-code-fg/55 hover:text-code-fg',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <span className="py-3 text-xs text-code-fg/55">{label ?? 'Terminal'}</span>
        )}
        <CopyButton value={text} className="text-code-fg/65 hover:text-code-fg" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
        <code>
          {text.split('\n').map((line, index) => (
            <span key={index} className="block">
              {line ? <Highlighted line={line} /> : ' '}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

type Token = { text: string; kind: 'plain' | 'string' | 'comment' }

/**
 * Just enough highlighting for TypeScript, JSON and shell: strings stand out,
 * comments step back. A `//` or `#` only starts a comment at the start of a
 * line or after a space, so URLs are left alone.
 */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let plain = ''
  const flush = () => {
    if (plain) tokens.push({ text: plain, kind: 'plain' })
    plain = ''
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const atBoundary = i === 0 || /\s/.test(line[i - 1])
    if (atBoundary && (line.startsWith('//', i) || (char === '#' && /^\s*$/.test(line.slice(0, i))))) {
      flush()
      tokens.push({ text: line.slice(i), kind: 'comment' })
      return tokens
    }
    if (char === '"' || char === "'" || char === '`') {
      const end = line.indexOf(char, i + 1)
      if (end > i) {
        flush()
        tokens.push({ text: line.slice(i, end + 1), kind: 'string' })
        i = end
        continue
      }
    }
    plain += char
  }
  flush()
  return tokens
}

function Highlighted({ line }: { line: string }) {
  return tokenize(line).map((token, index) =>
    token.kind === 'plain' ? (
      token.text
    ) : (
      <span key={index} className={token.kind === 'string' ? 'text-code-string' : 'text-code-fg/45'}>
        {token.text}
      </span>
    ),
  )
}

const methodClasses: Record<LogEntry['method'], string> = {
  GET: 'border-taupe text-muted',
  POST: 'border-charcoal/40 text-charcoal',
  PATCH: 'border-purple/50 text-purple',
  DELETE: 'border-burgundy/50 text-burgundy',
}

export function MethodBadge({ method }: { method: LogEntry['method'] }) {
  return (
    <span
      className={cn(
        'inline-block w-14 border py-0.5 text-center font-mono text-[0.6875rem] font-medium',
        methodClasses[method],
      )}
    >
      {method}
    </span>
  )
}

/** The code is its own label; errors are also set in the accent colour. */
export function StatusCode({ status }: { status: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-sm tabular-nums',
        status >= 400 ? 'font-medium text-burgundy' : 'text-charcoal',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', status >= 400 ? 'bg-burgundy' : 'bg-charcoal/40')}
      />
      {status}
    </span>
  )
}

export function ModeTag({ mode }: { mode: Mode }) {
  return (
    <span
      className={cn(
        'inline-block border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em]',
        mode === 'live' ? 'border-burgundy/50 text-burgundy' : 'border-taupe text-muted',
      )}
    >
      {mode}
    </span>
  )
}

export const Mono = ({ children }: { children: string }) => (
  <code className="font-mono text-[0.8125rem]">{children}</code>
)
