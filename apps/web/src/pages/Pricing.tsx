import { Check } from 'lucide-react'
import { type CSSProperties, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Container } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { dollars, feePercent, monthlyFee, pricing } from '../lib/pricing'
import { publicPages } from '../lib/seo'

const plans = [
  {
    name: 'Free',
    price: '$0',
    per: 'a month',
    summary: `Your agents’ first ${dollars(pricing.freeMonthly)} of payments every month, with no fee.`,
    features: [
      'Unlimited agents and wallets',
      'Every feature: approvals, services, webhooks, logs',
      'Agent SDK, MCP server and merchant kit',
      'AI debugger and up to 25 teammates',
      'Test mode, free forever',
    ],
    cta: { label: 'Start free', to: '/app' },
  },
  {
    name: 'Pay as you go',
    price: feePercent,
    per: 'of agent payments',
    summary: `Only on payments past ${dollars(pricing.freeMonthly)} in a month, and never more than ${dollars(pricing.capPerPayment)} on one payment.`,
    features: [
      'Everything in Free',
      'No monthly fee, no minimum, no contract',
      `Months under ${dollars(pricing.minimumBill)} aren’t billed`,
      'Pay from your wallet balance or by card',
      'Stop any time: nothing to cancel',
    ],
    cta: { label: 'Start free', to: '/app' },
    highlight: true,
  },
  {
    name: 'Volume',
    price: 'Custom',
    per: '',
    summary: `For agents paying more than ${dollars(pricing.volumeContact)} a month.`,
    features: ['Lower rates', 'Monthly invoicing', 'A direct line to the team', 'Help moving your agents over'],
    cta: { label: 'Talk to us', to: '/contact' },
  },
]

const free = [
  { title: 'Getting paid', text: 'Charging agents with @oryne/merchant and listing in the services directory is free. No fee on what you receive.' },
  { title: 'Network fees', text: 'Oryne pays the Stellar network fee on wallet changes, top-ups and withdrawals.' },
  { title: 'Withdrawals', text: 'Move your money back out whenever you like, at no charge.' },
  { title: 'Card top-ups', text: 'Paystack’s card fee at cost. We add nothing on top.' },
]

const faqs = [
  {
    q: 'Why not a monthly plan?',
    a: 'Because an agent that pays for nothing shouldn’t cost you anything. You pay only when your agents spend, and only once they spend more than the free allowance.',
  },
  {
    q: 'What counts toward the fee?',
    a: 'Payments your agents make that settle, including ones you approve beyond a mandate. Refused or failed payments never count, and neither does money you add, withdraw or receive.',
  },
  {
    q: 'When and how am I billed?',
    a: 'Once a month, for the month before. Billing in your dashboard shows the running total as it happens, so there are no surprises. Pay from your Oryne wallet or by card.',
  },
  {
    q: 'Is test mode free?',
    a: 'Always. Build and test on Stellar testnet with test USDC for as long as you like.',
  },
  {
    q: 'Do teammates or extra wallets cost more?',
    a: 'No. Seats, wallets and agents are free. The fee depends only on what your agents pay.',
  },
]

export default function Pricing() {
  usePageMeta(publicPages.pricing)
  return (
    <>
      <PageHero
        label="Pricing"
        title="Pay when your agents do."
        lede={`No subscription. Every feature on every account. Your agents’ first ${dollars(pricing.freeMonthly)} of payments each month are free; after that, ${feePercent} of each payment, never more than ${dollars(pricing.capPerPayment)}.`}
      />

      <section className="tone-white pb-20 md:pb-28">
        <Container>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={cn('flex flex-col border p-7 md:p-8', plan.highlight ? 'tone-charcoal border-charcoal' : 'border-line')}
              >
                <h2 className="text-lg">{plan.name}</h2>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl tracking-[-0.03em] tabular-nums">{plan.price}</span>
                  {plan.per && <span className={cn('text-sm', plan.highlight ? 'text-cream/65' : 'text-muted')}>{plan.per}</span>}
                </p>
                <p className={cn('mt-4 text-sm leading-relaxed', plan.highlight ? 'text-cream/75' : 'text-muted')}>{plan.summary}</p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Icon icon={Check} size={16} className={cn('mt-0.5 shrink-0', plan.highlight ? 'text-cream/70' : 'text-green')} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Button to={plan.cta.to} variant={plan.highlight ? 'light' : 'outline'} className="w-full">
                    {plan.cta.label}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="tone-cream py-20 md:py-28">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-8">
            <div className="lg:col-span-5">
              <h2 className="type-statement max-w-[12ch]">What would you pay?</h2>
              <p className="type-lede mt-6 max-w-md text-muted">
                Slide to how much your agents spend in a month. Most agent payments are small, so the per-payment cap rarely
                comes into it.
              </p>
            </div>
            <div className="lg:col-span-7">
              <Calculator />
            </div>
          </div>
        </Container>
      </section>

      <section className="tone-white py-20 md:py-28">
        <Container>
          <h2 className="type-statement max-w-[14ch]">Free, always.</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {free.map((item) => (
              <div key={item.title} className="border-t border-line pt-5">
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="tone-white pb-24 md:pb-32">
        <Container>
          <div className="grid gap-12 border-t border-line pt-16 lg:grid-cols-12 lg:gap-x-8">
            <h2 className="text-2xl tracking-[-0.02em] lg:col-span-4">Questions</h2>
            <dl className="divide-y divide-line lg:col-span-8">
              {faqs.map((faq) => (
                <div key={faq.q} className="py-6 first:pt-0">
                  <dt className="font-medium">{faq.q}</dt>
                  <dd className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{faq.a}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-12 text-sm text-muted">
            Something else? <Link to="/contact" className="text-charcoal underline underline-offset-4">Get in touch</Link>.
          </p>
        </Container>
      </section>
    </>
  )
}

/**
 * The slider runs on a log scale, so $50 and $25,000 are both easy to reach:
 * position 0 is $0, then $10 up to the volume-pricing threshold.
 */
const SLIDER_STEPS = 1000
const SLIDER_MIN = 10
const SLIDER_MAX = pricing.volumeContact
const ticks = [100, 1_000, 10_000]

function roundNicely(value: number) {
  const step = value < 100 ? 5 : value < 1_000 ? 10 : value < 10_000 ? 50 : 500
  return Math.round(value / step) * step
}

function volumeAt(position: number) {
  if (position <= 0) return 0
  if (position >= SLIDER_STEPS) return SLIDER_MAX
  const exponent = Math.log10(SLIDER_MIN) + (position / SLIDER_STEPS) * Math.log10(SLIDER_MAX / SLIDER_MIN)
  return roundNicely(10 ** exponent)
}

function positionOf(volume: number) {
  if (volume <= 0) return 0
  const clamped = Math.min(Math.max(volume, SLIDER_MIN), SLIDER_MAX)
  return Math.round((Math.log10(clamped / SLIDER_MIN) / Math.log10(SLIDER_MAX / SLIDER_MIN)) * SLIDER_STEPS)
}

function Calculator() {
  const id = useId()
  const [position, setPosition] = useState(() => positionOf(500))
  const volume = volumeAt(position)
  const fee = monthlyFee(volume)
  const effective = volume > 0 ? (fee / volume) * 100 : 0
  const fill = `${(position / SLIDER_STEPS) * 100}%`

  return (
    <div className="tone-white border border-taupe p-7 md:p-10">
      <label htmlFor={id} className="text-sm font-medium">
        Your agents spend each month
      </label>
      <p className="mt-3 text-4xl tracking-[-0.03em] tabular-nums" aria-hidden>
        {dollars(volume)}
        {volume >= SLIDER_MAX && '+'}
      </p>
      <input
        id={id}
        type="range"
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-valuetext={`${dollars(volume)} a month`}
        className="price-slider mt-6 w-full"
        style={{ '--fill': fill } as CSSProperties}
      />
      <div className="relative mt-2 h-5 text-xs text-muted tabular-nums">
        <span className="absolute left-0">$0</span>
        {ticks.map((tick) => (
          <button
            key={tick}
            type="button"
            onClick={() => setPosition(positionOf(tick))}
            className="absolute -translate-x-1/2 hover:text-charcoal"
            style={{ left: `${(positionOf(tick) / SLIDER_STEPS) * 100}%` }}
          >
            {dollars(tick)}
          </button>
        ))}
        <span className="absolute right-0">{dollars(SLIDER_MAX)}+</span>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-6">
        <div>
          <dt className="type-label text-muted">You pay Oryne</dt>
          <dd className="mt-2 text-3xl tracking-[-0.03em] tabular-nums">{dollars(fee)}</dd>
        </div>
        <div>
          <dt className="type-label text-muted">Effective rate</dt>
          <dd className="mt-2 text-3xl tracking-[-0.03em] tabular-nums">{effective.toFixed(2)}%</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-muted">
        {volume >= pricing.volumeContact ? (
          <>
            At this volume, <Link to="/contact" className="text-charcoal underline underline-offset-4">talk to us</Link> about
            lower rates.
          </>
        ) : fee === 0 ? (
          volume <= pricing.freeMonthly ? 'Inside the free allowance.' : `Under ${dollars(pricing.minimumBill)}, so not billed.`
        ) : (
          `${dollars(pricing.freeMonthly)} free, then ${feePercent} of ${dollars(volume - pricing.freeMonthly)}.`
        )}
      </p>
    </div>
  )
}
