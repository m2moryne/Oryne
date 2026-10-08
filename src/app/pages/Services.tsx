import { BadgeCheck, Search } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { compact, serviceCategories, services, usdc } from '../../lib/network'
import { useStore } from '../store'
import type { Agent } from '../types'
import { Panel } from '../ui'

const allNames = services.map((service) => service.name)

/** May this agent pay this service? No allowlist means any service. */
const allows = (agent: Agent, name: string) => !agent.payees?.length || agent.payees.includes(name)

/**
 * The directory, from the owner's side: what each service costs and which of
 * your agents may pay it. Ticking a box edits the agent's on-chain payee allowlist.
 */
export default function Services() {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const agents = state.agents

  const shown = services.filter(
    (service) =>
      (category === 'All' || service.category === category) &&
      `${service.name} ${service.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const toggle = (agent: Agent, name: string) => {
    const current = agent.payees?.length ? agent.payees : allNames
    const next = current.includes(name) ? current.filter((payee) => payee !== name) : [...current, name]
    // Allowing everything again goes back to "any payee".
    const payees = allNames.every((payee) => next.includes(payee)) ? [] : next
    dispatch({ type: 'updateAgent', id: agent.id, patch: { payees } })
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Services</h1>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="relative lg:w-72">
            <span className="sr-only">Search services</span>
            <Icon icon={Search} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search services"
              className="w-full rounded-full border border-taupe/70 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-burgundy"
            />
          </label>
          <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
            {serviceCategories.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors duration-200',
                  category === option ? 'border-charcoal bg-charcoal text-cream' : 'border-taupe/70 text-muted hover:border-charcoal',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">
          Tick which agents may pay each service. An agent with every service ticked may pay anyone;
          untick one and its wallet only accepts payments to the ones left. Each change is a{' '}
          <code className="font-mono text-[0.8125rem]">set_policy</code> call you sign with your passkey.
        </p>
      </Panel>

      <Panel flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Service</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Via</th>
                <th scope="col" className="px-4 py-3 font-medium">Agents, network</th>
                {agents.map((agent) => (
                  <th key={agent.id} scope="col" className="px-3 py-3 text-center font-medium">
                    <span className="block max-w-24 truncate normal-case tracking-normal">{agent.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {shown.map((service) => (
                <tr key={service.id}>
                  <td className="px-5 py-3.5 md:px-6">
                    <p className="flex items-center gap-1.5 font-medium">
                      {service.name}
                      {service.verified && (
                        <span title="Verified by Oryne" className="text-burgundy">
                          <Icon icon={BadgeCheck} size={15} />
                          <span className="sr-only">Verified</span>
                        </span>
                      )}
                    </p>
                    <p className="text-muted">{service.category}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">
                    {usdc(service.price)} <span className="text-muted">/ {service.unit}</span>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{service.protocol}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted">{compact(service.agents)}</td>
                  {agents.map((agent) => (
                    <td key={agent.id} className="px-3 py-3.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${agent.name} may pay ${service.name}`}
                        checked={allows(agent, service.name)}
                        onChange={() => toggle(agent, service.name)}
                        className="size-4 accent-charcoal"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
