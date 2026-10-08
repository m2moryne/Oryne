import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const phases = [
  {
    stage: 'Now',
    title: 'The wallet',
    items: [
      'Agent-wallet contract on Stellar testnet, open source',
      'Dashboard: mandates, approvals, receipts',
      'MCP server and TypeScript and Python SDKs',
      'First paid services onboarded by hand',
    ],
  },
  {
    stage: 'Next',
    title: 'Mainnet',
    items: [
      'Audit, then mainnet with USDC',
      'Merchant kit and an x402 facilitator with sponsored fees',
      'Passkey wallets: no seed phrases, no XLM to hold',
      'Funding and cash-out through Stellar anchors',
    ],
  },
  {
    stage: 'Then',
    title: 'The network',
    items: [
      'A directory agents can search and rank',
      'Team and company policies across fleets of agents',
      'Verifiable agent identity and payment reputation',
      'MPP channels for high-frequency streams',
    ],
  },
  {
    stage: 'Later',
    title: 'The economy',
    items: [
      'Agents paying agents, with escrow for multi-step jobs',
      'Credit lines for agents with a track record',
      'Cross-border payouts to people, in local money',
    ],
  },
]

export function Roadmap() {
  return (
    <Section id="roadmap" labelledBy="roadmap-title" tone="white">
      <Reveal>
        <h2 id="roadmap-title" className="type-statement max-w-[16ch]">
          From one wallet to an economy.
        </h2>
      </Reveal>

      <Reveal delay={120} className="mt-auto pt-16">
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {phases.map((phase, i) => (
            <li key={phase.stage} className={i === 0 ? 'border border-charcoal p-6' : 'border border-line p-6'}>
              <p className="type-label text-muted">
                {String(i + 1).padStart(2, '0')} · {phase.stage}
              </p>
              <h3 className="mt-10 text-xl tracking-[-0.02em]">{phase.title}</h3>
              <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm leading-relaxed text-muted">
                {phase.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  )
}
