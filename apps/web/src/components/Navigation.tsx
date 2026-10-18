import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
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

export function Navigation() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const close = () => setOpen(false)
  const account = { to: '/app', label: 'Dashboard' }

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
              <Link
                to={account.to}
                className="rounded-full px-4 py-2 text-sm text-charcoal/65 transition-colors hover:text-charcoal max-lg:hidden"
              >
                {account.label}
              </Link>
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
            <div className="mt-auto pt-10 text-center" onClick={close}>
              <Button to={CONNECT_PATH} variant="light" className="w-full">
                Connect agent
              </Button>
              <Link to={account.to} className="type-label mt-6 inline-block py-2 text-cream/70">
                {account.label}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
