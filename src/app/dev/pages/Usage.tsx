import { useMemo, useState } from 'react'
import { formatDay } from '../../format'
import { LineChart, RangeSwitch } from '../../LineChart'
import { useStore } from '../../store'
import { Meter, Panel, Stat } from '../../ui'
import { API, mockLogs, type LogEntry } from '../devData'
import { MethodBadge, Mono } from '../devUi'

const ranges = [7, 14] as const

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(Math.floor(sorted.length * fraction), sorted.length - 1)] ?? 0
}

const DAY = 86_400_000

/**
 * Buckets requests into 24-hour windows ending now, oldest first. Rolling
 * windows keep the latest point whole; a calendar day would be part-empty.
 */
function byDay(logs: LogEntry[], count: number) {
  const now = Date.now()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now - (count - 1 - index) * DAY - DAY)
    const next = new Date(date.getTime() + DAY)
    return {
      label: formatDay(next),
      date,
      logs: logs.filter((log) => {
        const at = new Date(log.at)
        return at >= date && at < next
      }),
    }
  })
}

export default function Usage() {
  const { state } = useStore()
  const [range, setRange] = useState<(typeof ranges)[number]>(14)

  const days = useMemo(
    () => byDay(mockLogs().filter((log) => log.mode === state.dev.mode), range),
    [state.dev.mode, range],
  )
  const logs = days.flatMap((day) => day.logs)
  const failed = logs.filter((log) => log.status >= 400).length

  const endpoints = useMemo(() => {
    const groups = new Map<string, LogEntry[]>()
    for (const log of logs) {
      const key = `${log.method} ${log.path.replace(/(agt|pay)_\w+/, ':id')}`
      groups.set(key, [...(groups.get(key) ?? []), log])
    }
    return [...groups.entries()]
      .map(([key, entries]) => ({
        method: entries[0].method,
        path: key.split(' ')[1],
        calls: entries.length,
        errors: entries.filter((entry) => entry.status >= 400).length,
        p95: percentile(entries.map((entry) => entry.latency), 0.95),
      }))
      .sort((a, b) => b.calls - a.calls)
  }, [logs])

  // Busiest minute is not in the mock data; a plausible fraction of the limit stands in.
  const peakPerMinute = Math.max(Math.round(logs.length / (range * 6)), 1)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Usage</h1>

      <div className="flex items-center justify-between gap-4">
        <p className="px-1 text-sm text-muted">Everything below covers the last {range} days.</p>
        <div className="bg-white">
          <RangeSwitch ranges={ranges} value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Requests, ${range} days`} value={logs.length.toLocaleString()} note={`In ${state.dev.mode} mode`} />
        <Stat
          label="Error rate"
          value={logs.length ? `${((failed / logs.length) * 100).toFixed(1)}%` : '—'}
          note={`${failed} failed requests`}
        />
        <Stat label="p50 latency" value={`${percentile(logs.map((log) => log.latency), 0.5)} ms`} note="Median" />
        <Stat label="p95 latency" value={`${percentile(logs.map((log) => log.latency), 0.95)} ms`} note="Slowest 5%" />
      </div>

      {/* Two measures on different scales get a chart each, never a shared axis. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Requests per day">
          <LineChart
            points={days.map((day) => ({
              label: day.label,
              value: day.logs.length,
              detail: `${day.logs.filter((log) => log.status >= 400).length} failed`,
            }))}
            formatValue={(value) => `${Math.round(value).toLocaleString()} requests`}
            formatAxis={(value) => Math.round(value).toLocaleString()}
            lastLabel="Last 24 hours"
            summary={`Line chart of API requests per day over the last ${range} days.`}
            className="h-56"
          />
        </Panel>

        <Panel title="p95 latency per day">
          <LineChart
            points={days.map((day) => ({
              label: day.label,
              value: percentile(day.logs.map((log) => log.latency), 0.95),
              detail: `${day.logs.length} requests`,
            }))}
            formatValue={(value) => `${Math.round(value)} ms`}
            lastLabel="Last 24 hours"
            summary={`Line chart of 95th percentile latency per day over the last ${range} days.`}
            className="h-56"
          />
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="By endpoint" flush className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-6 py-3 font-medium">Endpoint</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Calls</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Errors</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">p95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.path}`}>
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-3">
                        <MethodBadge method={endpoint.method} />
                        <Mono>{endpoint.path}</Mono>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{endpoint.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {((endpoint.errors / endpoint.calls) * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-muted">{endpoint.p95} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Rate limit">
          <p className="text-3xl tracking-[-0.03em] tabular-nums">
            {peakPerMinute}
            <span className="text-base tracking-normal text-muted"> / {API.rateLimit} per minute</span>
          </p>
          <p className="mb-4 mt-1 text-sm text-muted">Busiest minute in this period</p>
          <Meter spent={peakPerMinute} budget={API.rateLimit} compact />
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Requests over the limit return <Mono>429</Mono> with a <Mono>Retry-After</Mono> header.
            The SDKs back off and retry for you.
          </p>
        </Panel>
      </div>
    </div>
  )
}
