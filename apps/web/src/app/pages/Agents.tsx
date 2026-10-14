import { Bot, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useDashboard } from '../DashboardLayout'
import { money, timeAgo } from '../format'
import { spentBy, useStore } from '../store'
import { EmptyState, Meter, Panel, StatusPill } from '../ui'

export default function Agents() {
  const { state } = useStore()
  const { openConnect } = useDashboard()
  const { agents, purchases } = state

  return (
    <div>
      <h1 className="sr-only">Agents</h1>

      {agents.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={Bot}
            title="Connect your first agent"
            action={
              <Button size="sm" leadingIcon={Plus} onClick={openConnect}>
                Connect agent
              </Button>
            }
          >
            Give an agent you already use a budget and a spending limit. It takes about a minute
            and no code.
          </EmptyState>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const last = purchases.find((purchase) => purchase.agentId === agent.id)
            return (
              <li key={agent.id}>
                <Link
                  to={`/app/agents/${agent.id}`}
                  className="tone-white flex h-full flex-col border border-taupe/50 p-5 transition-colors duration-200 hover:border-charcoal/50 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-medium">{agent.name}</h2>
                    <StatusPill status={agent.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {agent.kind} · up to {money(agent.perPurchase)} per purchase
                  </p>
                  <div className="mt-6">
                    <Meter spent={spentBy(purchases, agent.id)} budget={agent.budget} />
                  </div>
                  <p className="mt-5 border-t border-taupe/30 pt-4 text-sm text-muted">
                    {last ? `Last bought: ${last.item}, ${timeAgo(last.at).toLowerCase()}` : 'No purchases yet'}
                  </p>
                </Link>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={openConnect}
              className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 border border-dashed border-taupe text-muted transition-colors duration-200 hover:border-charcoal hover:text-charcoal"
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-current">
                <Icon icon={Plus} size={20} />
              </span>
              <span className="text-sm font-medium">Connect another agent</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
