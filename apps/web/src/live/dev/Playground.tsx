import { Play } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { CopyButton } from '../../app/dev/devUi'
import { inputClasses, Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { cn } from '../../lib/cn'
import { API_URL } from '../api'
import { useLive } from '../LiveContext'

type Result = { status: number; ms: number; requestId: string | null; body: string }

/** Read endpoints, with this account's wallet filled in. */
const endpoints = (wallet: string) => [
  '/v1/me',
  `/v1/wallets/${wallet}`,
  `/v1/wallets/${wallet}/payments`,
  '/v1/approvals',
  '/v1/logs?limit=10',
  '/v1/usage?days=7',
  '/v1/services',
  '/v1/info',
]

/**
 * Sends GET requests to the API as this account, or with an API key, and shows
 * the raw answer. Reads only: changes are signed by the owner elsewhere.
 */
export default function Playground() {
  const live = useLive()
  const options = endpoints(live.wallet?.id ?? '{wallet}')
  const [path, setPath] = useState(options[0])
  const [auth, setAuth] = useState<'session' | 'key'>('session')
  // Kept in memory for this page only, never stored.
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = auth === 'session' ? live.session?.token : key.trim()

  const send = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const started = performance.now()
    try {
      const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
      const text = await response.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // Not JSON: shown as it came.
      }
      setResult({ status: response.status, ms: Math.round(performance.now() - started), requestId: response.headers.get('x-request-id'), body })
    } catch {
      setResult(null)
      setError(`Can't reach ${API_URL}. It may be waking up; try again in a minute.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">Playground</h1>

      <Panel>
        <form onSubmit={send} className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="font-mono text-xs text-muted">GET</span>
              <input
                aria-label="Path"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                spellCheck={false}
                className={cn(inputClasses, 'h-14 py-0 font-mono text-sm')}
              />
            </div>
            <select
              aria-label="Endpoints"
              value=""
              onChange={(event) => event.target.value && setPath(event.target.value)}
              className={cn(inputClasses, 'h-14 py-0 text-sm md:w-56')}
            >
              <option value="">Endpoints…</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/C[A-Z2-7]{55}/, '{wallet}')}
                </option>
              ))}
            </select>
            <Button type="submit" leadingIcon={Play} disabled={busy || !path.trim() || (auth === 'key' && !key.trim())}>
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div role="radiogroup" aria-label="Authenticate as" className="flex shrink-0 self-start border border-taupe/70 p-1 text-sm">
              {(['session', 'key'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={auth === option}
                  onClick={() => setAuth(option)}
                  className={cn('px-3 py-1.5', auth === option ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal')}
                >
                  {option === 'session' ? 'Your session' : 'API key'}
                </button>
              ))}
            </div>
            {auth === 'key' && (
              <input
                type="password"
                aria-label="API key"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="oryne_test_sk_…"
                spellCheck={false}
                className={cn(inputClasses, 'font-mono text-sm')}
              />
            )}
          </div>
        </form>
      </Panel>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      {result && (
        <Panel flush>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-taupe/40 px-5 py-3 text-sm md:px-6">
            <span className={cn('font-mono', result.status >= 400 ? 'text-burgundy' : 'text-charcoal')}>{result.status}</span>
            <span className="text-muted tabular-nums">{result.ms} ms</span>
            {result.requestId && <span className="font-mono text-xs text-muted">{result.requestId}</span>}
            <CopyButton value={result.body} className="ml-auto text-muted hover:text-charcoal" />
          </div>
          <pre className="max-h-[32rem] overflow-auto px-5 py-4 font-mono text-xs leading-relaxed md:px-6">{result.body}</pre>
        </Panel>
      )}
    </div>
  )
}
