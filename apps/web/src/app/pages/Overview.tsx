import { ArrowUpRight, Bot, Receipt } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useDashboard } from '../DashboardLayout'
import { money } from '../format'
import { PurchaseList } from '../PurchaseList'
import { SpendChart } from '../SpendChart'
import { spentBy, useStore } from '../store'
import { EmptyState, Meter, Panel, Stat } from '../ui'

const linkClasses =
  'inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-charcoal'
const noteLinkClasses = 'underline underline-offset-4 hover:text-charcoal'

export default function Overview() {
  const { state } = useStore()
  const { openConnect, openFunds } = useDashboard()
  const { agents, purchases, balance } = state

  const spent = spentBy(purchases)
  const allocated = agents.reduce((total, agent) => total + agent.budget, 0)
  const active = agents.filter((agent) => agent.status === 'active').length

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Balance"
          value={money(balance)}
          note={
            <button type="button" onClick={openFunds} className={noteLinkClasses}>
              Add funds
            </button>
          }
        />
        <Stat
          label="Spent, 30 days"
          value={money(spent)}
          note={allocated > 0 ? `${Math.round((spent / allocated) * 100)}% of budgets used` : 'No budgets set'}
        />
        <Stat
          label="Budgeted"
          value={money(allocated)}
          note={`Across ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}`}
        />
        <Stat
          label="Agents"
          value={String(agents.length)}
          note={
            <>
              {active} active ·{' '}
              <button type="button" onClick={openConnect} className={noteLinkClasses}>
                Connect agent
              </button>
            </>
          }
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SpendChart purchases={purchases} />
        </Panel>

        <Panel
          title="Budgets"
          action={
            <Link to="/app/agents" className={linkClasses}>
              All agents <Icon icon={ArrowUpRight} size={15} />
            </Link>
          }
          flush={agents.length === 0}
        >
          {agents.length === 0 ? (
            <EmptyState icon={Bot} title="No agents yet">
              Connect your first agent to give it a budget.
            </EmptyState>
          ) : (
            <ul className="space-y-6">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link to={`/app/agents/${agent.id}`} className="group block">
                    <span className="mb-3 flex items-center gap-3">
                      <span className="text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                        {agent.name}
                      </span>
                      {agent.status === 'paused' && <span className="text-xs text-muted">Paused</span>}
                    </span>
                    <Meter spent={spentBy(purchases, agent.id)} budget={agent.budget} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Latest purchases"
        flush
        action={
          <Link to="/app/activity" className={linkClasses}>
            All activity <Icon icon={ArrowUpRight} size={15} />
          </Link>
        }
      >
        {purchases.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing bought yet">
            Purchases appear here the moment an agent makes one.
          </EmptyState>
        ) : (
          <PurchaseList purchases={purchases.slice(0, 6)} agents={agents} />
        )}
      </Panel>
    </div>
  )
}
