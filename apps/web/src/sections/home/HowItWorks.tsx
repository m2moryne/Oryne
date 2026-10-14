import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'

const steps = [
  {
    index: '01',
    title: 'Set the mandate',
    body: 'Create a wallet with a passkey, fund it with USDC, and give each agent a budget, a per-payment cap, the services it may pay and a date it stops.',
    sample: [
      ['token', 'USDC'],
      ['per_tx', '25.00'],
      ['budget', '400.00 / 30 days'],
      ['payees', 'Lumen Search, Quill Docs'],
      ['expires', '31 Dec 2026'],
    ],
  },
  {
    index: '02',
    title: 'The agent pays as it works',
    body: 'When a service answers 402 Payment Required, the agent signs a USDC transfer with its own key. The wallet contract checks it against the mandate before a cent moves.',
    sample: [
      ['→ GET', '/v1/search?q=…'],
      ['← 402', '0.008 USDC to GDQ4…'],
      ['→ sign', 'transfer, agent key'],
      ['✓ check', 'within mandate'],
      ['← 200', 'settled in 4.8 s'],
    ],
  },
  {
    index: '03',
    title: 'Every payment answers for itself',
    body: 'Each payment is a Stellar transaction tied to the agent and the mandate that allowed it. Anything outside the limits waits for your approval.',
    sample: [
      ['tx', '9f3a…c21e'],
      ['ledger', '61,482,113'],
      ['agent', 'GBX7…Q2LM'],
      ['mandate', 'per_tx ✓ budget ✓ payee ✓'],
      ['fee', '0.00001 XLM'],
    ],
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-title" tone="white">
      <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-7">
          <h2 id="how-title" className="type-statement max-w-[16ch]">
            One mandate. Then it just pays.
          </h2>
        </Reveal>
        <Reveal delay={120} className="lg:col-span-4 lg:col-start-9 lg:self-end">
          <p className="type-lede text-muted">
            Three moving parts: a wallet you own, an agent with a key, and a contract on Stellar
            standing between them.
          </p>
          <TextLink to="/product" className="type-label mt-6">
            The full product
          </TextLink>
        </Reveal>
      </div>

      <Reveal delay={160} className="mt-auto pt-16">
        <ol className="grid gap-4 lg:grid-cols-3">
          {steps.map((step) => (
            <li key={step.index} className="flex flex-col border border-line p-6 md:p-8">
              <span className="type-label tabular-nums text-muted">{step.index}</span>
              <h3 className="mt-10 text-xl tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{step.body}</p>
              <dl className="mt-8 border-t border-line pt-5 font-mono text-[0.8125rem] leading-relaxed">
                {step.sample.map(([key, value]) => (
                  <div key={key} className="flex gap-4">
                    <dt className="w-16 shrink-0 text-muted">{key}</dt>
                    <dd className="min-w-0 truncate">{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  )
}
