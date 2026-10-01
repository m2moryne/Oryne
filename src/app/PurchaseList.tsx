import { formatDateTime, money } from './format'
import type { Agent, Purchase } from './types'
import { StatusPill } from './ui'

/** What the agents bought. A table on wide screens, stacked rows on narrow ones. */
export function PurchaseList({
  purchases,
  agents,
  showAgent = true,
}: {
  purchases: Purchase[]
  agents: Agent[]
  showAgent?: boolean
}) {
  const agentFor = (purchase: Purchase) => agents.find((agent) => agent.id === purchase.agentId)

  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <thead>
          <tr className="type-label border-b border-taupe/40 text-muted">
            <th scope="col" className="px-6 py-3 font-medium">Bought</th>
            {showAgent && <th scope="col" className="px-4 py-3 font-medium">Agent</th>}
            <th scope="col" className="px-4 py-3 font-medium">When</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-6 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-taupe/30">
          {purchases.map((purchase) => {
            const agent = agentFor(purchase)
            return (
              <tr key={purchase.id}>
                <td className="px-6 py-4">
                  <p className="font-medium">{purchase.item}</p>
                  <p className="mt-0.5 text-muted">
                    {purchase.merchant} · {purchase.category}
                  </p>
                </td>
                {showAgent && (
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-2.5">
                      <span className={agent ? undefined : 'text-muted'}>
                        {agent?.name ?? 'Disconnected agent'}
                      </span>
                    </span>
                  </td>
                )}
                <td className="px-4 py-4 whitespace-nowrap text-muted">{formatDateTime(purchase.at)}</td>
                <td className="px-4 py-4">
                  <StatusPill status={purchase.status} />
                  {purchase.reason && <p className="mt-1 text-xs text-muted">{purchase.reason}</p>}
                </td>
                <td className="px-6 py-4 text-right font-medium tabular-nums">
                  <span className={purchase.status === 'declined' ? 'text-muted line-through' : undefined}>
                    {money(purchase.amount)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-taupe/30 md:hidden">
        {purchases.map((purchase) => {
          const agent = agentFor(purchase)
          return (
            <li key={purchase.id} className="flex gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{purchase.item}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {purchase.merchant}
                  {showAgent && ` · ${agent?.name ?? 'Disconnected agent'}`}
                </p>
                <p className="mt-0.5 text-sm text-muted">{formatDateTime(purchase.at)}</p>
                {purchase.reason && <p className="mt-1 text-xs text-burgundy">{purchase.reason}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={
                    purchase.status === 'declined'
                      ? 'tabular-nums text-muted line-through'
                      : 'font-medium tabular-nums'
                  }
                >
                  {money(purchase.amount)}
                </span>
                <StatusPill status={purchase.status} />
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
