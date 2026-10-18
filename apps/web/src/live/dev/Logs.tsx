import { ScrollText, Sparkles } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CopyButton } from '../../app/dev/devUi'
import { EmptyState, Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { cn } from '../../lib/cn'
import { shortKey } from '../../lib/network'
import { api } from '../api'
import { useLive } from '../LiveContext'
import { when } from '../shared'
import { DEV_BASE } from './LiveDevShell'

type LoggedRequest = {
  id: string
  wallet: string | null
  actorKind: 'owner' | 'agent'
  actor: string | null
  method: string
  path: string
  status: number
  latencyMs: number
  error: string | null
  userAgent: string | null
  createdAt: number
}

const PAGE = 50

/** Every API call this account made, or its agents made, from the request logs. */
export default function Logs() {
  const live = useLive()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'error'>('all')
  const [rows, setRows] = useState<LoggedRequest[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const token = live.session?.token

  const load = useCallback(
    async (before?: LoggedRequest) => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({ limit: String(PAGE), ...(filter === 'error' ? { status: 'error' } : {}) })
        if (before) query.set('before', `${before.createdAt}.${before.id}`)
        const { requests } = await api<{ requests: LoggedRequest[] }>(`/v1/logs?${query}`, { token })
        setRows((current) => (before ? [...current, ...requests] : requests))
        setMore(requests.length === PAGE)
      } catch (reason) {
        setError((reason as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [token, filter],
  )

  useEffect(() => {
    void load()
  }, [load])

  const who = (row: LoggedRequest) =>
    row.actorKind === 'owner'
      ? 'You'
      : (live.wallet?.agents.find((agent) => agent.publicKey === row.actor)?.name ?? shortKey(row.actor ?? '', 4, 4))

  const ask = (row: LoggedRequest) =>
    navigate(`${DEV_BASE}/debugger`, {
      state: { ask: `Why did ${row.id} fail? ${row.method} ${row.path} answered ${row.status}${row.error ? `: ${row.error}` : ''}.` },
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl tracking-[-0.02em]">Logs</h1>
          <p className="mt-1 text-sm text-muted">API calls from your dashboard, your code and your agents. Kept for 30 days.</p>
        </div>
        <div role="group" aria-label="Show" className="flex rounded-full border border-taupe/60 p-1">
          {(
            [
              ['all', 'All'],
              ['error', 'Errors'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                filter === value ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel flush>
        {rows.length === 0 && !loading ? (
          <EmptyState icon={ScrollText} title={filter === 'error' ? 'No failed requests' : 'No requests yet'}>
            {filter === 'error'
              ? 'Nothing has failed in the last 30 days.'
              : 'Requests appear here as soon as you or your agents call the API.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-5 py-3 font-medium md:px-6">Request</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">By</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Time</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      aria-expanded={open === row.id}
                      className="cursor-pointer transition-colors hover:bg-charcoal/[0.04]"
                    >
                      <td className="max-w-96 truncate px-5 py-3 md:px-6">
                        <span className="font-mono text-xs text-muted">{row.method}</span>{' '}
                        {row.path.replace(/C[A-Z2-7]{55}/g, (id) => shortKey(id, 4, 4))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('font-mono text-xs', row.status >= 400 ? 'text-burgundy' : 'text-muted')}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{who(row)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{row.latencyMs} ms</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-muted md:px-6">{when(row.createdAt)}</td>
                    </tr>
                    {open === row.id && (
                      <tr>
                        <td colSpan={5} className="bg-charcoal/[0.03] px-5 py-4 md:px-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                              <dt className="text-muted">Request ID</dt>
                              <dd className="flex items-center gap-1 font-mono text-xs">
                                {row.id} <CopyButton value={row.id} className="text-muted hover:text-charcoal" />
                              </dd>
                              <dt className="text-muted">Path</dt>
                              <dd className="break-all font-mono text-xs">{row.path}</dd>
                              {row.error && (
                                <>
                                  <dt className="text-muted">Error</dt>
                                  <dd className="text-burgundy">{row.error}</dd>
                                </>
                              )}
                              {row.userAgent && (
                                <>
                                  <dt className="text-muted">Client</dt>
                                  <dd className="truncate text-xs text-muted">{row.userAgent}</dd>
                                </>
                              )}
                            </dl>
                            {row.status >= 400 && (
                              <Button size="sm" variant="outline" leadingIcon={Sparkles} onClick={() => ask(row)}>
                                Ask the debugger
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(more || loading) && (
          <div className="border-t border-taupe/40 p-3 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => load(rows.at(-1))}
              className="text-sm text-muted underline underline-offset-4 hover:text-charcoal disabled:no-underline"
            >
              {loading ? 'Loading…' : 'Load older'}
            </button>
          </div>
        )}
      </Panel>
    </div>
  )
}
