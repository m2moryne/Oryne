import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { navLinks } from '../lib/site'
import { Button } from './Button'
import { Icon } from './Icon'
import { Container } from './Section'
import { Wordmark } from './Wordmark'

export function Navigation() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 1280px)')
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
      {/* Dark glass bar: the page shows through, softened. Solid while the mobile menu is open. */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b border-cream/15 text-cream [--tone-accent:var(--color-cream)]',
          open ? 'bg-charcoal' : 'bg-charcoal/80 backdrop-blur-xl backdrop-saturate-150',
        )}
      >
        <Container className="grid h-(--nav-h) grid-cols-[1fr_auto_1fr] items-center">
          <Link
            to="/"
            onClick={close}
            aria-label="Oryne, home"
            className="justify-self-start text-[0.9375rem]"
          >
            <Wordmark />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-10 xl:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  cn(
                    'type-label border-b py-2 transition-colors duration-300 ease-quiet',
                    isActive
                      ? 'border-cream text-cream'
                      : 'border-transparent text-cream/70 hover:text-cream',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="col-start-3 justify-self-end">
            <Button to="/contact" variant="light" size="sm" className="max-xl:hidden">
              Start a conversation
            </Button>
            <button
              type="button"
              className="-mr-2.5 flex size-11 items-center justify-center xl:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon icon={open ? X : Menu} size={24} />
            </button>
          </div>
        </Container>
      </header>

      {open && (
        <div
          id="mobile-menu"
          className="tone-charcoal fixed inset-x-0 bottom-0 top-(--nav-h) z-40 overflow-y-auto xl:hidden"
        >
          <Container className="flex min-h-full flex-col pb-10 pt-8">
            <nav aria-label="Mobile">
              <ul>
                {navLinks.map((link) => (
                  <li key={link.to} className="border-b border-line">
                    <NavLink
                      to={link.to}
                      end
                      onClick={close}
                      className={({ isActive }) =>
                        cn(
                          'block py-5 text-3xl tracking-[-0.03em]',
                          isActive ? 'text-cream' : 'text-cream/60',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-auto pt-10" onClick={close}>
              <Button to="/contact" variant="light" className="w-full">
                Start a conversation
              </Button>
            </div>
          </Container>
        </div>
      )}
    </>
  )
}
