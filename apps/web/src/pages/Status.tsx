import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Container } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { publicPages } from '../lib/seo'
import { LIVE_API_URL, TEST_API_URL, type Info } from '../live/api'

type State = 'checking' | 'up' | 'slow' | 'down' | 'off' | 'unknown'
type Check = { name: string; what: string; state: State; detail: string }

const stateLabel: Record<State, string> = {
  checking: 'Checking',
  up: 'Working',
  slow: 'Slow',
  down: 'Not responding',
  off: 'Not enabled',
  unknown: 'Unknown',
}
const dot: Record<State, string> = {
  checking: 'bg-taupe animate-pulse',
  up: 'bg-green',
  slow: 'bg-amber-500',
  down: 'bg-burgundy',
  off: 'bg-taupe',
  unknown: 'bg-taupe',
}

/** Times a request; aborts after `ms`. */
async function timed<T>(run: (signal: AbortSignal) => Promise<T>, ms: number) {
  const started = performance.now()
  const value = await run(AbortSignal.timeout(ms))
  return { value, ms: Math.round(performance.now() - started) }
}

const latency = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

async function runChecks(): Promise<Check[]> {
  // The API sleeps when idle on its current host, so the first call can take up to a minute.
  let info: Info | null = null
  const api: Check = { name: 'Oryne API (test mode)', what: 'Wallets, agents, the dashboard and the SDKs talk to this, on testnet.', state: 'down', detail: '' }
  try {
    const result = await timed(async (signal) => {
      const response = await fetch(`${TEST_API_URL}/v1/info`, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as Info
    }, 60_000)
    info = result.value
    api.state = result.ms > 5000 ? 'slow' : 'up'
    api.detail = result.ms > 5000 ? `Answered in ${latency(result.ms)}; it was probably waking up` : `Answered in ${latency(result.ms)}`
  } catch (reason) {
    api.detail = (reason as Error).name === 'TimeoutError' ? 'No answer within a minute' : 'Couldn’t reach it'
  }

  const facilitator: Check = {
    name: 'x402 facilitator',
    what: 'Checks and settles agent payments for services that charge with @oryne/merchant.',
    state: info ? api.state : 'down',
    detail: info ? 'Served by the API' : 'Down while the API is down',
  }

  const network: Check = { name: 'Stellar network', what: 'Where wallets live and payments settle.', state: 'down', detail: '' }
  if (!info) {
    network.state = 'unknown'
    network.detail = 'Needs the API to know which network to check'
  } else {
    try {
      const result = await timed(async (signal) => {
        const response = await fetch(info!.rpcUrl ?? 'https://soroban-testnet.stellar.org', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
          signal,
        })
        const body = (await response.json()) as { result?: { sequence: number } }
        if (!body.result) throw new Error('No ledger')
        return body.result.sequence
      }, 15_000)
      network.state = result.ms > 5000 ? 'slow' : 'up'
      network.detail = `${info.network}, ledger ${result.value.toLocaleString()}, ${latency(result.ms)}`
    } catch {
      network.detail = `${info.network}: the RPC didn’t answer`
    }
  }

  const auth = info?.auth
  const signIn: Check = {
    name: 'Sign-in',
    what: 'Email codes, Google, GitHub, passkeys and Freighter.',
    state: info ? 'up' : 'down',
    detail: auth
      ? ['Freighter', 'passkeys', auth.email && 'email codes', auth.google && 'Google', auth.github && 'GitHub'].filter(Boolean).join(', ')
      : 'Down while the API is down',
  }

  const card: Check = {
    name: 'Card top-ups',
    what: 'Adding money by card, with Paystack.',
    state: !info ? 'down' : info.card ? 'up' : 'off',
    detail: !info ? 'Down while the API is down' : info.card ? `In ${info.card.currency}` : 'Test USDC from the faucet works instead',
  }

  const faucet: Check = {
    name: 'Test USDC faucet',
    what: 'Free test money for trying Oryne on testnet.',
    state: !info ? 'down' : info.faucet ? 'up' : 'off',
    detail: !info ? 'Down while the API is down' : info.faucet ? 'Up to 1,000 test USDC a request' : 'Not on this network',
  }

  const debuggerCheck: Check = {
    name: 'AI debugger',
    what: 'Explains failed payments in the developer console.',
    state: !info ? 'down' : info.features?.aiDebugger ? 'up' : 'off',
    detail: !info ? 'Down while the API is down' : info.features?.aiDebugger ? 'Enabled' : 'Not configured yet',
  }

  const liveApi: Check = { name: 'Live mode (mainnet)', what: 'Real USDC on Stellar mainnet.', state: 'off', detail: 'Opens after the contract audit' }
  if (LIVE_API_URL) {
    try {
      const result = await timed(async (signal) => {
        const response = await fetch(`${LIVE_API_URL}/v1/info`, { signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      }, 30_000)
      liveApi.state = result.ms > 5000 ? 'slow' : 'up'
      liveApi.detail = `Answered in ${latency(result.ms)}`
    } catch {
      liveApi.state = 'down'
      liveApi.detail = 'Couldn’t reach it'
    }
  }

  return [api, facilitator, network, liveApi, signIn, faucet, card, debuggerCheck]
}

/** Live checks of Oryne's services, run from the visitor's browser. */
export default function Status() {
  usePageMeta(publicPages.status)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [running, setRunning] = useState(false)

  const check = useCallback(async () => {
    setRunning(true)
    const result = await runChecks()
    setChecks(result)
    setCheckedAt(new Date())
    setRunning(false)
  }, [])

  useEffect(() => {
    void check()
    const timer = window.setInterval(() => void check(), 60_000)
    return () => window.clearInterval(timer)
  }, [check])

  const core = checks?.slice(0, 4) ?? []
  const overall: State = !checks
    ? 'checking'
    : core.some((c) => c.state === 'down')
      ? 'down'
      : core.some((c) => c.state === 'slow')
        ? 'slow'
        : 'up'
  const headline = {
    checking: 'Checking Oryne’s services…',
    up: 'Everything is working.',
    slow: 'Working, but slow.',
    down: 'Something isn’t responding.',
    off: '',
    unknown: '',
  }[overall]

  return (
    <>
      <PageHero
        label="Status"
        title="Is Oryne working?"
        lede="These checks run live from your browser against the same API, facilitator and Stellar network your agents use."
      />
      <section className="tone-white pb-24 md:pb-32">
        <Container>
          <div className="border border-line">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 md:px-8">
              <p className="flex items-center gap-3 text-lg">
                <span className={cn('size-2.5 shrink-0 rounded-full', dot[overall])} />
                {headline}
              </p>
              <button
                type="button"
                onClick={() => void check()}
                disabled={running}
                className="inline-flex items-center gap-2 text-sm text-muted hover:text-charcoal disabled:opacity-60"
              >
                <Icon icon={RefreshCw} size={14} className={cn(running && 'animate-spin')} />
                {running ? 'Checking' : checkedAt ? `Checked ${checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Check'}
              </button>
            </div>
            <ul className="divide-y divide-line">
              {(checks ?? placeholder).map((item) => (
                <li key={item.name} className="grid gap-x-8 gap-y-1 px-5 py-4 md:grid-cols-[1fr_auto] md:px-8">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{item.what}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="flex items-center gap-2 text-sm md:justify-end">
                      <span className={cn('size-2 shrink-0 rounded-full', dot[item.state])} />
                      {stateLabel[item.state]}
                    </p>
                    {item.detail && <p className="mt-0.5 text-sm text-muted">{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 grid gap-8 text-sm leading-relaxed text-muted md:grid-cols-2">
            <p>
              Oryne runs on Stellar <span className="text-charcoal">testnet</span> today, with test USDC. The API sleeps when
              no one has used it for a while, so the first request after a quiet spell can take up to a minute. That’s
              expected, not an outage.
            </p>
            <p>
              Your money is never held by this API: it sits in your wallet contract on Stellar, and your limits are
              enforced there even when Oryne is down. Seeing a problem? Write to{' '}
              <a href="mailto:info@oryne.org" className="text-charcoal underline underline-offset-4">info@oryne.org</a>.
            </p>
          </div>
        </Container>
      </section>
    </>
  )
}

const placeholder: Check[] = ['Oryne API (test mode)', 'x402 facilitator', 'Stellar network', 'Live mode (mainnet)', 'Sign-in', 'Test USDC faucet', 'Card top-ups', 'AI debugger'].map(
  (name) => ({ name, what: '', state: 'checking', detail: '' }),
)
