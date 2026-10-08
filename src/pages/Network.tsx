import { Check, X } from 'lucide-react'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Container } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import {
  compact,
  ledgerAt,
  networkTotals,
  NETWORK,
  services,
  shortKey,
  useLiveFeed,
  useNow,
  usdc,
} from '../lib/network'

const seconds = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`
}

export default function Network() {
  usePageMeta(
    'Network — Oryne',
    'Agent payments on Stellar through Oryne wallets, live: volume, agents, services and every settlement.',
  )
  const now = useNow(1000)
  const totals = networkTotals(now)
  const feed = useLiveFeed(16)
  const top = [...services].sort((a, b) => b.calls24h - a.calls24h).slice(0, 8)
  const maxCalls = top[0].calls24h

  const stats = [
    ['Payments, 24 h', totals.payments24h.toLocaleString('en-US')],
    ['Volume, 24 h', `$${totals.volume24h.toLocaleString('en-US')}`],
    ['Active agents', totals.agents.toLocaleString('en-US')],
    ['Agent wallets', totals.wallets.toLocaleString('en-US')],
    ['Paid services', totals.services.toLocaleString('en-US')],
    ['Refused by mandate', `${(totals.declinedByPolicy * 100).toFixed(1)}%`],
    ['Median settlement', `${totals.medianSettle} s`],
    ['Current ledger', ledgerAt(now).toLocaleString('en-US')],
  ]

  return (
    <>
      <PageHero
        label={`Network · ${NETWORK.name}`}
        title="Every agent payment, in the open."
        lede="Payments made through Oryne wallets settle on Stellar, so anyone can check them. This view follows them as they land. In the preview the data is simulated; the shape is real."
      >
        <p className="inline-flex items-center gap-2.5 rounded-full border border-line px-4 py-2 text-sm">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-burgundy" />
          Simulated preview · updates live
        </p>
      </PageHero>

      <section aria-label="Network figures" className="tone-white">
        <Container className="pb-16">
          <dl className="grid grid-cols-2 gap-px border border-line bg-taupe/50 md:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="bg-white p-5 md:p-6">
                <dt className="type-label text-muted">{label}</dt>
                <dd className="mt-4 text-2xl tracking-[-0.02em] tabular-nums md:text-3xl">{value}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="feed-title" className="tone-charcoal">
        <Container className="py-16 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="feed-title" className="text-3xl tracking-[-0.03em] md:text-4xl">
              Latest payments
            </h2>
            <p className="text-sm text-muted">Refused payments never reach the ledger; they are shown for clarity.</p>
          </div>
          <div className="mt-8 overflow-x-auto border border-line">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-line text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Service</th>
                  <th scope="col" className="px-4 py-3 font-medium">Agent</th>
                  <th scope="col" className="px-4 py-3 font-medium">Wallet</th>
                  <th scope="col" className="px-4 py-3 font-medium">Via</th>
                  <th scope="col" className="px-4 py-3 font-medium">Transaction</th>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {feed.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted tabular-nums">{seconds(item.at, now)}</td>
                    <td className="px-4 py-3">{item.service.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortKey(item.agent)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortKey(item.wallet)}</td>
                    <td className="px-4 py-3 text-muted">{item.service.protocol}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.status === 'settled' ? (
                        <>
                          {shortKey(item.hash, 6, 6)}
                          <span className="ml-2 text-muted">#{item.ledger.toLocaleString('en-US')}</span>
                        </>
                      ) : (
                        <span className="text-muted">none</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon icon={item.status === 'settled' ? Check : X} size={14} />
                        {item.status === 'settled' ? 'Settled' : item.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={item.status === 'refused' ? 'text-muted line-through' : undefined}>
                        {usdc(item.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section aria-labelledby="top-title" className="tone-white">
        <Container className="py-16 md:py-24">
          <h2 id="top-title" className="text-3xl tracking-[-0.03em] md:text-4xl">
            Most-paid services, 24 hours
          </h2>
          <ol className="mt-8 space-y-4">
            {top.map((item, i) => (
              <li key={item.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 text-sm md:grid-cols-[2rem_14rem_1fr_8rem]">
                <span className="tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-medium">{item.name}</span>
                <span className="col-span-3 h-1.5 overflow-hidden rounded-full bg-taupe/30 max-md:order-last md:col-span-1">
                  <span
                    className="block h-full rounded-full bg-charcoal"
                    style={{ width: `${(item.calls24h / maxCalls) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-muted">{compact(item.calls24h)} calls</span>
              </li>
            ))}
          </ol>
        </Container>
      </section>
    </>
  )
}
