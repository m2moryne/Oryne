import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useOutletContext } from 'react-router-dom'
import { DevSidebarNav, DevTopBar } from '../../app/dev/DevChrome'
import { useModeChange } from '../ModeControl'
import { ThemeToggle, useTheme } from '../../app/theme'
import type { Mode } from '../api'
import { Icon } from '../../components/Icon'
import { Wordmark } from '../../components/Wordmark'
import { cn } from '../../lib/cn'
import { shortKey } from '../../lib/network'
import { useLive } from '../LiveContext'
import { TeamNotice } from '../TeamBar'

export const DEV_BASE = '/app/developers'
export const useDevMode = () => useOutletContext<{ mode: Mode }>().mode

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const live = useLive()
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
        <DevSidebarNav base={DEV_BASE} onNavigate={onNavigate} />
      </div>
    </div>
  )
}

/** The developer console for a signed-in developer account. */
export function LiveDevShell() {
  const live = useLive()
  const [menuOpen, setMenuOpen] = useState(false)
  const { mode, change: setMode, dialog: modeDialog } = useModeChange()
  const [theme, setTheme] = useTheme('dark')

  // A teammate is shown as themselves, not as the account's owner.
  const name = live.member ? live.member.email : (live.user?.name ?? live.user?.email ?? 'Your account')
  const email = live.member
    ? `${live.member.role[0].toUpperCase()}${live.member.role.slice(1)} · team account`
    : (live.user?.email ?? (live.session ? shortKey(live.session.address, 6, 6) : ''))

  return (
    <div className="tone-white min-h-svh lg:pl-64">
      <aside className="tone-charcoal fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-cream/10 lg:block">
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

      <main className={cn('tone-cream flex min-h-[calc(100svh-4rem)] flex-col p-3 md:p-4 lg:min-h-svh', theme === 'dark' && 'theme-dark')}>
        <DevTopBar
          mode={mode}
          onMode={setMode}
          extra={<ThemeToggle theme={theme} onChange={setTheme} />}
          account={{ name, email, base: DEV_BASE, signOutLabel: 'Sign out', onSignOut: live.signOut }}
        />
        {modeDialog}
        {live.error && (
          <p role="alert" className="mb-3 border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy md:mb-4">
            {live.error}
          </p>
        )}
        <TeamNotice className="mb-3 md:mb-4" />
        <Outlet context={{ mode }} />
      </main>
    </div>
  )
}
