import { useEffect, useState } from 'react'
import { formatDay } from '../../app/format'
import { LineChart, RangeSwitch } from '../../app/LineChart'
import { Panel, Stat } from '../../app/ui'
import { api } from '../api'
import { useLive } from '../LiveContext'

const ranges = [7, 14, 30] as const

type UsageData = {
  days: number
  totals: { requests: number; errors: number; p50: number | null; p95: number | null; settled: number; volume: string; refused: number }
  series: Array<{ start: number; requests: number; errors: number; p95: number | null; settled: number; volume: string; refused: number }>
  callers: Array<{ kind: 'owner' | 'key' | 'agent'; id: string | null; name: string; requests: number; errors: number }>
  agents: Array<{ publicKey: string; name: string; settled: number; volume: string; refused: number }>
}

const th = 'px-4 py-3 text-right font-medium'
const td = 'px-4 py-3 text-right tabular-nums'
const kindLabel = { owner: 'Signed in', key: 'API key', agent: 'Agent' }

/** Requests and payments over time for this account, from the request logs and payments. */
export default function Usage() {
  const live = useLive()
  const token = live.session?.token
  const [range, setRange] = useState<(typeof ranges)[number]>(14)
  const [data, setData] = useState<UsageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let current = true
    api<UsageData>(`/v1/usage?days=${range}`, { token })
      .then((next) => current && (setData(next), setError(null)))
      .catch((reason: Error) => current && setError(reason.message))
    return () => {
      current = false
    }
  }, [token, range])

  const totals = data?.totals
  // Each 24-hour window is labelled by the day it ends on.
  const label = (start: number) => formatDay(new Date((start + 86_400) * 1000))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl tracking-[-0.02em]">Usage</h1>
        <div className="bg-white">
          <RangeSwitch ranges={ranges} value={range} onChange={setRange} />
        </div>
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requests" value={totals ? totals.requests.toLocaleString() : '—'} />
        <Stat
          label="Error rate"
          value={totals?.requests ? `${((totals.errors / totals.requests) * 100).toFixed(1)}%` : '—'}
          note={totals ? `${totals.errors.toLocaleString()} failed` : undefined}
        />
        <Stat label="p95 latency" value={totals?.p95 != null ? `${totals.p95} ms` : '—'} note={totals?.p50 != null ? `Median ${totals.p50} ms` : undefined} />
        <Stat
          label="Paid, USDC"
          value={totals ? totals.volume : '—'}
          note={totals ? `${totals.settled} payments, ${totals.refused} refused` : undefined}
        />
      </div>

      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Requests per day">
            <LineChart
              points={data.series.map((day) => ({ label: label(day.start), value: day.requests, detail: `${day.errors} failed` }))}
              formatValue={(value) => `${Math.round(value).toLocaleString()} requests`}
              formatAxis={(value) => Math.round(value).toLocaleString()}
              lastLabel="Last 24 hours"
              summary={`Line chart of API requests per day over the last ${range} days.`}
              className="h-56"
            />
          </Panel>
          <Panel title="Paid per day, USDC">
            <LineChart
              points={data.series.map((day) => ({
                label: label(day.start),
                value: Number(day.volume),
                detail: `${day.settled} payments, ${day.refused} refused`,
              }))}
              formatValue={(value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
              formatAxis={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              lastLabel="Last 24 hours"
              summary={`Line chart of USDC paid by agents per day over the last ${range} days.`}
              className="h-56"
            />
          </Panel>
        </div>
      )}

      {data && data.callers.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel title="By caller" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="type-label border-b border-taupe/40 text-muted">
                    <th scope="col" className="px-5 py-3 font-medium md:px-6">Caller</th>
                    <th scope="col" className={th}>Requests</th>
                    <th scope="col" className={`${th} pr-5 md:pr-6`}>Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-taupe/30">
                  {data.callers.map((caller) => (
                    <tr key={`${caller.kind}:${caller.id}`}>
                      <td className="px-5 py-3 md:px-6">
                        {caller.name}
                        <span className="ml-2 text-xs text-muted">{kindLabel[caller.kind]}</span>
                      </td>
                      <td className={td}>{caller.requests.toLocaleString()}</td>
                      <td className={`${td} pr-5 text-muted md:pr-6`}>{caller.errors.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {data.agents.length > 0 && (
            <Panel title="By agent" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="type-label border-b border-taupe/40 text-muted">
                      <th scope="col" className="px-5 py-3 font-medium md:px-6">Agent</th>
                      <th scope="col" className={th}>Payments</th>
                      <th scope="col" className={th}>USDC</th>
                      <th scope="col" className={`${th} pr-5 md:pr-6`}>Refused</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-taupe/30">
                    {data.agents.map((agent) => (
                      <tr key={agent.publicKey}>
                        <td className="px-5 py-3 md:px-6">{agent.name}</td>
                        <td className={td}>{agent.settled.toLocaleString()}</td>
                        <td className={td}>{agent.volume}</td>
                        <td className={`${td} pr-5 text-muted md:pr-6`}>{agent.refused.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
