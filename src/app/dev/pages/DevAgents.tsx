import { Bot, Search } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { cn } from '../../../lib/cn'
import { formatDate, money, timeAgo } from '../../format'
import { useStore } from '../../store'
import { Dialog, EmptyState, Meter, Panel, Stat, StatusPill, inputClasses } from '../../ui'
import { agentJson, mockAgents, type DevAgent } from '../devData'
import { CodeBlock, CopyButton, Mono } from '../devUi'

const cents = (value: number) => money(value / 100)

/** Every agent registered through the API, with what it has spent against its limits. */
export default function DevAgents() {
  const { state } = useStore()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<DevAgent | null>(null)

  const { mode } = state.dev
  const all = mockAgents().filter((agent) => agent.mode === mode)
  const term = query.trim().toLowerCase()
  const agents = all.filter(
    (agent) => !term || `${agent.id} ${agent.name} ${agent.externalId}`.toLowerCase().includes(term),
  )

  const volume = all.reduce((total, agent) => total + agent.spent, 0)
  const payments = all.reduce((total, agent) => total + agent.payments, 0)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Agents</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Agents" value={String(all.length)} note={`In ${mode} mode`} />
        <Stat
          label="Active"
          value={String(all.filter((agent) => agent.status === 'active').length)}
          note={`${all.filter((agent) => agent.status === 'paused').length} paused`}
        />
        <Stat label="Volume this period" value={cents(volume)} note="Settled payments" />
        <Stat label="Payments" value={payments.toLocaleString()} note="This period" />
      </div>

      <div className="relative">
        <Icon
          icon={Search}
          size={17}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by agent ID, name or your external ID"
          aria-label="Search agents"
          className={cn(inputClasses, 'rounded-none! py-2.5 pl-11')}
        />
      </div>

      <Panel flush>
        {agents.length === 0 ? (
          <EmptyState icon={Bot} title="No agents match">
            Agents appear here as soon as your code creates them with <Mono>agents.create</Mono>.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-6 py-3 font-medium">Agent</th>
                  <th scope="col" className="px-4 py-3 font-medium">External ID</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="w-64 px-4 py-3 font-medium">Budget used</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Payments</th>
                  <th scope="col" className="px-6 py-3 font-medium">Last payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {agents.map((agent) => (
                  <tr
                    key={agent.id}
                    onClick={() => setOpen(agent)}
                    className="cursor-pointer transition-colors duration-150 hover:bg-cream/50"
                  >
                    <td className="px-6 py-3.5">
                      <button type="button" onClick={() => setOpen(agent)} className="text-left font-medium">
                        {agent.name}
                      </button>
                      <p className="mt-0.5 font-mono text-xs text-muted">{agent.id}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Mono>{agent.externalId}</Mono>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={agent.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <Meter spent={agent.spent / 100} budget={agent.monthly / 100} compact />
                      <p className="mt-1.5 text-xs tabular-nums text-muted">
                        {cents(agent.spent)} of {cents(agent.monthly)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{agent.payments}</td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-muted">
                      {agent.lastPaymentAt ? timeAgo(agent.lastPaymentAt) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <div className="space-y-4">
            <p className="flex items-center justify-between gap-2 border border-taupe/60 py-1 pl-3 pr-1 text-sm">
              <span className="truncate">
                <span className="text-muted">Agent ID </span>
                <Mono>{open.id}</Mono>
              </span>
              <CopyButton value={open.id} className="text-muted hover:text-charcoal" />
            </p>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-1 capitalize">{open.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Per purchase</dt>
                <dd className="mt-1 tabular-nums">{cents(open.perPurchase)}</dd>
              </div>
              <div>
                <dt className="text-muted">Payments</dt>
                <dd className="mt-1 tabular-nums">{open.payments}</dd>
              </div>
              <div>
                <dt className="text-muted">Created</dt>
                <dd className="mt-1">{formatDate(open.createdAt)}</dd>
              </div>
            </dl>
            <CodeBlock code={agentJson(open)} label={`GET /v1/agents/${open.id}`} />
            <CodeBlock
              samples={{
                'Node.js': `await oryne.agents.update('${open.id}', {\n  budget: { monthly: ${open.monthly * 2} },\n})\n\nawait oryne.agents.pause('${open.id}')`,
                Python: `oryne.agents.update(\n    "${open.id}",\n    budget={"monthly": ${open.monthly * 2}},\n)\n\noryne.agents.pause("${open.id}")`,
              }}
            />
          </div>
        )}
      </Dialog>
    </div>
  )
}
