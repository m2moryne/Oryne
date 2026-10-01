import { Receipt, Search } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { PurchaseList } from '../PurchaseList'
import { useStore } from '../store'
import type { Purchase } from '../types'
import { EmptyState, Panel, inputClasses } from '../ui'

const statuses: Array<{ value: 'all' | Purchase['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'settled', label: 'Settled' },
  { value: 'declined', label: 'Declined' },
]

const PAGE = 20

export default function Activity() {
  const { state } = useStore()
  const [agentId, setAgentId] = useState('all')
  const [status, setStatus] = useState<(typeof statuses)[number]['value']>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const term = query.trim().toLowerCase()
  const matches = state.purchases.filter(
    (purchase) =>
      (agentId === 'all' || purchase.agentId === agentId) &&
      (status === 'all' || purchase.status === status) &&
      (!term || `${purchase.item} ${purchase.merchant} ${purchase.category}`.toLowerCase().includes(term)),
  )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Activity</h1>

      {/* Filters sit in one row above the table they control. */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 px-2 text-sm text-muted max-sm:w-full">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-burgundy opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-burgundy" />
          </span>
          Updating live
        </p>
        <div className="relative min-w-56 flex-1">
          <Icon
            icon={Search}
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShown(PAGE)
            }}
            placeholder="Search purchases"
            aria-label="Search purchases"
            className={cn(inputClasses, 'py-2.5 pl-11')}
          />
        </div>

        <select
          value={agentId}
          onChange={(event) => {
            setAgentId(event.target.value)
            setShown(PAGE)
          }}
          aria-label="Filter by agent"
          className={cn(inputClasses, 'w-auto! py-2.5 max-sm:flex-1')}
        >
          <option value="all">All agents</option>
          {state.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>

        <div role="group" aria-label="Filter by status" className="flex rounded-lg border border-taupe/70 bg-white p-1">
          {statuses.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => {
                setStatus(option.value)
                setShown(PAGE)
              }}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm transition-colors duration-200',
                status === option.value ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Panel flush>
        {matches.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing matches">
            {state.purchases.length === 0
              ? 'Purchases appear here the moment an agent makes one.'
              : 'Try a different search or clear the filters.'}
          </EmptyState>
        ) : (
          <>
            <PurchaseList purchases={matches.slice(0, shown)} agents={state.agents} />
            <div className="flex items-center justify-between gap-4 border-t border-taupe/40 px-5 py-4 text-sm text-muted md:px-6">
              <p>
                Showing {Math.min(shown, matches.length)} of {matches.length}
              </p>
              {shown < matches.length && (
                <button
                  type="button"
                  onClick={() => setShown((count) => count + PAGE)}
                  className="font-medium text-charcoal underline underline-offset-4"
                >
                  Show more
                </button>
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
