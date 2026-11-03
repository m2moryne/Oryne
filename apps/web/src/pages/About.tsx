import { Link } from 'react-router-dom'
import { A, Bullets, ProsePage } from '../components/ProsePage'
import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { EMAIL } from '../lib/social'

const REPO = 'https://github.com/m2moryne/Oryne'

export default function About() {
  usePageMeta(publicPages.about)
  return (
    <ProsePage
      label="About"
      title="Wallets for software that pays."
      lede="Oryne gives AI agents a wallet they can spend from, with limits written into a smart contract on Stellar. The agent can pay for what it needs; it can’t spend past what you allowed."
      sections={[
        {
          id: 'why',
          title: 'Why we’re building it',
          body: (
            <>
              <p>
                AI agents are starting to do work that costs money: calling paid APIs, buying data, running jobs. Today
                that means handing an agent a card number or an API key with no ceiling, and hoping it behaves.
              </p>
              <p>
                We think the limits should be part of the money itself. With Oryne you set a budget, a cap per payment and
                the services an agent may pay, and the network checks every payment against them. If a payment breaks a
                rule it doesn’t happen, whatever the agent, its prompt or our servers say.
              </p>
            </>
          ),
        },
        {
          id: 'what',
          title: 'What Oryne is',
          body: (
            <Bullets
              items={[
                <>A wallet contract you own, holding USDC on Stellar, with a mandate for each agent you trust.</>,
                <>A dashboard to add agents, set their limits, approve payments beyond them, top up and withdraw.</>,
                <>
                  Developer tools: <code>@oryne/agent</code> and <code>@oryne/mcp</code> so agents can pay, and{' '}
                  <code>@oryne/merchant</code> so services can charge them, over the x402 payment protocol.
                </>,
                <>A directory of paid services agents can use, with per-agent access you allow in one click.</>,
              ]}
            />
          ),
        },
        {
          id: 'principles',
          title: 'How we work',
          body: (
            <Bullets
              items={[
                <>
                  <strong className="font-medium">Your keys, your money.</strong> The wallet is owned by your passkey or
                  Freighter account. Oryne can’t move your funds or change your agents’ limits.
                </>,
                <>
                  <strong className="font-medium">Rules in code, not policy.</strong> Mandates are enforced by the
                  contract on every payment, not by a check on our side that could be skipped.
                </>,
                <>
                  <strong className="font-medium">Open source.</strong> The contracts, API, dashboard and packages are
                  MIT-licensed on <A href={REPO}>GitHub</A>, so anyone can read what they’re trusting.
                </>,
                <>
                  <strong className="font-medium">Plain words.</strong> If a payment is refused, you see which rule
                  refused it and why.
                </>,
              ]}
            />
          ),
        },
        {
          id: 'today',
          title: 'Where we are',
          body: (
            <>
              <p>
                Oryne runs on Stellar testnet with test USDC, free to use. Everything you see works end to end: wallets,
                agents, mandates, approvals, payments, top-ups and teams.
              </p>
              <p>
                Mainnet with real USDC comes next, after an independent audit of the wallet contract. Follow along on the{' '}
                <Link to="/vision" className="underline underline-offset-4">
                  vision
                </Link>{' '}
                page or the <Link to="/status" className="underline underline-offset-4">status</Link> page.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          title: 'Get in touch',
          body: (
            <p>
              Building agents, running a paid API, or researching how software should pay? Write to{' '}
              <A href={`mailto:${EMAIL}`}>{EMAIL}</A> or use the{' '}
              <Link to="/contact" className="underline underline-offset-4">
                contact page
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
