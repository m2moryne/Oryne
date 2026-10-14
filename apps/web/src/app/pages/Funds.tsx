import { Landmark, Plus } from 'lucide-react'
import { Button } from '../../components/Button'
import { useDashboard } from '../DashboardLayout'
import { formatDate, money } from '../format'
import { spentBy, useStore } from '../store'
import { EmptyState, Panel } from '../ui'

export default function Funds() {
  const { state } = useStore()
  const { openFunds } = useDashboard()
  const { agents, purchases, fundings, balance } = state

  // What each agent could still draw this period, against what is actually there.
  const remaining = agents.map((agent) => ({
    agent,
    left: Math.max(agent.budget - spentBy(purchases, agent.id), 0),
  }))
  const committed = remaining.reduce((total, entry) => total + entry.left, 0)
  const shortfall = committed - balance

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Funds</h1>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-1">
          <p className="type-label text-muted">Available balance</p>
          <p className="mt-5 text-5xl tracking-[-0.04em] tabular-nums">{money(balance)}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {shortfall > 0
              ? `Your agents' budgets allow ${money(committed)} more this period, which is ${money(shortfall)} more than your balance. Purchases are declined once the balance runs out.`
              : `Enough to cover the ${money(committed)} your agents can still spend this period.`}
          </p>
          <Button size="sm" leadingIcon={Plus} onClick={openFunds} className="mt-6">
            Add funds
          </Button>
        </Panel>

        <Panel title="Still available to each agent" className="xl:col-span-2" flush={agents.length === 0}>
          {agents.length === 0 ? (
            <EmptyState icon={Landmark} title="No budgets yet">
              Connect an agent and give it a budget to see it here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-taupe/30">
              {remaining.map(({ agent, left }) => (
                <li key={agent.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <p className="text-sm text-muted">
                      {money(agent.budget)} budget{agent.status === 'paused' && ' · paused'}
                    </p>
                  </div>
                  <p className="text-right tabular-nums">
                    {money(left)}
                    <span className="block text-sm text-muted">left</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Funding history" flush>
        {fundings.length === 0 ? (
          <EmptyState icon={Landmark} title="No funds added yet">
            Add funds to give your agents something to spend.
          </EmptyState>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Method</th>
                <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {fundings.map((funding) => (
                <tr key={funding.id}>
                  <td className="px-5 py-4 md:px-6">{formatDate(funding.at)}</td>
                  <td className="px-4 py-4 text-muted">{funding.method}</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums md:px-6">
                    +{money(funding.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
