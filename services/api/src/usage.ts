import type { Db } from './db.ts'

/**
 * Usage for the developer console: API requests and payments per day, and who
 * made them. Days are 24-hour windows ending now, oldest first, so the latest
 * one is whole rather than a part-empty calendar day.
 */

const DAY = 86_400
export const usageRanges = [7, 14, 30] as const

const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(Math.floor(sorted.length * fraction), sorted.length - 1)]
}

type RequestRow = { actor_kind: string; actor: string | null; status: number; latency_ms: number; created_at: number }
type PaymentRow = { agent: string | null; amount: string; status: string; created_at: number }

export async function usage(db: Db, owner: string, days: number, money: (units: bigint) => string, at: number) {
  const start = at - days * DAY
  const dayOf = (createdAt: number) => Math.min(Math.floor((createdAt - start) / DAY), days - 1)

  const [requests, payments, keys, agents] = await Promise.all([
    db
      .prepare('select actor_kind, actor, status, latency_ms, created_at from requests where owner = ? and created_at >= ?')
      .all<RequestRow>(owner, start),
    db
      .prepare(
        `select p.agent, p.amount, p.status, p.created_at from payments p join wallets w on w.id = p.wallet_id
         where w.owner = ? and p.created_at >= ?`,
      )
      .all<PaymentRow>(owner, start),
    db.prepare('select id, name from api_keys where owner = ?').all<{ id: string; name: string }>(owner),
    db
      .prepare('select a.public_key, a.name from agents a join wallets w on w.id = a.wallet_id where w.owner = ?')
      .all<{ public_key: string; name: string }>(owner),
  ])
  const keyName = new Map(keys.map((key) => [key.id, key.name]))
  const agentName = new Map(agents.map((agent) => [agent.public_key, agent.name]))

  const series = Array.from({ length: days }, (_, index) => ({
    start: start + index * DAY,
    requests: 0,
    errors: 0,
    latencies: [] as number[],
    settled: 0,
    volume: 0n,
    refused: 0,
  }))
  for (const row of requests) {
    const day = series[dayOf(row.created_at)]
    day.requests++
    if (row.status >= 400) day.errors++
    day.latencies.push(row.latency_ms)
  }
  for (const row of payments) {
    const day = series[dayOf(row.created_at)]
    if (row.status === 'settled') {
      day.settled++
      day.volume += BigInt(row.amount)
    } else if (row.status === 'refused') day.refused++
  }

  // Who called: the dashboard (a signed-in session), each API key, each agent.
  const callers = new Map<string, { kind: string; id: string | null; name: string; requests: number; errors: number }>()
  for (const row of requests) {
    const id = row.actor_kind === 'owner' ? null : row.actor
    const key = `${row.actor_kind}:${id ?? ''}`
    const name =
      row.actor_kind === 'owner'
        ? 'Dashboard'
        : row.actor_kind === 'key'
          ? (keyName.get(row.actor ?? '') ?? 'Deleted key')
          : (agentName.get(row.actor ?? '') ?? 'Agent')
    const caller = callers.get(key) ?? { kind: row.actor_kind, id, name, requests: 0, errors: 0 }
    caller.requests++
    if (row.status >= 400) caller.errors++
    callers.set(key, caller)
  }

  const byAgent = new Map<string, { publicKey: string; name: string; settled: number; volume: bigint; refused: number }>()
  for (const row of payments) {
    if (!row.agent) continue
    const agent = byAgent.get(row.agent) ?? { publicKey: row.agent, name: agentName.get(row.agent) ?? 'Agent', settled: 0, volume: 0n, refused: 0 }
    if (row.status === 'settled') {
      agent.settled++
      agent.volume += BigInt(row.amount)
    } else if (row.status === 'refused') agent.refused++
    byAgent.set(row.agent, agent)
  }

  const latencies = requests.map((row) => row.latency_ms)
  return {
    days,
    start,
    totals: {
      requests: requests.length,
      errors: requests.filter((row) => row.status >= 400).length,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      settled: series.reduce((total, day) => total + day.settled, 0),
      volume: money(series.reduce((total, day) => total + day.volume, 0n)),
      refused: series.reduce((total, day) => total + day.refused, 0),
    },
    series: series.map(({ latencies: dayLatencies, volume, ...day }) => ({
      ...day,
      p95: percentile(dayLatencies, 0.95),
      volume: money(volume),
    })),
    callers: [...callers.values()].sort((a, b) => b.requests - a.requests),
    agents: [...byAgent.values()]
      .map((agent) => ({ ...agent, volume: money(agent.volume) }))
      .sort((a, b) => b.settled - a.settled || b.refused - a.refused),
  }
}
