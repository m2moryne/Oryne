import { Bot, Building2, Store } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'

const audiences = [
  {
    index: '01',
    icon: Bot,
    title: 'Agent builders',
    body: 'Give any agent a pay tool in one line. Works with Claude, Cursor and anything that speaks MCP, or call the SDK directly.',
    points: ['MCP server and SDKs for TypeScript and Python', 'x402 and MPP handled for you', 'Sandbox on Stellar testnet'],
    link: { to: '/dev', label: 'Open the developer console' },
  },
  {
    index: '02',
    icon: Store,
    title: 'Services and APIs',
    body: 'Charge agents per call, per page or per second, with no accounts, cards or invoices. Three lines of middleware.',
    points: ['Paid in USDC within seconds', 'Listed in the Oryne directory', 'No chargebacks on settled payments'],
    link: { to: '/directory', label: 'See the directory' },
  },
  {
    index: '03',
    icon: Building2,
    title: 'Teams and businesses',
    body: 'Run fleets of agents with spending policies finance can read, approvals in one place, and an audit trail that is on a public ledger.',
    points: ['Per-agent and per-team budgets', 'Approvals by passkey', 'Exports for accounting'],
    link: { to: '/product', label: 'How the controls work' },
  },
]

export function Audiences() {
  return (
    <Section id="audiences" labelledBy="audiences-title" tone="white">
      <Reveal>
        <h2 id="audiences-title" className="type-statement max-w-[18ch]">
          Both sides of every machine payment.
        </h2>
      </Reveal>

      <Reveal delay={120} className="mt-auto pt-16">
        <ul className="grid gap-4 lg:grid-cols-3">
          {audiences.map((audience) => (
            <li key={audience.index} className="group relative flex flex-col border border-line p-6 md:p-8">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -top-px h-px origin-left scale-x-0 bg-accent transition-transform duration-700 ease-quiet group-hover:scale-x-100"
              />
              <div className="flex items-start justify-between text-muted">
                <span className="type-label tabular-nums">{audience.index}</span>
                <Icon icon={audience.icon} size={20} />
              </div>
              <h3 className="mt-16 text-sm font-medium uppercase tracking-[0.22em]">{audience.title}</h3>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">{audience.body}</p>
              <ul className="mb-8 mt-6 space-y-2 border-t border-line pt-5 text-sm">
                {audience.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <TextLink to={audience.link.to} className="type-label mt-auto self-start">
                {audience.link.label}
              </TextLink>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  )
}
