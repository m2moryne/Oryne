import {
  Bot,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Receipt,
  Sparkles,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import githubLogo from '../assets/github.svg'
import googleLogo from '../assets/google.svg'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { usePageMeta } from '../hooks/usePageMeta'
import { shortKey } from '../lib/network'
import { cn } from '../lib/cn'
import { privatePages } from '../lib/seo'
import { AreaSwitch } from '../app/dev/DevChrome'
import { ThemeToggle, useTheme } from '../app/theme'
import { PREVIEW_ON, useEnterPreview } from '../app/preview'
import { Field, inputClasses } from '../app/ui'
import { SignInField } from '../components/SignInField'
import { api, explorerAccount, isAccount, oauthStart, type Session } from './api'
import { DEV_BASE, LiveDevShell } from './dev/LiveDevShell'
import { LiveProvider, useLive } from './LiveContext'

const items: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/agents', label: 'Agents', icon: Bot },
  { to: '/app/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/app/activity', label: 'Activity', icon: Receipt },
]

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
        <AreaSwitch current="agents" agents="/app" developers={DEV_BASE} onNavigate={onNavigate} />
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
  const enterPreview = useEnterPreview()
  // The preview (/demo, /dev) sends visitors here; "Explore a preview account" takes them back.
  const from = (useLocation().state as { from?: string } | null)?.from
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('My agent wallet')
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
  const passkeyOwner = !!live.session && !isAccount(live.session.address)
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
                  href={off ? undefined : oauthStart(provider)}
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

          {PREVIEW_ON && (
            <>
              <p className="mt-6 flex items-center gap-4 text-xs text-muted">
                <span className="h-px flex-1 bg-taupe/60" />
                or
                <span className="h-px flex-1 bg-taupe/60" />
              </p>
              <button
                type="button"
                className={cn(providerButton, 'mt-6')}
                onClick={() => enterPreview(from && /^\/(demo|dev)(\/|$)/.test(from) ? from : '/demo')}
              >
                <Icon icon={Sparkles} size={18} />
                Explore a preview account
              </button>
            </>
          )}

          <Link to="/" className={backLink}>
            Cancel
          </Link>
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
              {(id) => <input id={id} value={name} onChange={(event) => setName(event.target.value)} className={inputClasses} />}
            </Field>
          </div>
          <Button className="mt-6 w-full" onClick={run('create', () => live.createWallet(name))} disabled={!!busy}>
            {busy
              ? passkeyOwner
                ? 'Creating passkey and wallet…'
                : 'Deploying on Stellar…'
              : passkeyOwner
                ? 'Create passkey and wallet'
                : 'Create wallet'}
          </Button>
          <button type="button" onClick={live.signOut} className="mt-4 text-xs text-muted underline underline-offset-4">
            Use a different account
          </button>
        </>
      )}
      {shownError && (
        <p role="alert" className="mt-5 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
          {shownError}
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

  if (live.loading) {
    return <div className="tone-white flex min-h-svh items-center justify-center text-sm text-muted">Loading…</div>
  }
  if (!live.session || !live.wallet) return <Gate />
  if (pathname.startsWith(DEV_BASE)) return <LiveDevShell />

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

