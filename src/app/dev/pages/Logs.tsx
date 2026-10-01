import { ScrollText, Search } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { cn } from '../../../lib/cn'
import { formatDateTime } from '../../format'
import { useStore } from '../../store'
import { Dialog, EmptyState, Panel, inputClasses } from '../../ui'
import { API, mockLogs, type LogEntry } from '../devData'
import { CodeBlock, CopyButton, MethodBadge, Mono, StatusCode } from '../devUi'

const filters = [
  { value: 'all', label: 'All', test: () => true },
  { value: '2xx', label: 'Succeeded', test: (status: number) => status < 400 },
  { value: '4xx', label: '4xx', test: (status: number) => status >= 400 && status < 500 },
  { value: '5xx', label: '5xx', test: (status: number) => status >= 500 },
]

const PAGE = 25

/** Rebuilds the request as a command a developer can paste into a terminal. */
function asCurl(log: LogEntry) {
  const lines = [
    `curl -X ${log.method} ${API.base}${log.path.replace('/v1', '')}`,
    `  -H "Authorization: Bearer $ORYNE_API_KEY"`,
  ]
  if (log.request) {
    lines.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(log.request)}'`)
  }
  return lines.join(' \\\n')
}

export default function Logs() {
  const { state } = useStore()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<LogEntry | null>(null)

  const term = query.trim().toLowerCase()
  const active = filters.find((option) => option.value === filter)!
  const logs = mockLogs().filter(
    (log) =>
      log.mode === state.dev.mode &&
      active.test(log.status) &&
      (!term || `${log.method} ${log.path} ${log.id} ${log.status}`.toLowerCase().includes(term)),
  )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Logs</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Icon
            icon={Search}
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShown(PAGE)
            }}
            placeholder="Search by path, status or request ID"
            aria-label="Search requests"
            className={cn(inputClasses, 'rounded-none! py-2.5 pl-11')}
          />
        </div>
        <div role="group" aria-label="Filter by status" className="flex border border-taupe/70 bg-white p-1">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value)
                setShown(PAGE)
              }}
              className={cn(
                'px-3.5 py-1.5 text-sm transition-colors duration-200',
                filter === option.value ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Panel flush>
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No requests match">
            Try a different search or clear the filter.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="type-label border-b border-taupe/40 text-muted">
                    <th scope="col" className="px-6 py-3 font-medium">Request</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Latency</th>
                    <th scope="col" className="px-4 py-3 font-medium">Key</th>
                    <th scope="col" className="px-4 py-3 font-medium">Time</th>
                    <th scope="col" className="px-6 py-3 font-medium">Request ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-taupe/30">
                  {logs.slice(0, shown).map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setOpen(log)}
                      className="cursor-pointer transition-colors duration-150 hover:bg-cream/50"
                    >
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-3">
                          <MethodBadge method={log.method} />
                          <Mono>{log.path}</Mono>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusCode status={log.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{log.latency} ms</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{log.keyName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(log.at)}</td>
                      <td className="px-6 py-3">
                        {/* A real button, so the row can be opened from the keyboard too. */}
                        <button
                          type="button"
                          onClick={() => setOpen(log)}
                          className="font-mono text-[0.8125rem] underline-offset-4 hover:underline"
                        >
                          {log.id}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-taupe/40 px-5 py-4 text-sm text-muted md:px-6">
              <p>
                Showing {Math.min(shown, logs.length)} of {logs.length.toLocaleString()} requests, last 14 days
              </p>
              {shown < logs.length && (
                <button
                  type="button"
                  onClick={() => setShown((count) => count + PAGE)}
                  className="font-medium text-charcoal underline underline-offset-4"
                >
                  Show more
                </button>
              )}
            </div>
          </>
        )}
      </Panel>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.method} ${open.path}` : ''}
      >
        {open && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-1">
                  <StatusCode status={open.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Latency</dt>
                <dd className="mt-1 tabular-nums">{open.latency} ms</dd>
              </div>
              <div>
                <dt className="text-muted">Key</dt>
                <dd className="mt-1">{open.keyName}</dd>
              </div>
              <div>
                <dt className="text-muted">Time</dt>
                <dd className="mt-1">{formatDateTime(open.at)}</dd>
              </div>
              <div>
                <dt className="text-muted">Client</dt>
                <dd className="mt-1">
                  <Mono>{open.client}</Mono>
                </dd>
              </div>
              <div>
                <dt className="text-muted">IP address</dt>
                <dd className="mt-1">
                  <Mono>{open.ip}</Mono>
                </dd>
              </div>
              {open.idempotencyKey && (
                <div className="col-span-2">
                  <dt className="text-muted">Idempotency key</dt>
                  <dd className="mt-1">
                    <Mono>{open.idempotencyKey}</Mono>
                  </dd>
                </div>
              )}
            </dl>
            <p className="flex items-center justify-between gap-2 border border-taupe/60 py-1 pl-3 pr-1 text-sm">
              <span className="truncate">
                <span className="text-muted">Request ID </span>
                <Mono>{open.id}</Mono>
              </span>
              <CopyButton value={open.id} className="text-muted hover:text-charcoal" />
            </p>
            {open.request !== undefined && (
              <CodeBlock code={JSON.stringify(open.request, null, 2)} label="Request body" />
            )}
            <CodeBlock code={JSON.stringify(open.response, null, 2)} label="Response body" />
            <CodeBlock code={asCurl(open)} label="Replay with cURL" />
          </div>
        )}
      </Dialog>
    </div>
  )
}
