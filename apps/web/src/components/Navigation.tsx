import { ChevronDown, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { loadSession } from '../live/api'
import { cn } from '../lib/cn'
import { navLinks } from '../lib/site'
import { Button } from './Button'
import { Icon } from './Icon'
import { Wordmark } from './Wordmark'

/** Opens the dashboard with the connect-agent flow ready; signs the visitor in first if needed. */
const CONNECT_PATH = '/app/agents?connect=1'

/** Frosted white glass that reads over both light and dark sections. */
const glass =
  'border border-charcoal/10 bg-white/70 shadow-[0_8px_32px_-12px_rgba(32,32,32,0.25)] backdrop-blur-xl backdrop-saturate-150'

/**
 * One way in, two places to land. Both sign in the same way; the choice is
 * only where you arrive afterwards.
 */
const signInOptions = [
  { to: '/app', title: 'As a user', text: 'Your wallet, agents, limits and approvals' },
  { to: '/app/developers', title: 'As a developer', text: 'API keys, playground, logs and webhooks' },
]

/** "Sign in" with a small menu: user (dashboard) or developer (developer console). */
function SignInMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative max-lg:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="sign-in-menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-charcoal/65 transition-colors hover:text-charcoal"
      >
        Sign in
        <Icon icon={ChevronDown} size={14} className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          id="sign-in-menu"
          role="menu"
          aria-label="Sign in as"
          className="absolute right-0 top-full mt-3 w-72 rounded-2xl border border-charcoal/10 bg-white p-2 shadow-[0_16px_40px_-16px_rgba(32,32,32,0.35)]"
        >
          {signInOptions.map((option) => (
            <Link
              key={option.to}
              to={option.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 transition-colors hover:bg-charcoal/[0.05] focus-visible:bg-charcoal/[0.05]"
            >
              <span className="block text-sm font-medium text-charcoal">{option.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{option.text}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function Navigation() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const close = () => setOpen(false)
  // Signed in already: straight to the dashboard. Otherwise: sign in, as a user or a developer.
  const [signedIn] = useState(() => loadSession() !== null)

  // A touch more solid once the page scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onBreakpoint = () => desktop.matches && setOpen(false)

    document.addEventListener('keydown', onKeyDown)
    desktop.addEventListener('change', onBreakpoint)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', onBreakpoint)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3 md:top-4 md:px-6">
        {/* Solid while the mobile menu is open, so the bar reads over it. */}
        <div
          className={cn(
            'pointer-events-auto mx-auto max-w-5xl rounded-full text-charcoal transition-colors duration-300 [--tone-accent:var(--color-burgundy)]',
            glass,
            scrolled && 'bg-white/85',
            open && 'bg-white',
          )}
        >
          <div className="flex h-14 items-center gap-4 pl-6 pr-2">
            <Link to="/" onClick={close} aria-label="Oryne, home" className="shrink-0 text-[0.9375rem]">
              <Wordmark />
            </Link>

            <nav aria-label="Primary" className="mx-auto hidden items-center gap-1 lg:flex">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-4 py-2 text-sm transition-colors duration-200',
                      isActive ? 'bg-charcoal/[0.07] text-charcoal' : 'text-charcoal/65 hover:text-charcoal',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              {signedIn ? (
                <Link
                  to="/app"
                  className="rounded-full px-4 py-2 text-sm text-charcoal/65 transition-colors hover:text-charcoal max-lg:hidden"
                >
                  Dashboard
                </Link>
              ) : (
                <SignInMenu />
              )}
              <Button to={CONNECT_PATH} variant="accent" size="sm" className="max-lg:hidden">
                Connect agent
              </Button>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full hover:bg-charcoal/[0.06] lg:hidden"
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                aria-controls="mobile-menu"
                onClick={() => setOpen((value) => !value)}
              >
                <Icon icon={open ? X : Menu} size={22} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen menu below the floating bar; the page behind it doesn't scroll. */}
      {open && (
        <div id="mobile-menu" className="tone-charcoal fixed inset-0 z-40 overflow-y-auto pt-20 md:pt-24 lg:hidden">
          <div className="flex min-h-full flex-col px-6 pb-10 pt-4 md:px-10">
            <nav aria-label="Mobile">
              <ul>
                {navLinks.map((link) => (
                  <li key={link.to} className="border-b border-line">
                    <NavLink
                      to={link.to}
                      end
                      onClick={close}
                      className={({ isActive }) =>
                        cn('block py-5 text-3xl tracking-[-0.03em]', isActive ? 'text-cream' : 'text-cream/60')
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-auto grid gap-3 pt-10" onClick={close}>
              <Button to={CONNECT_PATH} variant="light" className="w-full">
                Connect agent
              </Button>
              {signedIn ? (
                <Button to="/app" variant="outlineLight" className="w-full">
                  Dashboard
                </Button>
              ) : (
                signInOptions.map((option) => (
                  <Button key={option.to} to={option.to} variant="outlineLight" className="w-full">
                    Sign in {option.title.toLowerCase()}
                  </Button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
