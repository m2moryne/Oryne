import { Bot, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Receipt, ScrollText, Server, Sun, Users, Wallet, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/format'
import type { Theme } from '../lib/theme'
import { useAdmin } from './ui'

const items: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Users },
  { to: '/wallets', label: 'Wallets', icon: Wallet },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/payments', label: 'Payments', icon: Receipt },
  { to: '/requests', label: 'Requests', icon: ScrollText },
  { to: '/keys', label: 'API keys', icon: KeyRound },
  { to: '/system', label: 'System', icon: Server },
]

function Wordmark() {
  return (
    <span className="flex items-baseline gap-3">
      <span className="text-[0.9375rem] font-medium uppercase tracking-[0.34em]">Oryne</span>
      <span className="type-label text-paper/50">Admin</span>
    </span>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { network } = useAdmin()
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-6">
      <div className="px-3">
        <Wordmark />
      </div>
      <p className="mt-3 inline-flex items-center gap-2 self-start rounded-full border border-paper/20 px-3 py-1 text-xs text-paper/70">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#d97f8c]" />
        {network}
      </p>
      <nav aria-label="Admin" className="mt-7">
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                    isActive ? 'bg-paper/10 text-paper' : 'text-paper/65 hover:bg-paper/5 hover:text-paper',
                  )
                }
              >
                <item.icon size={18} aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-auto px-3 pt-6 text-xs leading-relaxed text-paper/45">Read-only. Changes happen in the product, signed by owners.</p>
    </div>
  )
}

export function Layout({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
  const { signOut } = useAdmin()
  const [menuOpen, setMenuOpen] = useState(false)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <div className="min-h-svh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 overflow-y-auto bg-ink text-paper lg:block">
        <Sidebar />
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-5 text-paper lg:hidden">
        <Wordmark />
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="-mr-2 flex size-10 items-center justify-center"
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-20 overflow-y-auto bg-ink text-paper lg:hidden">
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="sticky top-14 z-20 flex h-14 items-center justify-end gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:top-0">
        <button
          type="button"
          onClick={() => onTheme(next)}
          aria-label={`Switch to ${next} mode`}
          title={`Switch to ${next} mode`}
          className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-text"
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="flex h-9 items-center gap-2 rounded-full border border-line px-4 text-xs font-medium text-muted transition-colors hover:text-text"
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>

      <main className="space-y-4 p-4">
        <Outlet />
      </main>
    </div>
  )
}
