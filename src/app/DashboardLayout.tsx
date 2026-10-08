import {
  Activity,
  Bot,
  ClipboardCheck,
  CreditCard,
  FileCode2,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  Webhook,
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
import { CreateKeyDialog } from './dev/CreateKeyDialog'
import { initials, money } from './format'
import { useSimulatedActivity, useStore } from './store'

type Area = 'agents' | 'developers'
type Item = { to: string; label: string; icon: LucideIcon; end?: boolean }
type Group = { heading?: string; items: Item[] }

/** The two halves of the product: running agents, and building on the API. */
const areas: Record<Area, { label: string; home: string; action: string; groups: Group[] }> = {
  agents: {
    label: 'Agents',
    home: '/app',
    action: 'Connect agent',
    groups: [
      {
        items: [
          { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/app/agents', label: 'Agents', icon: Bot },
          { to: '/app/approvals', label: 'Approvals', icon: ClipboardCheck },
          { to: '/app/services', label: 'Services', icon: Store },
          { to: '/app/wallet', label: 'Wallet', icon: ShieldCheck },
          { to: '/app/funds', label: 'Funds', icon: Wallet },
          { to: '/app/activity', label: 'Activity', icon: Receipt },
          { to: '/app/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
  developers: {
    label: 'Developers',
    home: '/dev',
    action: 'Create API key',
    groups: [
      {
        heading: 'Build',
        items: [
          { to: '/dev', label: 'Quickstart', icon: Rocket, end: true },
          { to: '/dev/playground', label: 'Playground', icon: FlaskConical },
          { to: '/dev/keys', label: 'API keys', icon: KeyRound },
          { to: '/dev/webhooks', label: 'Webhooks', icon: Webhook },
          { to: '/dev/sdks', label: 'SDKs & tools', icon: Package },
          { to: '/dev/merchant', label: 'Accept payments', icon: Store },
        ],
      },
      {
        heading: 'Monitor',
        items: [
          { to: '/dev/agents', label: 'Agents', icon: Bot },
          { to: '/dev/contracts', label: 'Contracts', icon: FileCode2 },
          { to: '/dev/logs', label: 'Logs', icon: ScrollText },
          { to: '/dev/usage', label: 'Usage', icon: Activity },
        ],
      },
      {
        heading: 'Organization',
        items: [
          { to: '/dev/team', label: 'Team', icon: Users },
          { to: '/dev/billing', label: 'Billing', icon: CreditCard },
          { to: '/dev/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
}

type DashboardContext = {
  openConnect: () => void
  openFunds: () => void
  openCreateKey: () => void
}

/** Lets any dashboard page open the shared dialogs. */
export const useDashboard = () => useOutletContext<DashboardContext>()

const segment = 'flex-1 py-1.5 text-center text-xs font-medium transition-colors duration-200'
const segmentOn = 'bg-cream text-charcoal'
const segmentOff = 'text-cream/65 hover:text-cream'

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

      <nav aria-label="Dashboard area" className="mt-7 flex border border-cream/20 p-1">
        {(Object.keys(areas) as Area[]).map((key) => (
          <Link
            key={key}
            to={areas[key].home}
            onClick={onNavigate}
            aria-current={key === area ? 'page' : undefined}
            className={cn(segment, key === area ? segmentOn : segmentOff)}
          >
            {areas[key].label}
          </Link>
        ))}
      </nav>

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
                    {item.to === '/app/approvals' && state.approvals.length > 0 && (
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

      <div className="mt-auto space-y-3 pt-6">
        {area === 'agents' ? (
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
        ) : (
          <div className="border border-cream/15 p-4">
            <p className="type-label text-cream/60">Environment</p>
            <div role="group" aria-label="Environment" className="mt-3 flex border border-cream/20 p-1">
              {(['test', 'live'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={state.dev.mode === mode}
                  onClick={() => dispatch({ type: 'setMode', mode })}
                  className={cn(segment, 'capitalize', state.dev.mode === mode ? segmentOn : segmentOff)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-cream/60">
              {state.dev.mode === 'test'
                ? 'Sandbox data. No real money moves.'
                : 'Live data. Keys here spend real balance.'}
            </p>
          </div>
        )}

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

export function DashboardLayout({ area }: { area: Area }) {
  const { state } = useStore()
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

  useEffect(() => {
    document.title = area === 'developers' ? 'Developers — Oryne' : 'Dashboard — Oryne'
  }, [area])

  if (!state.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // The developer console is dark throughout.
  const dark = area === 'developers'

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
        <p className="mb-3 border border-taupe/60 px-4 py-2.5 text-sm text-muted md:mb-4">
          <span className="font-medium text-charcoal">Preview.</span>{' '}
          {area === 'developers'
            ? 'The developer console runs on mock data. The API, SDKs, keys and contracts shown here are not live yet.'
            : 'Simulated data. Wallet addresses and transactions are shaped like Stellar’s but are not on any ledger, and no real money moves.'}
        </p>
        <Outlet context={dialogs} />
      </main>

      {/* Dialogs sit outside <main>, so they need the theme handed to them. */}
      <div className={dark ? 'theme-dark' : undefined}>
        <ConnectAgentDialog
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onConnected={(agent) => navigate(`/app/agents/${agent.id}`)}
        />
        <AddFundsDialog open={fundsOpen} onClose={() => setFundsOpen(false)} />
        <CreateKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
      </div>
    </div>
  )
}
