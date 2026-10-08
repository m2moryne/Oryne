import { MandateSimulator } from '../../components/MandateSimulator'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const contrast = [
  {
    caption: 'Most agent wallets',
    points: [
      'Limits live in the provider’s database',
      'The provider holds the money',
      'A leaked key or a bad prompt can drain it',
    ],
  },
  {
    caption: 'Oryne',
    points: [
      'Limits live in a Soroban contract you own',
      'Funds stay in your wallet, never with us',
      'A leaked key still can’t break the mandate',
    ],
  },
]

export function Guarantee() {
  return (
    <Section id="guarantee" labelledBy="guarantee-title" tone="purple">
      <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-5">
          <Reveal>
            <h2 id="guarantee-title" className="type-statement max-w-[12ch]">
              Limits it can&rsquo;t break.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="type-lede mt-10 max-w-md text-muted">
              Agents get prompt-injected. Keys leak. Servers get breached, ours included. So the
              mandate isn&rsquo;t a setting we promise to respect. It&rsquo;s code on Stellar that
              refuses any payment outside it, whoever asks.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-12 grid gap-8 sm:grid-cols-2">
              {contrast.map((column, i) => (
                <div key={column.caption} className={i === 0 ? 'opacity-55' : undefined}>
                  <p className="type-label text-muted">{column.caption}</p>
                  <ul className="mt-4 space-y-3 border-t border-line pt-4 text-[0.9375rem] leading-snug">
                    {column.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={160} className="lg:col-span-6 lg:col-start-7 lg:self-center">
          <p className="type-label mb-4 text-muted">Try to break it</p>
          <MandateSimulator />
        </Reveal>
      </div>
    </Section>
  )
}
