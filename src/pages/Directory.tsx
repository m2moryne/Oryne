import { BadgeCheck, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Container } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { compact, serviceCategories, services, shortKey, usdc, type Service } from '../lib/network'

/** What an agent sees before it pays: the 402 answer from the service. */
const paymentRequired = (item: Service) => `HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "stellar-testnet",
    "asset": "USDC",
    "maxAmountRequired": "${item.price}",
    "payTo": "${shortKey(item.payee, 8, 6)}",
    "resource": "${item.endpoint}"
  }]
}`

export default function Directory() {
  usePageMeta(
    'Directory — Oryne',
    'Services and APIs that accept payment from AI agents on Stellar, with prices, protocols and uptime.',
  )
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const shown = services.filter(
    (item) =>
      (category === 'All' || item.category === category) &&
      `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <>
      <PageHero
        label="Directory"
        title="Services your agents can pay."
        lede="APIs, data, compute and real-world services that charge agents per call in USDC on Stellar. Agents can search this list themselves through the Oryne MCP server."
      >
        <Button to="/dev/merchant" variant="outline">
          List your service
        </Button>
      </PageHero>

      <section aria-label="Services" className="tone-white">
        <Container className="pb-24">
          <div className="flex flex-col gap-4 border-y border-line py-5 md:flex-row md:items-center">
            <label className="relative md:w-80">
              <span className="sr-only">Search services</span>
              <Icon icon={Search} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search services"
                className="w-full rounded-full border border-taupe/70 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-burgundy"
              />
            </label>
            <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
              {serviceCategories.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-200',
                    category === option ? 'border-charcoal bg-charcoal text-cream' : 'border-taupe/70 text-muted hover:border-charcoal',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted md:ml-auto">{shown.length} services</p>
          </div>

          <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-col border border-line p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg tracking-[-0.01em]">
                      {item.name}
                      {item.verified && (
                        <span title="Verified by Oryne" className="text-burgundy">
                          <Icon icon={BadgeCheck} size={17} />
                          <span className="sr-only">Verified</span>
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-muted">{item.category}</p>
                  </div>
                  <span className="border border-taupe px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                    {item.protocol}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{item.description}</p>
                <p className="mt-6 text-2xl tracking-[-0.02em] tabular-nums">
                  {usdc(item.price)} <span className="text-sm text-muted">/ {item.unit}</span>
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Calls, 24 h</dt>
                    <dd className="mt-0.5 tabular-nums">{compact(item.calls24h)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Agents</dt>
                    <dd className="mt-0.5 tabular-nums">{compact(item.agents)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Uptime</dt>
                    <dd className="mt-0.5 tabular-nums">{item.uptime.toFixed(2)}%</dd>
                  </div>
                </dl>
                <details className="group mt-5 border-t border-line pt-4">
                  <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">What an agent sees</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto bg-ink p-4 font-mono text-[0.75rem] leading-relaxed text-paper">
                    {paymentRequired(item)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  )
}
