import { ExternalLink, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { Icon } from '../components/Icon'
import { shortKey } from '../lib/network'
import { explorerAccount, explorerTx } from './api'
import { useLive } from './LiveContext'
import { useLocation } from 'react-router-dom'

/** Runs an async action with a busy flag and a readable error. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const run = async (task: () => Promise<string | void>) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await task()
      if (result) setDone(result)
      return true
    } catch (reason) {
      setError((reason as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, done, run, setError }
}

/**
 * Round button that reloads the balance, agents, payments and approvals from
 * the API (and anything else the page passes as `onRefresh`), for when money
 * arrived from outside Oryne and the page hasn't caught up.
 */
export function RefreshButton({ onRefresh }: { onRefresh?: () => Promise<unknown> }) {
  const live = useLive()
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    if (busy) return
    setBusy(true)
    // Spin for at least a moment, so a fast reload still reads as done.
    await Promise.all([(onRefresh ?? live.refresh)().catch(() => undefined), new Promise((done) => setTimeout(done, 600))])
    setBusy(false)
  }
  return (
    <button
      type="button"
      onClick={refresh}
      aria-label="Refresh"
      title="Refresh"
      aria-busy={busy}
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-taupe text-charcoal transition-colors hover:border-charcoal"
    >
      <Icon icon={RotateCw} size={16} className={cn(busy && 'animate-spin')} />
    </button>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-4 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
      {error}
    </p>
  )
}

export function TxLink({ hash }: { hash: string }) {
  const { info } = useLive()
  return (
    <a
      href={explorerTx(info?.network ?? '', hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[0.8125rem] underline-offset-4 hover:underline"
    >
      {shortKey(hash, 6, 6)} <Icon icon={ExternalLink} size={12} />
    </a>
  )
}

export function AddressLink({ address }: { address: string }) {
  const { info } = useLive()
  return (
    <a
      href={explorerAccount(info?.network ?? '', address)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[0.8125rem] underline-offset-4 hover:underline"
    >
      {shortKey(address, 6, 6)} <Icon icon={ExternalLink} size={12} />
    </a>
  )
}

export const when = (seconds: number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(seconds * 1000),
  )

export const usd = (value: string | undefined) => (value === undefined ? '—' : `${value} USDC`)

/** Where this dashboard lives: /app for owners, /app/developers in the developer console. */
export function useBase() {
  const { pathname } = useLocation()
  return pathname === '/app/developers' || pathname.startsWith('/app/developers/') ? '/app/developers' : '/app'
}
