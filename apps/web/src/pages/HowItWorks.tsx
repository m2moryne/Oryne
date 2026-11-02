import { ArrowRight, Code2, KeyRound, LayoutDashboard, MessageSquare, ShieldCheck, Smartphone, Store, Wallet, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { Container, type Tone } from '../components/Section'
import { TextLink } from '../components/TextLink'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { publicPages } from '../lib/seo'

const pieces: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Wallet,
    title: 'Your wallet',
    body: 'Holds your digital dollars (USDC) on Stellar. It’s a small program that only you can change: add agents, set limits, take money out.',
  },
  {
    icon: ShieldCheck,
    title: 'The rules',
    body: 'Set per agent: how much per payment, how much per month, and who it may pay. The wallet checks them on every payment. Nobody can skip the check, not even us.',
  },
  {
    icon: KeyRound,
    title: 'The agent’s key',
    body: 'A secret code you give one agent, like a card number with a PIN. It lets the agent ask your wallet to pay. It never gives access to your money directly.',
  },
  {
    icon: LayoutDashboard,
    title: 'The dashboard',
    body: 'Where you see every payment and every refusal, approve requests, pause an agent, or change its limits.',
  },
]

const connectSteps = [
  ['Name it and set its limits', 'For example: “Research bot”, at most 1 dollar per payment and 20 dollars every 30 days.'],
  ['A key is made in your browser', 'A brand-new key just for this agent. It’s created on your device; Oryne’s servers never see the secret part.'],
  ['You approve it', 'With your fingerprint, face or Freighter. Your wallet now trusts this key, within these limits. We pay the network fee.'],
  ['You copy the key, once', 'The dashboard shows it ready to paste: settings for Claude and other AI apps, a code snippet for developers, or the key on its own.'],
  ['You give it to your agent', 'That’s the whole “connection”. The agent doesn’t need to be built with Oryne; it just needs the key and our small tool that uses it.'],
]

const paySteps: Array<{ title: string; body: string; tone?: 'yes' | 'no' }> = [
  { title: 'Your agent asks for something', body: 'It opens a link to a paid service: a search, a report, a piece of data.' },
  { title: 'The service names its price', body: 'Instead of the content, it answers: “This costs 0.50 USDC, paid to this address.”' },
  { title: 'Your agent signs a request', body: 'Using its key, it asks your wallet: “please pay 0.50 to this service.” Signing proves the request really came from that agent.' },
  { title: 'Your wallet checks the rules', body: 'Is this agent one you trust? Is 0.50 under its limit per payment? Is there budget left this month? Is it paused?' },
  { title: 'Yes: the service is paid', body: 'The money moves in about five seconds. The service sends what was asked for, and the payment shows on your dashboard.', tone: 'yes' },
  { title: 'No: nothing moves', body: 'The agent is told why, for example “over its limit per payment”. It can ask you to allow it this once; you decide on your dashboard.', tone: 'no' },
]

type Story = {
  icon: LucideIcon
  who: string
  person: string
  has: string
  steps: string[]
  soon?: boolean
}

const stories: Story[] = [
  {
    icon: MessageSquare,
    who: 'You use Claude, Cursor or another AI app',
    person: 'Brian wants Claude to buy data for him, without risking his savings. He writes no code.',
    has: 'An AI app that supports MCP, the standard way to give it new tools.',
    steps: [
      'He signs in with Google, creates a wallet and adds money.',
      'He connects an agent called “Claude”: 2 dollars per payment, 10 per month.',
      'He pastes the settings the dashboard shows into Claude and restarts it.',
      'Claude can now pay for things, check its budget, and ask Brian when it needs more.',
      'He asks for today’s shipping rates. Claude pays 0.20 and answers. Something over the limit is refused, and Claude tells him.',
    ],
  },
  {
    icon: Code2,
    who: 'You build agents',
    person: 'Amina is building a research agent that buys reports from paid services.',
    has: 'Her own agent’s code.',
    steps: [
      'She connects an agent in the dashboard and puts its key in her server’s settings.',
      'She installs one package, @oryne/agent.',
      'Where her code fetched web pages, it now uses agent.fetch(). When a service asks to be paid, it pays and carries on.',
      'Payments over the limit are refused with a clear reason; her agent can ask her to approve them.',
      'In the developer console she sees every request, usage over time, and gets a message on her server for every payment.',
    ],
  },
  {
    icon: Smartphone,
    who: 'You use an app that has Oryne inside',
    person: 'Carol uses a travel assistant that books things for her. She has never seen a settings file.',
    has: 'An app whose makers added Oryne.',
    steps: [
      'In the app she taps “Connect your Oryne wallet”.',
      'Oryne shows what the app wants: up to 200 dollars a month, 100 per payment.',
      'She approves with her fingerprint and goes back to the app.',
      'The app books within those limits, and she can see or stop it any time on her dashboard.',
    ],
    soon: true,
  },
  {
    icon: Store,
    who: 'You sell a service',
    person: 'Dan runs a weather service and wants AI agents to pay him per request.',
    has: 'A web service and a Stellar address to be paid to.',
    steps: [
      'He installs @oryne/merchant and puts a price on each request, for example one cent.',
      'Agents that haven’t paid are told the price. Paid requests reach his service.',
      'Money arrives in his account seconds later. No customer accounts, no invoices, no card fees.',
    ],
  },
]

function Band({
  tone = 'white',
  labelledBy,
  children,
  className,
}: {
  tone?: Tone
  labelledBy: string
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={labelledBy} className={`tone-${tone}`}>
      <Container className={cn('py-20 md:py-28', className)}>{children}</Container>
    </section>
  )
}

export default function HowItWorks() {
  usePageMeta(publicPages.howItWorks)

  return (
    <>
      <PageHero
        label="How it works"
        title="Your agent gets a card. You keep the limits."
        lede="Oryne gives an AI agent a way to pay for things from your wallet, while the wallet itself checks every payment against rules only you can change. Here is what happens, step by step."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Button to="/app" icon={ArrowRight}>
            Get started
          </Button>
          <TextLink to="/app/developers" className="type-label">
            For developers
          </TextLink>
        </div>
      </PageHero>

      <Band labelledBy="pieces-title" className="pt-0 md:pt-0">
        <h2 id="pieces-title" className="type-label text-muted">
          Four pieces
        </h2>
        <ul className="mt-6 grid gap-px border border-line bg-taupe/50 sm:grid-cols-2 xl:grid-cols-4">
          {pieces.map((piece) => (
            <li key={piece.title} className="flex flex-col bg-white p-6 md:p-7">
              <Icon icon={piece.icon} size={20} className="text-muted" />
              <h3 className="mt-10 text-lg tracking-[-0.01em]">{piece.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{piece.body}</p>
            </li>
          ))}
        </ul>
        <p className="type-lede mt-12 max-w-3xl">
          The important part: <span className="text-muted">your agent never holds your money. It holds a key that lets it ask, and your wallet decides.</span>
        </p>
      </Band>

      <Band tone="charcoal" labelledBy="connect-title">
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:col-span-5">
            <h2 id="connect-title" className="type-statement max-w-[12ch]">
              Connecting an agent.
            </h2>
            <p className="type-lede mt-8 max-w-md text-muted">
              It takes about a minute, and it works the same for every agent: one you built, one you
              downloaded, or an AI app you already use.
            </p>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-6 lg:col-start-7">
            <ol className="divide-y divide-line border-y border-line">
              {connectSteps.map(([title, body], index) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-6">
                  <span className="type-label tabular-nums text-muted">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-lg tracking-[-0.01em]">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Band>

      <Band labelledBy="pay-title">
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:col-span-5">
            <h2 id="pay-title" className="type-statement max-w-[12ch]">
              When your agent pays.
            </h2>
            <p className="type-lede mt-8 max-w-md text-muted">
              Services that charge agents use an open standard (x402): they answer with a price
              instead of the content. Everything after that is automatic.
            </p>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-6 lg:col-start-7">
            <figure>
              <figcaption className="sr-only">
                The agent asks for something, the service names its price, the agent signs a request,
                and the wallet checks the rules. If they are met, the service is paid; if not, nothing
                moves and the agent can ask you.
              </figcaption>
              <ol className="relative space-y-3 pl-8">
                <span aria-hidden="true" className="absolute bottom-6 left-[3px] top-6 w-px bg-line" />
                {paySteps.map((step) => (
                  <li
                    key={step.title}
                    className={cn(
                      'relative border p-5',
                      step.tone === 'yes' ? 'border-charcoal' : step.tone === 'no' ? 'border-burgundy/60' : 'border-line',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -left-8 top-1/2 size-[7px] -translate-y-1/2',
                        step.tone === 'no' ? 'bg-burgundy' : 'bg-charcoal',
                      )}
                    />
                    <h3 className={cn('text-sm font-medium', step.tone === 'no' && 'text-burgundy')}>{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </li>
                ))}
              </ol>
            </figure>
          </Reveal>
        </div>
      </Band>

      <Band tone="cream" labelledBy="stories-title">
        <Reveal>
          <h2 id="stories-title" className="type-statement max-w-[14ch]">
            Four ways people use it.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          {stories.map((story, index) => (
            <Reveal key={story.who} delay={index * 80}>
              <article className="flex h-full flex-col border border-line bg-white p-6 md:p-8">
                <div className="flex items-start justify-between gap-4 text-muted">
                  <Icon icon={story.icon} size={20} />
                  {story.soon && (
                    <span className="border border-taupe px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em]">
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="mt-8 text-xl tracking-[-0.02em]">{story.who}</h3>
                <p className="mt-3 text-sm leading-relaxed">{story.person}</p>
                <p className="mt-2 text-sm text-muted">
                  <span className="text-charcoal">What they need:</span> {story.has}
                </p>
                <ol className="mt-6 space-y-3 border-t border-line pt-6">
                  {story.steps.map((step, stepIndex) => (
                    <li key={step} className="grid grid-cols-[1.75rem_1fr] text-sm leading-relaxed text-muted">
                      <span className="tabular-nums">{stepIndex + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </article>
            </Reveal>
          ))}
        </div>
      </Band>

      <Band labelledBy="today-title">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
          <div className="lg:col-span-5">
            <h2 id="today-title" className="text-3xl tracking-[-0.03em] md:text-4xl">
              Where it is today.
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-muted">
              Oryne runs on Stellar’s test network with test dollars, so you can try everything
              without risking real money. Real USDC comes after a security audit.
            </p>
          </div>
          <div className="grid gap-px border border-line bg-taupe/50 sm:grid-cols-2 lg:col-span-7">
            <div className="bg-white p-6">
              <p className="type-label text-muted">Works now</p>
              <ul className="mt-5 space-y-2.5 text-sm leading-relaxed">
                <li>Wallets, signed in with Google, GitHub, email or Freighter</li>
                <li>Connecting agents with their limits</li>
                <li>Paying, and refusing what’s over the limit</li>
                <li>Approvals, pausing agents, every payment on record</li>
                <li>Claude and other MCP apps, the agent package, the merchant kit</li>
              </ul>
            </div>
            <div className="bg-white p-6">
              <p className="type-label text-muted">Coming</p>
              <ul className="mt-5 space-y-2.5 text-sm leading-relaxed text-muted">
                <li>“Connect your Oryne wallet” inside other apps</li>
                <li>Limits on who an agent may pay, and end dates, in the dashboard</li>
                <li>A directory of services agents can pay for</li>
                <li>Adding and withdrawing money in local currency</li>
                <li>Real USDC on Stellar’s main network</li>
              </ul>
            </div>
          </div>
        </div>
      </Band>

      <Band tone="burgundy" labelledBy="start-title">
        <div className="flex flex-col gap-y-10 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="start-title" className="type-statement max-w-[14ch]">
            Give your agent a wallet. Keep the keys to it.
          </h2>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <Button to="/app" variant="light" icon={ArrowRight}>
              Open the dashboard
            </Button>
            <TextLink to="/contact" className="type-label">
              Talk to us
            </TextLink>
          </div>
        </div>
      </Band>
    </>
  )
}
