import {
  Bot,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { shortKey } from '../lib/network'
import { cn } from '../lib/cn'
import { Field, inputClasses, Panel } from '../app/ui'
import { API_URL, explorerAccount } from './api'
import { LiveProvider, useLive } from './LiveContext'

const items: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/agents', label: 'Agents', icon: Bot },
  { to: '/app/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/app/activity', label: 'Activity', icon: Receipt },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const live = useLive()
  const pending = live.approvals.filter((approval) => approval.status === 'pending').length

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-6">
      <Link to="/" aria-label="Oryne, back to the website" className="px-3 text-[0.9375rem]">
        <Wordmark />
      </Link>
      <p className="mt-3 inline-flex items-center gap-2 self-start rounded-full border border-cream/20 px-3 py-1 text-xs text-cream/70">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-burgundy" />
        {live.info?.network ?? 'stellar'}
      </p>

      <nav aria-label="Dashboard" className="mt-7">
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200',
                    isActive ? 'bg-cream/10 text-cream' : 'text-cream/65 hover:bg-cream/5 hover:text-cream',
                  )
                }
              >
                <Icon icon={item.icon} size={18} />
                {item.label}
                {item.to === '/app/approvals' && pending > 0 && (
                  <span className="ml-auto min-w-5 rounded-full bg-cream px-1.5 text-center text-xs font-semibold tabular-nums text-charcoal">
                    {pending}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        {live.wallet && (
          <div className="border border-cream/15 p-4">
            <p className="type-label text-cream/60">Wallet · USDC</p>
            <p className="mt-3 text-2xl tracking-[-0.02em] tabular-nums">{live.wallet.balance}</p>
            <a
              href={explorerAccount(live.info?.network ?? '', live.wallet.id)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-cream/60 hover:text-cream"
            >
              {shortKey(live.wallet.id, 6, 6)} <Icon icon={ExternalLink} size={12} />
            </a>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-cream/15 px-1 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-cream/60">Owner · Freighter</p>
            <p className="truncate font-mono text-xs">{live.session ? shortKey(live.session.address, 6, 6) : ''}</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={live.signOut}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-cream/65 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <Icon icon={LogOut} size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shown until the owner signs in with Freighter, or while they have no wallet yet. */
function Gate() {
  const live = useLive()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('My agent wallet')

  const run = (task: () => Promise<void>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const signedIn = !!live.session

  return (
    <div className="tone-white flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Oryne, back to the website" className="text-[0.9375rem]">
          <Wordmark />
        </Link>
        <Panel className="mt-8">
          {!signedIn ? (
            <>
              <h1 className="text-2xl tracking-[-0.02em]">Sign in with Freighter</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Your Stellar wallet signs a one-time message to prove it&rsquo;s you. Later it signs
                every change to your agents&rsquo; limits. Oryne never holds your keys.
              </p>
              <Button className="mt-6 w-full" onClick={run(live.signIn)} disabled={busy || !live.info}>
                {busy ? 'Waiting for Freighter…' : 'Connect Freighter'}
              </Button>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Set Freighter to <strong>Testnet</strong>. No Freighter?{' '}
                <a href="https://www.freighter.app" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  Get it here
                </a>
                , or{' '}
                <Link to="/demo" className="underline underline-offset-4">
                  explore the demo
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl tracking-[-0.02em]">Create your agent wallet</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Oryne deploys a wallet contract on Stellar that you own. Your agents spend from it,
                only inside the limits you give them. Oryne pays the network fee.
              </p>
              <div className="mt-6">
                <Field label="Name">
                  {(id) => <input id={id} value={name} onChange={(event) => setName(event.target.value)} className={inputClasses} />}
                </Field>
              </div>
              <Button className="mt-6 w-full" onClick={run(() => live.createWallet(name))} disabled={busy}>
                {busy ? 'Deploying on Stellar…' : 'Create wallet'}
              </Button>
              <button type="button" onClick={live.signOut} className="mt-4 text-xs text-muted underline underline-offset-4">
                Use a different account
              </button>
            </>
          )}
          {(error || (!live.info && live.error)) && (
            <p role="alert" className="mt-5 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
              {error ?? live.error}
            </p>
          )}
        </Panel>
        <p className="mt-4 text-center text-xs text-muted">API: {API_URL}</p>
      </div>
    </div>
  )
}

function Shell() {
  const live = useLive()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.title = 'Dashboard — Oryne'
  }, [])

  if (live.loading) {
    return <div className="tone-white flex min-h-svh items-center justify-center text-sm text-muted">Loading…</div>
  }
  if (!live.session || !live.wallet) return <Gate />

  return (
    <div className="tone-white min-h-svh lg:pl-64">
      <aside className="tone-charcoal fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto lg:block">
        <Sidebar />
      </aside>
      <header className="tone-charcoal sticky top-0 z-30 flex h-16 items-center justify-between px-5 lg:hidden">
        <Link to="/" aria-label="Oryne, back to the website" className="text-[0.9375rem]">
          <Wordmark />
        </Link>
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="-mr-2.5 flex size-11 items-center justify-center"
        >
          <Icon icon={menuOpen ? X : Menu} size={24} />
        </button>
      </header>
      {menuOpen && (
        <div className="tone-charcoal fixed inset-x-0 bottom-0 top-16 z-20 overflow-y-auto lg:hidden">
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </div>
      )}
      <main className="min-h-svh p-3 md:p-4">
        {live.error && (
          <p role="alert" className="mb-3 border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy md:mb-4">
            {live.error}
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}

/** The real dashboard: Stellar testnet, Freighter as the owner's wallet. */
export function LiveLayout() {
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  )
}

