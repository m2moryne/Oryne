import { ArrowRight, Bot, Receipt, Smile, Wallet } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../app/store'
import { Field, inputClasses } from '../app/ui'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { SocialIcon } from '../components/SocialIcon'
import { Wordmark } from '../components/Wordmark'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'

const points = [
  { icon: Bot, text: 'Connect an agent you already use. No code.' },
  { icon: Wallet, text: 'Give it a budget and a limit per purchase.' },
  { icon: Receipt, text: 'See everything it buys, as it happens.' },
]

const mark = (path: string) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
)

/**
 * Sign-in providers for developers. Google and GitHub use their monochrome
 * marks; Hugging Face has a stand-in icon until its official logo is added.
 */
const providers = [
  {
    name: 'Google',
    icon: mark(
      'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
    ),
  },
  { name: 'GitHub', icon: <SocialIcon id="github" size={18} /> },
  { name: 'Hugging Face', icon: <Icon icon={Smile} size={19} /> },
]

/** Turns "ada.lovelace@…" into "Ada Lovelace" when someone signs in without giving a name. */
function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ') || 'There'
}

/**
 * Sign-in for the dashboard preview. There is no backend, so nothing is
 * checked: the name and email are kept in this browser and the password is
 * never stored or sent anywhere.
 */
export default function SignIn() {
  usePageMeta('Sign in — Oryne', 'Sign in to connect your agents, set their budgets and see what they buy.')

  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const cameFrom = (location.state as { from?: string } | null)?.from
  const destination = cameFrom ?? '/app'
  const [mode, setMode] = useState<'signin' | 'create'>('signin')

  // Signing in re-renders this page before navigate() runs, so the redirect
  // below has to know where a provider button meant to go.
  const target = useRef<string | null>(null)

  if (state.user) return <Navigate to={target.current ?? destination} replace />

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const name = String(data.get('name') ?? '').trim() || nameFromEmail(email)
    dispatch({ type: 'signIn', user: { name, email, provider: 'Email' } })
    navigate(destination, { replace: true })
  }

  // No real OAuth in the preview: each button signs in as the same sample person.
  // People who arrive without a destination and use a developer login land in the console.
  const continueWith = (provider: string) => {
    target.current = cameFrom ?? '/dev'
    dispatch({ type: 'signIn', user: { name: 'Maya Chen', email: 'maya@brightwell.dev', provider } })
  }

  const creating = mode === 'create'

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="tone-charcoal hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <Link to="/" aria-label="Oryne, back to the website" className="text-[0.9375rem]">
          <Wordmark />
        </Link>

        <div>
          <p className="type-statement max-w-[12ch]">Give your agent a budget.</p>
          <ul className="mt-12 space-y-5">
            {points.map((point) => (
              <li key={point.text} className="flex items-center gap-4 text-muted">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-cream">
                  <Icon icon={point.icon} size={18} />
                </span>
                {point.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted">© {new Date().getFullYear()} Oryne</p>
      </div>

      <div className="tone-cream flex flex-col px-6 py-8 md:px-12">
        <Link to="/" aria-label="Oryne, back to the website" className="text-[0.9375rem] lg:hidden">
          <Wordmark />
        </Link>

        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <h1 className="text-4xl tracking-[-0.03em]">
            {creating ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-3 text-muted">
            {creating
              ? 'Then connect your first agent in about a minute.'
              : 'Sign in to see what your agents have been up to.'}
          </p>

          <div className="mt-8 space-y-2.5">
            {providers.map((provider) => (
              <button
                key={provider.name}
                type="button"
                onClick={() => continueWith(provider.name)}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-taupe/70 bg-white text-sm font-medium transition-colors duration-200 hover:border-charcoal"
              >
                {provider.icon}
                Continue with {provider.name}
              </button>
            ))}
          </div>

          <p className="mt-6 flex items-center gap-4 text-xs uppercase tracking-[0.18em] text-muted">
            <span className="h-px flex-1 bg-taupe/60" />
            or with email
            <span className="h-px flex-1 bg-taupe/60" />
          </p>

          <div role="tablist" aria-label="Account" className="mt-6 flex rounded-full border border-taupe/70 bg-white p-1">
            {(
              [
                ['signin', 'Sign in'],
                ['create', 'Create account'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex-1 rounded-full py-2.5 text-sm font-medium transition-colors duration-200',
                  mode === value ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-5">
            {creating && (
              <Field label="Name">
                {(fieldId) => (
                  <input id={fieldId} name="name" autoComplete="name" required className={inputClasses} />
                )}
              </Field>
            )}
            <Field label="Email">
              {(fieldId) => (
                <input
                  id={fieldId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClasses}
                />
              )}
            </Field>
            <Field label="Password">
              {(fieldId) => (
                <input
                  id={fieldId}
                  type="password"
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  minLength={creating ? 8 : undefined}
                  required
                  className={inputClasses}
                />
              )}
            </Field>

            <Button type="submit" icon={ArrowRight} className="w-full">
              {creating ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 rounded-lg border border-taupe/50 px-4 py-3 text-sm leading-relaxed text-muted">
            This is a preview. The provider buttons sign you in as a sample developer without
            contacting Google, GitHub or Hugging Face; any email and password also works. Nothing is
            sent anywhere.
          </p>
        </div>
      </div>
    </main>
  )
}
