import {
  Bot,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  Terminal,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Wordmark } from '../components/Wordmark'
import { cn } from '../lib/cn'
import { AddFundsDialog } from './AddFundsDialog'
import { ConnectAgentDialog } from './ConnectAgentDialog'
import { initials, money } from './format'
import { useSimulatedActivity, useStore } from './store'

const items: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/agents', label: 'Agents', icon: Bot },
  { to: '/app/funds', label: 'Funds', icon: Wallet },
  { to: '/app/activity', label: 'Activity', icon: Receipt },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

type DashboardContext = { openConnect: () => void; openFunds: () => void }

/** Lets any dashboard page open the shared connect-agent and add-funds dialogs. */
export const useDashboard = () => useOutletContext<DashboardContext>()

function Sidebar({
  onNavigate,
  onAddFunds,
  onConnect,
}: {
  onNavigate?: () => void
  onAddFunds: () => void
  onConnect: () => void
}) {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const user = state.user!

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-6">
      <Link to="/" aria-label="Oryne, back to the website" className="px-3 text-[0.9375rem]">
        <Wordmark />
      </Link>

      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          onConnect()
        }}
        className="mt-8 flex h-10 w-full items-center justify-center gap-2.5 rounded-full bg-cream text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-charcoal transition-colors duration-300 hover:bg-burgundy hover:text-cream"
      >
        <Icon icon={Plus} size={16} />
        Connect agent
      </button>

      <nav aria-label="Dashboard" className="mt-6">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200',
                    isActive ? 'bg-cream/10 text-cream' : 'text-cream/65 hover:bg-cream/5 hover:text-cream',
                  )
                }
              >
                <Icon icon={item.icon} size={18} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-cream/15 p-4">
          <p className="type-label text-cream/60">Balance</p>
          <p className="mt-3 text-2xl tracking-[-0.02em] tabular-nums">{money(state.balance)}</p>
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              onAddFunds()
            }}
            className="mt-4 w-full rounded-full bg-cream py-2 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-charcoal transition-colors duration-300 hover:bg-burgundy hover:text-cream"
          >
            Add funds
          </button>
        </div>

        <Link
          to="/developers"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-cream/65 transition-colors duration-200 hover:bg-cream/5 hover:text-cream"
        >
          <Icon icon={Terminal} size={18} />
          Developers
          <span className="ml-auto rounded-full border border-cream/25 px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.14em]">
            Soon
          </span>
        </Link>

        <div className="flex items-center gap-3 border-t border-cream/15 px-1 pt-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-semibold text-charcoal">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{user.name}</p>
            <p className="truncate text-xs text-cream/60">{user.email}</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              dispatch({ type: 'signOut' })
              navigate('/')
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-cream/65 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <Icon icon={LogOut} size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function DashboardLayout() {
  const { state } = useStore()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [fundsOpen, setFundsOpen] = useState(false)
  const navigate = useNavigate()

  useSimulatedActivity()

  // The website's "Connect agent" button lands here with ?connect=1.
  const wantsConnect = params.get('connect') === '1'
  useEffect(() => {
    if (!wantsConnect || !state.user) return
    setConnectOpen(true)
    setParams({}, { replace: true })
  }, [wantsConnect, state.user, setParams])

  useEffect(() => {
    document.title = 'Dashboard — Oryne'
  }, [])

  if (!state.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <div className="tone-cream min-h-svh lg:pl-64">
      <aside className="tone-charcoal fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar onAddFunds={() => setFundsOpen(true)} onConnect={() => setConnectOpen(true)} />
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
          <Sidebar
            onNavigate={() => setMenuOpen(false)}
            onAddFunds={() => setFundsOpen(true)}
            onConnect={() => setConnectOpen(true)}
          />
        </div>
      )}

      {/* Cards run edge to edge, with only a narrow margin around them. */}
      <main className="p-3 md:p-4">
        <Outlet
          context={
            {
              openConnect: () => setConnectOpen(true),
              openFunds: () => setFundsOpen(true),
            } satisfies DashboardContext
          }
        />
      </main>

      <ConnectAgentDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={(agent) => navigate(`/app/agents/${agent.id}`)}
      />
      <AddFundsDialog open={fundsOpen} onClose={() => setFundsOpen(false)} />
    </div>
  )
}
