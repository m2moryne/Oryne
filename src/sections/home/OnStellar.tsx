import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'
import { compact, networkTotals, shortKey, useLiveFeed, useNow, usdc } from '../../lib/network'

const facts = [
  { value: '~5 s', label: 'Settlement', note: 'Final, not pending. No chargebacks.' },
  { value: '0.00001', label: 'XLM per transaction', note: 'Fees below the payment, even at a tenth of a cent.' },
  { value: 'USDC', label: 'Native, not bridged', note: 'Issued on Stellar by Circle.' },
  { value: 'Anchors', label: 'Local cash in and out', note: 'Fund wallets and pay out in local currency.' },
]

export function OnStellar() {
  const now = useNow(2000)
  const totals = networkTotals(now)
  const feed = useLiveFeed(6)

  return (
    <Section id="stellar" labelledBy="stellar-title" tone="charcoal">
      <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-6">
          <Reveal>
            <h2 id="stellar-title" className="type-statement max-w-[12ch]">
              Settled on Stellar.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="type-lede mt-10 max-w-lg text-muted">
              Machine payments are small and constant. They need a network where a payment of
              a tenth of a cent still makes sense. Oryne speaks the open protocols already live on
              Stellar, x402 and MPP, so any service that accepts them accepts Oryne agents.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10">
              {facts.map((fact) => (
                <div key={fact.label} className="border-t border-line pt-4">
                  <dt className="type-label text-muted">{fact.label}</dt>
                  <dd className="mt-3 text-3xl tracking-[-0.03em]">{fact.value}</dd>
                  <dd className="mt-2 text-sm leading-relaxed text-muted">{fact.note}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={200} className="lg:col-span-5 lg:col-start-8 lg:self-center">
          <div className="border border-line">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="flex items-center gap-2.5 text-sm">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-cream" />
                Network, live
              </p>
              <span className="type-label text-muted">Simulated preview</span>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
              {[
                ['Payments, 24 h', compact(totals.payments24h)],
                ['Volume, 24 h', `$${compact(totals.volume24h)}`],
                ['Agents', compact(totals.agents)],
              ].map(([label, value]) => (
                <div key={label} className="px-4 py-4">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 text-xl tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <ul aria-label="Latest payments" className="divide-y divide-line">
              {feed.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {item.service.name}
                    <span className="ml-2 font-mono text-xs text-muted">{shortKey(item.agent)}</span>
                  </span>
                  <span className={item.status === 'refused' ? 'text-muted line-through' : 'tabular-nums'}>
                    {usdc(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-4">
              <TextLink to="/network" className="type-label">
                Open the network view
              </TextLink>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
