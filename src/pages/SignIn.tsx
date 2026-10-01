import { ArrowRight, Bot, Receipt, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../app/store'
import { Field, inputClasses } from '../app/ui'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'

const points = [
  { icon: Bot, text: 'Connect an agent you already use. No code.' },
  { icon: Wallet, text: 'Give it a budget and a limit per purchase.' },
  { icon: Receipt, text: 'See everything it buys, as it happens.' },
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
  const destination = (location.state as { from?: string } | null)?.from ?? '/app'
  const [mode, setMode] = useState<'signin' | 'create'>('signin')

  if (state.user) return <Navigate to={destination} replace />

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const name = String(data.get('name') ?? '').trim() || nameFromEmail(email)
    dispatch({ type: 'signIn', user: { name, email } })
    navigate(destination, { replace: true })
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

          <div role="tablist" aria-label="Account" className="mt-8 flex rounded-full border border-taupe/70 bg-white p-1">
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
            This is a preview of the dashboard. Any email and password will let you in, nothing is
            sent anywhere, and the data inside is sample data.
          </p>
        </div>
      </div>
    </main>
  )
}
