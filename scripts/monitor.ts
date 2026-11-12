/**
 * Checks that Oryne is up, from outside: both APIs, the demo merchant, the
 * website, the sponsors' XLM (they pay every network fee) and that the server
 * is running the latest master. Run every few minutes by
 * .github/workflows/monitor.yml; also by hand:
 *
 *   node scripts/monitor.ts                 print the results
 *   node scripts/monitor.ts --state f.json  also compare with, and update, the last run's state
 *
 * Exits 1 when it's time to alert: a check has just started failing, or has
 * been failing for another REMIND_MINUTES. GitHub emails whoever owns the
 * schedule when a scheduled run fails. With ALERT_WEBHOOK_URL set (Slack,
 * Discord or anything taking {"text": …}), it also posts there, recoveries too.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const REMIND_MINUTES = 60
const TIMEOUT_MS = 20_000
/** A deploy usually takes a few minutes after a push; past this, master isn't live. */
const DEPLOY_GRACE_MINUTES = 30

type Result = { name: string; ok: boolean; detail: string; ms?: number }

const TESTNET = process.env.ORYNE_TESTNET_API ?? 'https://testnet-apiv1.oryne.org'
const MAINNET = process.env.ORYNE_MAINNET_API ?? 'https://apiv1.oryne.org'
const DEMO = process.env.ORYNE_DEMO_URL ?? 'https://demo.oryne.org'
const WEBSITE = process.env.ORYNE_WEBSITE ?? 'https://oryne.org'

/** The latest master and when it was committed (Unix seconds), from the workflow's checkout. */
const masterCommit = process.env.MASTER_COMMIT
const masterCommittedAt = Number(process.env.MASTER_COMMITTED_AT || 0)

async function timed(url: string, init?: RequestInit) {
  const started = Date.now()
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'oryne-monitor' } })
  return { response, ms: Date.now() - started }
}

async function check(name: string, run: () => Promise<Omit<Result, 'name'>>): Promise<Result> {
  try {
    return { name, ...(await run()) }
  } catch (error) {
    const reason = error instanceof Error ? (error.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000} s` : error.message) : String(error)
    return { name, ok: false, detail: reason }
  }
}

type Info = { network: string; sponsor: string; build?: { commit: string | null; startedAt: number } }

const infos: Record<string, Info | undefined> = {}

const apiCheck = (label: string, url: string, network: string) =>
  check(`${label} API`, async () => {
    const { response, ms } = await timed(`${url}/v1/info`)
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}`, ms }
    const info = (await response.json()) as Info
    infos[label] = info
    if (info.network !== network) return { ok: false, detail: `reports ${info.network}, expected ${network}`, ms }
    return { ok: true, detail: `${network}${info.build?.commit ? ` · ${info.build.commit.slice(0, 7)}` : ''}`, ms }
  })

const sponsorCheck = (label: string, horizon: string, minimum: number) =>
  check(`${label} sponsor XLM`, async () => {
    const sponsor = infos[label]?.sponsor
    if (!sponsor) return { ok: false, detail: `unknown: the ${label} API didn't answer` }
    const { response } = await timed(`${horizon}/accounts/${sponsor}`)
    if (!response.ok) return { ok: false, detail: `Horizon answered HTTP ${response.status}` }
    const account = (await response.json()) as { balances: Array<{ asset_type: string; balance: string }> }
    const xlm = Number(account.balances.find((balance) => balance.asset_type === 'native')?.balance ?? 0)
    const shown = `${xlm.toFixed(2)} XLM`
    return xlm < minimum ? { ok: false, detail: `${shown}, below ${minimum}: top up ${sponsor}` } : { ok: true, detail: shown }
  })

const deployCheck = (label: string) =>
  check(`${label} runs master`, async () => {
    const commit = infos[label]?.build?.commit
    if (!masterCommit) return { ok: true, detail: 'not checked (no MASTER_COMMIT)' }
    if (!commit) return { ok: true, detail: 'not checked (the API reports no commit yet)' }
    if (commit === masterCommit) return { ok: true, detail: commit.slice(0, 7) }
    const minutes = Math.round((Date.now() / 1000 - masterCommittedAt) / 60)
    if (minutes < DEPLOY_GRACE_MINUTES) return { ok: true, detail: `deploying ${masterCommit.slice(0, 7)} (pushed ${minutes} min ago)` }
    return { ok: false, detail: `runs ${commit.slice(0, 7)}, master is ${masterCommit.slice(0, 7)} since ${minutes} min: check oryne-autodeploy on the server` }
  })

const results: Result[] = [
  ...(await Promise.all([
    apiCheck('testnet', TESTNET, 'stellar-testnet'),
    apiCheck('mainnet', MAINNET, 'stellar-mainnet'),
    check('demo merchant', async () => {
      // An unpaid request must get a payment challenge back.
      const { response, ms } = await timed(`${DEMO}/quote`)
      const body = (await response.json().catch(() => null)) as { accepts?: unknown[] } | null
      return response.status === 402 && body?.accepts?.length
        ? { ok: true, detail: '402 with a payment challenge', ms }
        : { ok: false, detail: `HTTP ${response.status}, expected 402 with a challenge`, ms }
    }),
    check('website', async () => {
      const { response, ms } = await timed(WEBSITE)
      const html = await response.text()
      return response.ok && html.includes('<div id="root">') ? { ok: true, detail: `HTTP ${response.status}`, ms } : { ok: false, detail: `HTTP ${response.status}`, ms }
    }),
  ])),
]
results.push(
  ...(await Promise.all([
    sponsorCheck('testnet', 'https://horizon-testnet.stellar.org', 1000),
    sponsorCheck('mainnet', 'https://horizon.stellar.org', 15),
    deployCheck('testnet'),
    deployCheck('mainnet'),
  ])),
)

// ------------------------------------------------------------------ report

const line = (result: Result) => `${result.ok ? '✅' : '❌'} ${result.name}: ${result.detail}${result.ms !== undefined ? ` (${result.ms} ms)` : ''}`
console.log(results.map(line).join('\n'))

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `| | Check | Result | Time |\n|---|---|---|---|\n${results
      .map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail} | ${r.ms !== undefined ? `${r.ms} ms` : ''} |`)
      .join('\n')}\n`,
  )
}

// ------------------------------------------------------------------ alerting

type State = Record<string, { since: number; alertedAt: number }>

const stateIndex = process.argv.indexOf('--state')
const stateFile = stateIndex > 0 ? process.argv[stateIndex + 1] : undefined
const previous: State = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
const now = Math.floor(Date.now() / 1000)
const next: State = {}
const alerts: string[] = []
const recovered: string[] = []

for (const result of results) {
  const before = previous[result.name]
  if (result.ok) {
    if (before) recovered.push(`${result.name}: back after ${Math.round((now - before.since) / 60)} min (${result.detail})`)
    continue
  }
  if (!before) {
    next[result.name] = { since: now, alertedAt: now }
    alerts.push(`${result.name}: ${result.detail}`)
  } else if (now - before.alertedAt >= REMIND_MINUTES * 60) {
    next[result.name] = { since: before.since, alertedAt: now }
    alerts.push(`${result.name}: still failing after ${Math.round((now - before.since) / 60)} min: ${result.detail}`)
  } else {
    next[result.name] = before
  }
}
if (stateFile) writeFileSync(stateFile, JSON.stringify(next, null, 2))

const webhook = process.env.ALERT_WEBHOOK_URL
const runUrl = process.env.GITHUB_RUN_URL
if (webhook && (alerts.length || recovered.length)) {
  const text = [
    ...(alerts.length ? ['🔴 Oryne monitor', ...alerts.map((alert) => `• ${alert}`)] : []),
    ...(recovered.length ? ['🟢 Recovered', ...recovered.map((item) => `• ${item}`)] : []),
    ...(runUrl ? [runUrl] : []),
  ].join('\n')
  // Slack reads `text`, Discord reads `content`.
  await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }) }).catch(
    (error) => console.error('Could not post to ALERT_WEBHOOK_URL:', error.message),
  )
}

if (recovered.length) console.log(`\nRecovered:\n${recovered.join('\n')}`)
if (alerts.length) {
  console.log(`\nAlert:\n${alerts.join('\n')}`)
  process.exit(1)
}
