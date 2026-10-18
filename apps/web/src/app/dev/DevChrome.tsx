import { BookOpen, ChevronDown, LayoutDashboard, LogOut } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { initials } from '../format'
import { accountPages, devGroups, devPath } from './devNav'
import type { Mode } from './devData'

const segment = 'flex-1 py-1.5 text-center text-xs font-medium transition-colors duration-200'

/** "Agents | Developers": the two halves of the dashboard, for the top of the sidebar. */
export function AreaSwitch({
  current,
  agents,
  developers,
  onNavigate,
}: {
  current: 'agents' | 'developers'
  agents: string
  developers: string
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Dashboard area" className="flex border border-cream/20 p-1">
      {(
        [
          ['agents', 'Agents', agents],
          ['developers', 'Developers', developers],
        ] as const
      ).map(([key, label, to]) => (
        <Link
          key={key}
          to={to}
          onClick={onNavigate}
          aria-current={key === current ? 'page' : undefined}
          className={cn(segment, key === current ? 'bg-cream text-charcoal' : 'text-cream/65 hover:text-cream')}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

/** The developer console's grouped page list, for a dark sidebar. */
export function DevSidebarNav({ base, onNavigate }: { base: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Developers" className="space-y-5">
      {devGroups.map((group) => (
        <div key={group.heading ?? 'main'}>
          {group.heading && <p className="type-label mb-2 px-3 text-cream/45">{group.heading}</p>}
          <ul className="space-y-0.5">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <NavLink
                  to={devPath(base, page.slug)}
                  end={!page.slug}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200',
                      isActive ? 'bg-cream/10 text-cream' : 'text-cream/65 hover:bg-cream/5 hover:text-cream',
                    )
                  }
                >
                  <Icon icon={page.icon} size={18} />
                  {page.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Test / live switch. Green when live, so it's never on by accident unnoticed. */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const live = mode === 'live'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      aria-label="Live mode"
      onClick={() => onChange(live ? 'test' : 'live')}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-full border pl-3 pr-1.5 text-xs font-medium transition-colors duration-200',
        live ? 'border-green/50 text-green' : 'border-taupe/70 text-muted hover:text-charcoal',
      )}
    >
      {live ? 'Live mode' : 'Test mode'}
      <span
        aria-hidden="true"
        className={cn('relative h-5 w-9 rounded-full transition-colors duration-200', live ? 'bg-green' : 'bg-taupe/60')}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-paper shadow-sm transition-transform duration-200',
            live && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

const menuItem =
  'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-charcoal transition-colors hover:bg-charcoal/[0.06]'

/** The account button, top right, and its menu of account pages and links. */
export function AccountMenu({
  name,
  email,
  base,
  ownerDashboard,
  signOutLabel,
  onSignOut,
}: {
  name: string
  email: string
  /** Developer console base path, for Settings, Team and Billing. */
  base: string
  ownerDashboard: string
  signOutLabel: string
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full border border-taupe/70 pl-1 pr-2.5 transition-colors hover:border-charcoal"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-charcoal text-[0.6875rem] font-semibold text-cream">
          {initials(name)}
        </span>
        <span className="hidden max-w-36 truncate text-sm sm:block">{name}</span>
        <Icon icon={ChevronDown} size={14} className="text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-64 border border-taupe/50 bg-white py-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]"
        >
          <div className="border-b border-taupe/40 px-4 pb-3 pt-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          <div className="py-1.5">
            {accountPages.map((page) => (
              <Link key={page.slug} role="menuitem" to={devPath(base, page.slug)} onClick={close} className={menuItem}>
                <Icon icon={page.icon} size={16} className="text-muted" />
                {page.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-taupe/40 py-1.5">
            <Link role="menuitem" to={ownerDashboard} onClick={close} className={menuItem}>
              <Icon icon={LayoutDashboard} size={16} className="text-muted" />
              Owner dashboard
            </Link>
            <Link role="menuitem" to="/docs" onClick={close} className={menuItem}>
              <Icon icon={BookOpen} size={16} className="text-muted" />
              Documentation
            </Link>
          </div>
          <div className="border-t border-taupe/40 pt-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                onSignOut()
              }}
              className={menuItem}
            >
              <Icon icon={LogOut} size={16} className="text-muted" />
              {signOutLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The console's top bar: what you're looking at on the left, mode and account on the right. */
export function DevTopBar({
  mode,
  onMode,
  account,
  extra,
}: {
  mode: Mode
  onMode: (mode: Mode) => void
  account: Parameters<typeof AccountMenu>[0]
  /** Shown before the mode switch, e.g. the light / dark toggle. */
  extra?: ReactNode
}) {
  return (
    // Sticks under the mobile header (h-16) or to the top on desktop; bleeds over main's padding.
    <div className="sticky top-16 z-20 -mx-3 -mt-3 mb-3 flex items-center justify-between gap-3 border-b border-taupe/40 bg-cream/90 px-3 py-3 backdrop-blur-md md:-mx-4 md:-mt-4 md:mb-4 md:px-4 lg:top-0">
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', mode === 'live' ? 'bg-green' : 'bg-taupe')}
        />
        <span className="truncate">{mode === 'live' ? 'Viewing live data' : 'Viewing test data'}</span>
      </p>
      <div className="flex items-center gap-2">
        {extra}
        <ModeSwitch mode={mode} onChange={onMode} />
        <AccountMenu {...account} />
      </div>
    </div>
  )
}
