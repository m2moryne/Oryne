import {
  Bot,
  ClipboardCheck,
  Coins,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import githubLogo from '../assets/github.svg'
import googleLogo from '../assets/google.svg'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { usePageMeta } from '../hooks/usePageMeta'
import { shortKey } from '../lib/network'
import { cn } from '../lib/cn'
import { privatePages } from '../lib/seo'
import { ThemeToggle, useTheme } from '../app/theme'
import { Field, inputClasses } from '../app/ui'
import { SignInField } from '../components/SignInField'
import { api, explorerAccount, loadSession, oauthStart, type Session } from './api'
import { DEV_BASE, LiveDevShell } from './dev/LiveDevShell'
import { LiveProvider, useLive } from './LiveContext'
import { CreateWallet } from './CreateWallet'
import { AccountSwitcher, TeamNotice } from './TeamBar'
import { LiveBanner, SidebarModeToggle } from './ModeControl'
import { Loader } from '../components/Loader'
import type { AccountKind } from './api'

const items: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/agents', label: 'Agents', icon: Bot },
  { to: '/app/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/app/wallet', label: 'Wallet', icon: ShieldCheck },
  { to: '/app/funds', label: 'Funds', icon: Coins },
  { to: '/app/services', label: 'Services', icon: Store },
  { to: '/app/activity', label: 'Activity', icon: Receipt },
  { to: '/app/team', label: 'Team', icon: Users },
  { to: '/app/billing', label: 'Billing', icon: CreditCard },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/** Pages both sides have; anything else lands on the other side's overview. */
const shared = ['agents', 'approvals', 'funds', 'settings', 'team', 'billing']

/** The same page on the other side, for links that cross from one dashboard to the other. */
function sidePath(pathname: string, kind: AccountKind) {
  const from = kind === 'developer' ? '/app' : DEV_BASE
  const to = kind === 'developer' ? DEV_BASE : '/app'
  const rest = pathname.slice(from.length)
  return shared.includes(rest.split('/')[1] ?? '') ? `${to}${rest}` : to
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const live = useLive()
  const [theme, setTheme] = useTheme('light')
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

      <div className="mt-6">
        <SidebarModeToggle />
      </div>

      <nav aria-label="Dashboard" className="mt-6">
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
        <AccountSwitcher />
        {live.wallet && (
          <div className="border border-cream/15 p-4">
            <p className="type-label text-cream/60">{live.info?.network === 'stellar-mainnet' ? 'Live wallet · Mainnet' : 'Test wallet · Testnet'}</p>
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
              {live.member
                ? `${live.member.role[0].toUpperCase()}${live.member.role.slice(1)} · team account`
                : `Owner · ${live.wallet?.owner_kind === 'passkey' ? 'passkey' : 'Freighter'}`}
            </p>
            <p className="truncate text-xs">
              {live.member?.email ?? live.user?.email ?? live.user?.name ?? (live.session ? shortKey(live.session.address, 6, 6) : '')}
            </p>
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} onDark />
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

const backLink =
  'mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm text-muted transition-colors duration-200 hover:text-charcoal'

/** The sign-in pages' frame: a quiet animation on the left from large screens up, the card on the right. */
function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="tone-white grid min-h-svh lg:grid-cols-2">
      <div className="tone-charcoal relative hidden overflow-hidden lg:block">
        <SignInField className="absolute inset-0 size-full" />
      </div>
      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}

/** Shown until the owner signs in, or while they have no wallet yet. */
function Gate() {
  const live = useLive()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { pathname } = useLocation()
  // Continue with email: enter the address, then the code sent to it.
  const [emailStep, setEmailStep] = useState<'address' | 'code' | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

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

  const sendCode = run('email', async () => {
    await api('/v1/auth/email/start', { body: { email } })
    setCode('')
    setEmailStep('code')
  })
  const verifyCode = run('code', async () => {
    live.adoptSession(await api<Session>('/v1/auth/email/verify', { body: { email, code } }))
  })
  const submit = (action: () => Promise<void>) => (event: FormEvent) => {
    event.preventDefault()
    void action()
  }

  const auth = live.info?.auth
  const shownError = error ?? live.error

  return (
    <AuthFrame>
      {!live.session && emailStep === 'address' ? (
        <form onSubmit={submit(sendCode)}>
          <h1 className="text-center text-3xl tracking-[-0.02em]">Continue with email</h1>
          <p className="mt-2 text-center text-sm text-muted">We’ll send you a code to sign in.</p>
          <div className="mt-8">
            <Field label="Email">
              {(id) => (
                <input
                  id={id}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClasses}
                />
              )}
            </Field>
          </div>
          <Button type="submit" className="mt-5 w-full" disabled={!!busy || !email.trim()}>
            {busy === 'email' ? 'Sending…' : 'Send code'}
          </Button>
          <button type="button" className={backLink} onClick={() => (setEmailStep(null), setError(null))}>
            Back
          </button>
        </form>
      ) : !live.session && emailStep === 'code' ? (
        <form onSubmit={submit(verifyCode)}>
          <h1 className="text-center text-3xl tracking-[-0.02em]">Check your email</h1>
          <p className="mt-2 text-center text-sm text-muted">
            Enter the code we sent to <span className="text-charcoal">{email}</span>
          </p>
          <input
            aria-label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={cn(inputClasses, 'mt-8 text-center font-mono text-2xl tracking-[0.5em]')}
          />
          <Button type="submit" className="mt-5 w-full" disabled={!!busy || code.length !== 6}>
            {busy === 'code' ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="mt-4 flex justify-center gap-6 text-xs text-muted">
            <button type="button" className="underline-offset-4 hover:underline" disabled={!!busy} onClick={() => void sendCode()}>
              {busy === 'email' ? 'Sending…' : 'Send a new code'}
            </button>
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => (setEmailStep('address'), setError(null))}>
              Use a different email
            </button>
          </div>
        </form>
      ) : !live.session ? (
        <>
          <div className="text-center">
            <h1 className="text-3xl tracking-[-0.02em]">Your agents are waiting</h1>
            <p className="mt-2 text-sm text-muted">Sign in to see what they’ve been up to.</p>
          </div>

          <div className="mt-8 space-y-2.5">
            {(['google', 'github'] as const).map((provider) => {
              // Ready unless the server is known not to offer it: the API may still be waking up.
              const off = !!auth && !auth[provider]
              return (
                <a
                  key={provider}
                  href={off ? undefined : oauthStart(provider, pathname)}
                  aria-disabled={off}
                  title={off ? `${provider === 'google' ? 'Google' : 'GitHub'} sign-in is not set up on this server yet` : undefined}
                  className={cn(providerButton, off && 'pointer-events-none opacity-45')}
                >
                  <img src={providerLogos[provider]} alt="" width={18} height={18} className="size-[18px]" />
                  Continue with {provider === 'google' ? 'Google' : 'GitHub'}
                </a>
              )
            })}
            <button
              type="button"
              className={providerButton}
              // Off only when the server says so; older API builds don't report it.
              disabled={!!busy || auth?.email === false}
              title={auth?.email === false ? 'Email sign-in is not set up on this server yet' : undefined}
              onClick={() => (setEmailStep('address'), setError(null))}
            >
              <Icon icon={Mail} size={18} />
              Continue with email
            </button>
            <button type="button" className={providerButton} onClick={run('freighter', live.signIn)} disabled={!!busy}>
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


          <Link to="/" className={backLink}>
            Cancel
          </Link>
        </>
      ) : (
        <CreateWallet />
      )}
      {shownError && (
        <p role="alert" className="mt-5 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
          {shownError}
        </p>
      )}
    </AuthFrame>
  )
}

/** Sets a not-yet-chosen account to developer, then the console opens. */
function BecomeDeveloper() {
  const live = useLive()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    live.setKind('developer').catch(() => setFailed(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return failed ? <Navigate to="/app" replace /> : <Loader screen />
}

/** An agent-wallet account opened the developer console: explain, and offer to switch. */
function ConsolePrompt() {
  const live = useLive()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      await live.setKind('developer')
    } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }
  return (
    <AuthFrame>
      <h1 className="text-2xl tracking-[-0.02em]">Open the developer console?</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Your account is set up to give your agents a wallet, so it opens the agent dashboard. The developer console has API
        keys, SDKs, logs and webhooks for building agents or a paid API.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Switching keeps your wallet, agents and payments. You can switch back any time in Settings.
      </p>
      <Button className="mt-8 w-full" onClick={open} disabled={busy}>
        {busy ? 'Switching…' : 'Switch to the developer console'}
      </Button>
      <Link to="/app" className={cn(backLink, 'block text-center')}>
        Go to my agent dashboard
      </Link>
      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
          {error}
        </p>
      )}
    </AuthFrame>
  )
}

function Shell() {
  const live = useLive()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme] = useTheme('light')

  usePageMeta(privatePages.dashboard)

  // Each kind of account sees only its own side: owners the agent dashboard, developers the console.
  const inConsole = pathname === DEV_BASE || pathname.startsWith(`${DEV_BASE}/`)
  // Signed in already (a reload, or a switch between test and live): keep the
  // dashboard's frame on screen while it loads, not a blank page.
  if (live.loading) return loadSession() ? <ShellSkeleton console={inConsole} /> : <Loader screen />
  if (!live.session || !live.wallet) return <Gate />
  if (live.kind === 'developer' && !inConsole) return <Navigate to={sidePath(pathname, 'developer')} replace />
  if (live.kind === 'owner' && inConsole) {
    // A teammate can't change the account's kind: back to the side the account uses.
    if (live.member) return <Navigate to={sidePath(pathname, 'owner')} replace />
    // Arrived through Developers and never picked a kind: that's the pick.
    if (!live.kindChosen) return <BecomeDeveloper />
    return <ConsolePrompt />
  }
  // Adding money is a page of its own, without the dashboard around it.
  if (pathname === '/app/add-money' || pathname === `${DEV_BASE}/add-money`) return <Outlet />
  if (inConsole) return <LiveDevShell />

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
      <main className={cn('min-h-svh p-3 md:p-4', theme === 'dark' && 'theme-dark tone-cream')}>
        {live.error && (
          <p role="alert" className="mb-3 border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy md:mb-4">
            {live.error}
          </p>
        )}
        <LiveBanner className="mb-3 md:mb-4" />
        <TeamNotice className="mb-3 md:mb-4" />
        <Outlet />
      </main>
    </div>
  )
}

/** The dashboard's frame with nothing in it yet: dark sidebar, page colour, a small loader. */
function ShellSkeleton({ console }: { console: boolean }) {
  const [theme] = useTheme(console ? 'dark' : 'light')
  return (
    <div className="tone-white min-h-svh lg:pl-64">
      <aside className="tone-charcoal fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-cream/10 px-6 py-6 lg:block">
        <Wordmark />
      </aside>
      <header className="tone-charcoal sticky top-0 z-30 flex h-16 items-center px-5 lg:hidden">
        <Wordmark />
      </header>
      <main
        className={cn(
          'flex min-h-[calc(100svh-4rem)] items-center justify-center lg:min-h-svh',
          console ? 'tone-cream' : '',
          theme === 'dark' && 'theme-dark tone-cream',
        )}
      >
        <Loader />
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

