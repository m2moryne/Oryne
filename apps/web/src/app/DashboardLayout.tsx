import {
  Bot,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
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
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { privatePages } from '../lib/seo'
import { AddFundsDialog } from './AddFundsDialog'
import { ConnectAgentDialog } from './ConnectAgentDialog'
import { CreateKeyDialog } from './dev/CreateKeyDialog'
import { AreaSwitch, DevTopBar } from './dev/DevChrome'
import { devGroups, devPath } from './dev/devNav'
import { initials, money } from './format'
import { useSimulatedActivity, useStore } from './store'

type Area = 'agents' | 'developers'
type Item = { to: string; label: string; icon: LucideIcon; end?: boolean }
type Group = { heading?: string; items: Item[] }

/** The two halves of the product: running agents, and building on the API. */
const areas: Record<Area, { label: string; home: string; action: string; groups: Group[] }> = {
  agents: {
    label: 'Agents',
    home: '/demo',
    action: 'Connect agent',
    groups: [
      {
        items: [
          { to: '/demo', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/demo/agents', label: 'Agents', icon: Bot },
          { to: '/demo/approvals', label: 'Approvals', icon: ClipboardCheck },
          { to: '/demo/services', label: 'Services', icon: Store },
          { to: '/demo/wallet', label: 'Wallet', icon: ShieldCheck },
          { to: '/demo/funds', label: 'Funds', icon: Wallet },
          { to: '/demo/activity', label: 'Activity', icon: Receipt },
          { to: '/demo/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
  developers: {
    label: 'Developers',
    home: '/dev',
    action: 'Create API key',
    groups: devGroups.map((group) => ({
      heading: group.heading,
      items: group.pages.map((page) => ({
        to: devPath('/dev', page.slug),
        label: page.label,
        icon: page.icon,
        end: !page.slug,
      })),
    })),
  },
}

type DashboardContext = {
  openConnect: () => void
  openFunds: () => void
  openCreateKey: () => void
}

/** Lets any dashboard page open the shared dialogs. */
export const useDashboard = () => useOutletContext<DashboardContext>()

function Sidebar({
  area,
  onNavigate,
  dialogs,
}: {
  area: Area
  onNavigate?: () => void
  dialogs: DashboardContext
}) {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const user = state.user!
  const current = areas[area]

  const act = (open: () => void) => () => {
    onNavigate?.()
    open()
  }

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-6">
      <Link to="/" aria-label="Oryne, back to the website" className="px-3 text-[0.9375rem]">
        <Wordmark />
      </Link>

      <div className="mt-7">
        <AreaSwitch current={area} agents={areas.agents.home} developers={areas.developers.home} onNavigate={onNavigate} />
      </div>

      <button
        type="button"
        onClick={act(area === 'agents' ? dialogs.openConnect : dialogs.openCreateKey)}
        className="mt-4 flex h-10 w-full shrink-0 items-center justify-center gap-2.5 rounded-full bg-cream text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-charcoal transition-colors duration-300 hover:bg-burgundy hover:text-cream"
      >
        <Icon icon={Plus} size={16} />
        {current.action}
      </button>

      <nav aria-label={current.label} className="mt-6 space-y-5">
        {current.groups.map((group) => (
          <div key={group.heading ?? 'main'}>
            {group.heading && <p className="type-label mb-2 px-3 text-cream/45">{group.heading}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
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
                    {item.to === '/demo/approvals' && state.approvals.length > 0 && (
                      <span className="ml-auto min-w-5 rounded-full bg-cream px-1.5 text-center text-xs font-semibold tabular-nums text-charcoal">
                        {state.approvals.length}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* The developer console keeps mode and account in its top bar instead. */}
      {area === 'agents' && (
        <div className="mt-auto space-y-3 pt-6">
          <div className="border border-cream/15 p-4">
            <p className="type-label text-cream/60">Wallet · USDC</p>
            <p className="mt-3 text-2xl tracking-[-0.02em] tabular-nums">{money(state.balance)}</p>
            <button
              type="button"
              onClick={act(dialogs.openFunds)}
              className="mt-4 w-full rounded-full bg-cream py-2 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-charcoal transition-colors duration-300 hover:bg-burgundy hover:text-cream"
            >
              Add funds
            </button>
          </div>

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
              aria-label="Exit preview"
              title="Exit preview"
              onClick={() => {
                dispatch({ type: 'signOut' })
                navigate('/app')
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-cream/65 transition-colors hover:bg-cream/10 hover:text-cream"
            >
              <Icon icon={LogOut} size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DashboardLayout({ area }: { area: Area }) {
  const { state, dispatch } = useStore()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [fundsOpen, setFundsOpen] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const navigate = useNavigate()

  useSimulatedActivity()

  // The website's "Connect agent" button lands here with ?connect=1.
  const wantsConnect = params.get('connect') === '1'
  useEffect(() => {
    if (!wantsConnect || !state.user) return
    setConnectOpen(true)
    setParams({}, { replace: true })
  }, [wantsConnect, state.user, setParams])

  usePageMeta(area === 'developers' ? privatePages.developers : privatePages.demo)

  if (!state.user) {
    return <Navigate to="/app" replace state={{ from: location.pathname + location.search }} />
  }

  // The developer console is dark throughout.
  const dark = area === 'developers'

  const exitPreview = () => {
    dispatch({ type: 'signOut' })
    navigate('/app')
  }

  const dialogs: DashboardContext = {
    openConnect: () => setConnectOpen(true),
    openFunds: () => setFundsOpen(true),
    openCreateKey: () => setKeyOpen(true),
  }

  return (
    <div className="tone-cream min-h-svh lg:pl-64">
      <aside className="tone-charcoal fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-cream/10 lg:block">
        <Sidebar area={area} dialogs={dialogs} />
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
          <Sidebar area={area} dialogs={dialogs} onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Cards run edge to edge, with only a narrow margin around them. */}
      <main className={cn('min-h-svh p-3 md:p-4', dark && 'theme-dark tone-cream')}>
        {dark && (
          <DevTopBar
            mode={state.dev.mode}
            onMode={(mode) => dispatch({ type: 'setMode', mode })}
            account={{
              name: state.user.name,
              email: state.user.email,
              base: '/dev',
              ownerDashboard: '/demo',
              signOutLabel: 'Exit preview',
              onSignOut: exitPreview,
            }}
          />
        )}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border border-taupe/60 px-4 py-2.5 text-sm text-muted md:mb-4">
          <p className="min-w-0 flex-1">
            <span className="font-medium text-charcoal">Preview account · sample data.</span>{' '}
            {area === 'developers'
              ? 'Keys, webhooks, logs and usage here are examples of what’s coming, not live.'
              : 'Nothing here is on a ledger and no real money moves.'}
          </p>
          <button type="button" onClick={exitPreview} className="font-medium text-charcoal underline underline-offset-4">
            Exit preview
          </button>
        </div>
        <Outlet context={dialogs} />
      </main>

      {/* Dialogs sit outside <main>, so they need the theme handed to them. */}
      <div className={dark ? 'theme-dark' : undefined}>
        <ConnectAgentDialog
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onConnected={(agent) => navigate(`/demo/agents/${agent.id}`)}
        />
        <AddFundsDialog open={fundsOpen} onClose={() => setFundsOpen(false)} />
        <CreateKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
      </div>
    </div>
  )
}
