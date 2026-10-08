import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { shortKey } from '../lib/network'
import { agentKey, contractErrors, onchain } from './chain'
import { CopyButton } from './dev/devUi'
import { formatDateTime, money } from './format'
import type { Agent, Purchase } from './types'
import { Dialog, StatusPill } from './ui'

/** The checks every purchase passes through in the wallet contract, and which one stopped this one. */
function checks(purchase: Purchase, agent?: Agent) {
  const failed = (reason: string) => purchase.reason === reason
  return [
    {
      label: 'Payee is allowed',
      detail: agent?.payees?.length ? `${agent.payees.length} on allowlist` : 'Any payee',
      passed: !failed('Payee not on allowlist'),
    },
    {
      label: 'Within the per-purchase limit',
      detail: agent ? `Limit ${money(agent.perPurchase)}` : undefined,
      passed: !failed('Over the per-purchase limit'),
    },
    {
      label: 'Within the monthly budget',
      detail: agent ? `Budget ${money(agent.budget)}` : undefined,
      passed: !failed('Budget reached'),
    },
    { label: 'Balance covers it', detail: undefined, passed: !failed('Not enough funds') },
  ]
}

/** Where the payment lives on Stellar, or why it never got there. */
function OnStellar({ purchase, agent }: { purchase: Purchase; agent?: Agent }) {
  const chain = onchain(purchase)
  if (!chain.onLedger) {
    return (
      <div className="rounded-lg border border-burgundy/30 px-4 py-3 text-sm">
        <p className="font-medium text-burgundy">Never reached the ledger</p>
        <p className="mt-1 text-muted">
          Refused before signing:{' '}
          <code className="font-mono text-[0.8125rem]">{contractErrors[purchase.reason ?? ''] ?? purchase.reason}</code>.
          No funds moved and no fee was paid.
        </p>
      </div>
    )
  }
  const rows: Array<[string, string, string?]> = [
    ['Protocol', `${chain.protocol} · USDC on Stellar`],
    ['Transaction', shortKey(chain.hash, 10, 8), chain.hash],
    ['Ledger', `#${chain.ledger.toLocaleString('en-US')}`],
    ['Paid to', shortKey(chain.payee, 6, 6), chain.payee],
    ['Signed by', agent ? `${shortKey(agentKey(agent), 6, 6)} (agent key)` : 'Removed agent key'],
    ['Network fee', `${chain.feeXlm} XLM, sponsored`],
  ]
  return (
    <div>
      <p className="text-sm font-medium">On Stellar</p>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value, copy]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="flex items-center gap-1 font-mono text-[0.8125rem]">
              {value}
              {copy && <CopyButton value={copy} className="h-6 px-1 text-muted hover:text-charcoal" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Receipt({ purchase, agent, onClose }: { purchase: Purchase | null; agent?: Agent; onClose: () => void }) {
  return (
    <Dialog open={purchase !== null} onClose={onClose} title={purchase?.item ?? ''}>
      {purchase && (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-6">
            <p className="text-4xl tracking-[-0.03em] tabular-nums">{money(purchase.amount)}</p>
            <StatusPill status={purchase.status} />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-taupe/40 py-5 text-sm">
            <div>
              <dt className="text-muted">Merchant</dt>
              <dd className="mt-1">{purchase.merchant}</dd>
            </div>
            <div>
              <dt className="text-muted">Category</dt>
              <dd className="mt-1">{purchase.category}</dd>
            </div>
            <div>
              <dt className="text-muted">Agent</dt>
              <dd className="mt-1">{agent?.name ?? 'Disconnected agent'}</dd>
            </div>
            <div>
              <dt className="text-muted">When</dt>
              <dd className="mt-1">{formatDateTime(purchase.at)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Reference</dt>
              <dd className="mt-1 font-mono text-[0.8125rem]">{purchase.id}</dd>
            </div>
          </dl>

          <OnStellar purchase={purchase} agent={agent} />

          <div>
            <p className="text-sm font-medium">Checks</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              {purchase.approvedByOwner ? (
                <li className="flex items-center gap-2.5">
                  <Icon icon={Check} size={16} className="text-muted" /> You approved this request, outside
                  the agent&rsquo;s usual limits
                </li>
              ) : purchase.reason === 'Declined by you' ? (
                <li className="flex items-center gap-2.5 text-burgundy">
                  <Icon icon={X} size={16} /> You declined this request
                </li>
              ) : (
                checks(purchase, agent).map((check) => (
                  <li key={check.label} className="flex items-center gap-2.5">
                    <Icon
                      icon={check.passed ? Check : X}
                      size={16}
                      className={check.passed ? 'text-muted' : 'text-burgundy'}
                    />
                    <span className={check.passed ? undefined : 'text-burgundy'}>{check.label}</span>
                    {check.detail && <span className="ml-auto text-muted tabular-nums">{check.detail}</span>}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * What the agents bought. A table on wide screens, stacked rows on narrow
 * ones; opening a purchase shows its receipt and the checks it went through.
 */
export function PurchaseList({
  purchases,
  agents,
  showAgent = true,
}: {
  purchases: Purchase[]
  agents: Agent[]
  showAgent?: boolean
}) {
  const [open, setOpen] = useState<Purchase | null>(null)
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
              <tr
                key={purchase.id}
                onClick={() => setOpen(purchase)}
                className="cursor-pointer transition-colors duration-150 hover:bg-taupe/10"
              >
                <td className="px-6 py-4">
                  {/* A real button, so the receipt opens from the keyboard too. */}
                  <button type="button" onClick={() => setOpen(purchase)} className="text-left font-medium">
                    {purchase.item}
                  </button>
                  <p className="mt-0.5 text-muted">
                    {purchase.merchant} · {purchase.category}
                  </p>
                </td>
                {showAgent && (
                  <td className={agent ? 'px-4 py-4' : 'px-4 py-4 text-muted'}>
                    {agent?.name ?? 'Disconnected agent'}
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
            <li key={purchase.id}>
              <button
                type="button"
                onClick={() => setOpen(purchase)}
                className="flex w-full gap-4 px-5 py-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{purchase.item}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {purchase.merchant}
                    {showAgent && ` · ${agent?.name ?? 'Disconnected agent'}`}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{formatDateTime(purchase.at)}</span>
                  {purchase.reason && (
                    <span className="mt-1 block text-xs text-burgundy">{purchase.reason}</span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-2">
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
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Receipt purchase={open} agent={open ? agentFor(open) : undefined} onClose={() => setOpen(null)} />
    </>
  )
}
