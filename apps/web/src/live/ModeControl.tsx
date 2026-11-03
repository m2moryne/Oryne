import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dialog } from '../app/ui'
import { Button } from '../components/Button'
import { cn } from '../lib/cn'
import { LIVE_API_URL, MODE, switchMode, TEST_API_URL, type Mode } from './api'

/**
 * Changing between test (testnet) and live (mainnet). Each mode has its own
 * API, sign-in and data, so a change reloads the dashboard on the same page.
 * Until a live API is configured, asking for live explains when it opens.
 */
export function useModeChange() {
  const { pathname } = useLocation()
  const [notOpen, setNotOpen] = useState(false)
  /** The mode being switched to, while its API wakes up. */
  const [pending, setPending] = useState<Mode | null>(null)
  const change = (next: Mode) => {
    if (next === MODE || pending) return
    if (next === 'live' && !LIVE_API_URL) return setNotOpen(true)
    // Agent detail pages hold keys that don't exist on the other network.
    const path = pathname.replace(/\/agents\/[^/]+$/, '/agents')
    setPending(next)
    // Wake the other network's API first (a sleeping server can take a while),
    // keeping this page on screen; the reload then loads in a moment.
    const target = next === 'live' ? LIVE_API_URL : TEST_API_URL
    fetch(`${target}/v1/info`, { signal: AbortSignal.timeout(60_000) })
      .catch(() => undefined)
      .finally(() => switchMode(next, path))
  }
  const dialog = (
    <>
      <LiveNotOpen open={notOpen} onClose={() => setNotOpen(false)} />
      {pending && (
        <p
          role="status"
          className="tone-charcoal fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-2.5 text-sm shadow-lg"
        >
          <span className={cn('size-2 animate-pulse rounded-full', pending === 'live' ? 'bg-green' : 'bg-taupe')} />
          Switching to {pending === 'live' ? 'live' : 'test'} mode…
        </p>
      )}
    </>
  )
  return { mode: MODE, pending, change, dialog }
}

function LiveNotOpen({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Live mode opens with mainnet" description="Real USDC on Stellar, with the same dashboard you’re using now.">
      <div className="space-y-4 text-sm leading-relaxed">
        <p>
          Until then, everything runs in test mode on Stellar testnet, with test USDC and no fees. Your agents, limits and
          code carry over: live mode is the same API at a different address.
        </p>
        <p className="text-muted">
          Live mode starts after the wallet contract’s independent audit. You’ll hear from us before it opens.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button size="sm" onClick={onClose}>
            Stay in test mode
          </Button>
          <Button size="sm" variant="outline" to="/pricing">
            See pricing
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Test / Live for the dark sidebar of the agent dashboard. */
export function SidebarModeToggle() {
  const { mode: current, pending, change, dialog } = useModeChange()
  const mode = pending ?? current
  return (
    <>
      <div role="group" aria-label="Mode" className="grid grid-cols-2 border border-cream/15 p-1 text-xs">
        {(['test', 'live'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => change(option)}
            className={cn(
              'flex items-center justify-center gap-2 py-2 transition-colors duration-200',
              mode === option ? 'bg-cream text-charcoal' : 'text-cream/65 hover:text-cream',
            )}
          >
            <span className={cn('size-1.5 rounded-full', option === 'live' ? 'bg-green' : 'bg-taupe')} />
            {option === 'test' ? 'Test' : 'Live'}
          </button>
        ))}
      </div>
      {dialog}
    </>
  )
}

/** A strip at the top of every page while in live mode: this is real money. */
export function LiveBanner({ className }: { className?: string }) {
  if (MODE !== 'live') return null
  return (
    <p className={cn('flex items-center gap-2 border border-green/50 px-4 py-2.5 text-sm', className)}>
      <span className="size-2 rounded-full bg-green" />
      <span>
        <span className="font-medium text-green">Live mode.</span> Real USDC on Stellar mainnet. Fees follow our{' '}
        <Link to="/pricing" className="underline underline-offset-4">
          pricing
        </Link>
        .
      </span>
    </p>
  )
}
