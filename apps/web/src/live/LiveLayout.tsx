import {
  Bot,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import githubLogo from '../assets/github.svg'
import googleLogo from '../assets/google.svg'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { shortKey } from '../lib/network'
import { cn } from '../lib/cn'
import { Field, inputClasses, Panel } from '../app/ui'
import { api, API_URL, explorerAccount, isAccount, oauthStart, type Session } from './api'
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
            <p className="text-xs text-cream/60">
              Owner · {live.wallet?.owner_kind === 'passkey' ? 'passkey' : 'Freighter'}
            </p>
            <p className="truncate text-xs">
              {live.user?.email ?? live.user?.name ?? (live.session ? shortKey(live.session.address, 6, 6) : '')}
            </p>
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

const providerLogos = { google: googleLogo, github: githubLogo }

const providerButton =
  'flex h-12 w-full items-center justify-center gap-3 rounded-full border border-taupe/70 bg-white text-sm font-medium transition-colors hover:border-charcoal disabled:pointer-events-none disabled:opacity-45'

/** Shown until the owner signs in, or while they have no wallet yet. */
function Gate() {
  const live = useLive()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('My agent wallet')

  const run = (label: string, task: () => Promise<void>) => async () => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const auth = live.info?.auth
  const passkeyOwner = !!live.session && !isAccount(live.session.address)

  return (
    <div className="tone-white flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Oryne, back to the website" className="text-[0.9375rem]">
          <Wordmark />
        </Link>
        <Panel className="mt-8">
          {!live.session ? (
            <>
              <h1 className="text-2xl tracking-[-0.02em]">Sign in to Oryne</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Your agents spend from a wallet you own on Stellar. Oryne never holds its keys.
              </p>

              <div className="mt-6 space-y-2.5">
                {(['google', 'github'] as const).map((provider) => (
                  <a
                    key={provider}
                    href={auth?.[provider] ? oauthStart(provider) : undefined}
                    aria-disabled={!auth?.[provider]}
                    title={auth?.[provider] ? undefined : `${provider === 'google' ? 'Google' : 'GitHub'} sign-in is not set up on this server yet`}
                    className={cn(providerButton, !auth?.[provider] && 'pointer-events-none opacity-45')}
                  >
                    <img src={providerLogos[provider]} alt="" width={18} height={18} className="size-[18px]" />
                    Continue with {provider === 'google' ? 'Google' : 'GitHub'}
                  </a>
                ))}
                <button
                  type="button"
                  className={providerButton}
                  onClick={run('freighter', live.signIn)}
                  disabled={!!busy || !live.info}
                >
                  <Icon icon={Wallet} size={18} />
                  {busy === 'freighter' ? 'Waiting for Freighter…' : 'Continue with Freighter'}
                </button>
                {auth?.dev && (
                  <button
                    type="button"
                    className={cn(providerButton, 'border-dashed')}
                    disabled={!!busy}
                    onClick={run('dev', async () => {
                      const subject = `dev:${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
                      live.adoptSession(await api<Session>('/v1/auth/dev', { body: { subject } }))
                    })}
                  >
                    Continue as a test user (testnet)
                  </button>
                )}
              </div>

              <p className="mt-5 text-xs leading-relaxed text-muted">
                With Google or GitHub, a passkey on this device (Face ID, Touch ID, Windows Hello)
                owns your wallet: no extension, no recovery phrase. Freighter users sign with their
                Stellar account instead. Or{' '}
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
                {passkeyOwner
                  ? 'Your device will create a passkey that owns this wallet. You use it to approve changes; the key never leaves your device.'
                  : 'Oryne deploys a wallet contract on Stellar owned by your Freighter account.'}{' '}
                Oryne pays the network fee.
              </p>
              <div className="mt-6">
                <Field label="Name">
                  {(id) => (
                    <input id={id} value={name} onChange={(event) => setName(event.target.value)} className={inputClasses} />
                  )}
                </Field>
              </div>
              <Button className="mt-6 w-full" onClick={run('create', () => live.createWallet(name))} disabled={!!busy}>
                {busy ? (passkeyOwner ? 'Creating passkey and wallet…' : 'Deploying on Stellar…') : passkeyOwner ? 'Create passkey and wallet' : 'Create wallet'}
              </Button>
              <button type="button" onClick={live.signOut} className="mt-4 text-xs text-muted underline underline-offset-4">
                Use a different account
              </button>
            </>
          )}
          {(error || live.error) && (
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

