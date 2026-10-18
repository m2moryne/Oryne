import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const facts = [
  { value: '~5 s', label: 'Settlement', note: 'Final, not pending. No chargebacks.' },
  { value: '0.00001', label: 'XLM per transaction', note: 'Fees below the payment, even at a tenth of a cent.' },
  { value: 'USDC', label: 'Native, not bridged', note: 'Issued on Stellar by Circle.' },
  { value: 'Anchors', label: 'Local cash in and out', note: 'Fund wallets and pay out in local currency.' },
]

export function OnStellar() {
  return (
    <Section id="stellar" labelledBy="stellar-title" tone="charcoal">
      <Reveal>
        <h2 id="stellar-title" className="type-statement max-w-[12ch]">
          Settled on Stellar.
        </h2>
      </Reveal>
      <Reveal delay={120}>
        <p className="type-lede mt-10 max-w-lg text-muted">
          Machine payments are small and constant. They need a network where a payment of a tenth of a cent still makes
          sense. Oryne speaks the open protocols already live on Stellar, x402 and MPP, so any service that accepts them
          accepts Oryne agents.
        </p>
      </Reveal>
      <Reveal delay={180}>
        <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10 lg:mt-16 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="border-t border-line pt-4">
              <dt className="type-label text-muted">{fact.label}</dt>
              <dd className="mt-3 text-3xl tracking-[-0.03em]">{fact.value}</dd>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{fact.note}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  )
}
