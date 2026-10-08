import {
  ArrowRight,
  Banknote,
  BookOpen,
  ClipboardCheck,
  Code2,
  FileCheck2,
  ShieldCheck,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { CodeBlock } from '../app/dev/devUi'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { Container, type Tone } from '../components/Section'
import { TextLink } from '../components/TextLink'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'

type Module = { icon: LucideIcon; title: string; body: string; stage: 'MVP' | 'Next' }

const modules: Module[] = [
  {
    icon: Wallet,
    title: 'Agent wallet',
    body: 'A Soroban smart account you own, unlocked by a passkey. Holds USDC; agents get session keys, never your key.',
    stage: 'MVP',
  },
  {
    icon: ShieldCheck,
    title: 'Mandates',
    body: 'Budget per window, cap per payment, allowed services, expiry. Checked in __check_auth on every transfer.',
    stage: 'MVP',
  },
  {
    icon: ClipboardCheck,
    title: 'Approvals',
    body: 'Out-of-policy requests come to you. One tap with your passkey signs a one-time allowance on-chain.',
    stage: 'MVP',
  },
  {
    icon: FileCheck2,
    title: 'Receipts',
    body: 'Every payment indexed from contract events: which agent, which mandate, which transaction. Exportable.',
    stage: 'MVP',
  },
  {
    icon: Code2,
    title: 'MCP server and SDKs',
    body: 'A pay tool for any MCP agent, plus TypeScript and Python SDKs that answer 402s automatically.',
    stage: 'MVP',
  },
  {
    icon: Store,
    title: 'Merchant kit',
    body: 'Middleware for Express, Next.js and FastAPI. Price a route; get paid in USDC by agents.',
    stage: 'MVP',
  },
  {
    icon: BookOpen,
    title: 'Directory',
    body: 'Services that accept agent payments, with prices, uptime and reputation, searchable by agents themselves.',
    stage: 'Next',
  },
  {
    icon: Banknote,
    title: 'Local money in and out',
    body: 'Fund wallets and pay out through Stellar anchors: bank transfer, cards and mobile money.',
    stage: 'Next',
  },
]

const contractFns = [
  ['add_agent(key, policy)', 'Owner', 'Register an agent session key with its mandate'],
  ['set_policy(key, policy)', 'Owner', 'Change limits; spend so far stays counted'],
  ['set_paused(key, bool)', 'Owner', 'Freeze or resume an agent'],
  ['remove_agent(key)', 'Owner', 'Revoke a key for good'],
  ['approve_once(key, payee, amount, expiry)', 'Owner', 'Allow one out-of-policy payment'],
  ['withdraw(token, to, amount)', 'Owner', 'Move funds out'],
  ['__check_auth(payload, sig, contexts)', 'Network', 'Verify the agent and enforce the mandate'],
  ['remaining(key)', 'Anyone', 'Budget left in the current window'],
]

const code = {
  'MCP (Claude, Cursor)': `// claude_desktop_config.json
{
  "mcpServers": {
    "oryne": {
      "command": "npx",
      "args": ["@oryne/mcp"],
      "env": { "ORYNE_AGENT_KEY": "oryne_agent_…" }
    }
  }
}
// The agent now has tools: pay, balance, request_approval, find_service`,
  'Agent SDK': `import { OryneAgent } from '@oryne/agent'

const agent = new OryneAgent({ key: process.env.ORYNE_AGENT_KEY })

// fetch() that pays: answers 402 Payment Required with a signed USDC
// transfer from your wallet, inside the mandate, then retries.
const res = await agent.fetch('https://api.lumensearch.example/v1/search?q=stellar')

console.log(await res.json())
console.log(await agent.remaining()) // budget left this window`,
  'Merchant middleware': `import express from 'express'
import { paywall } from '@oryne/merchant'

const app = express()

// Agents pay 0.008 USDC per call. Settles to your Stellar address.
app.get('/v1/search', paywall({ price: '0.008', payTo: process.env.STELLAR_ADDRESS }), search)

app.listen(3000)`,
}

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

/** One box in the architecture drawing. */
function Node({ title, note, strong }: { title: string; note: string; strong?: boolean }) {
  return (
    <div className={cn('border p-4', strong ? 'border-cream' : 'border-line')}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  )
}

const Arrow = ({ label }: { label: string }) => (
  <p className="type-label flex items-center justify-center gap-2 py-3 text-center text-muted">
    <span aria-hidden="true">↓</span> {label}
  </p>
)

export default function Product() {
  usePageMeta(
    'Product — Oryne',
    'Agent wallets on Stellar with on-chain mandates, approvals, receipts, an MCP server, SDKs and a merchant kit.',
  )

  return (
    <>
      <PageHero
        label="Product"
        title="A wallet for every agent, and a contract that keeps it honest."
        lede="Oryne is a small set of parts that fit together: a smart wallet you own on Stellar, mandates enforced inside it, tools that let any agent pay, and a kit that lets any service get paid."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Button to="/app" icon={ArrowRight}>
            Open the dashboard
          </Button>
          <TextLink to="/dev" className="type-label">
            Developer console
          </TextLink>
        </div>
      </PageHero>

      <Band labelledBy="modules-title" className="pt-0 md:pt-0">
        <h2 id="modules-title" className="sr-only">
          What is in it
        </h2>
        <ul className="grid gap-px border border-line bg-taupe/50 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => (
            <li key={module.title} className="flex flex-col bg-white p-6 md:p-7">
              <div className="flex items-start justify-between text-muted">
                <Icon icon={module.icon} size={20} />
                <span
                  className={cn(
                    'border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em]',
                    module.stage === 'MVP' ? 'border-charcoal/40 text-charcoal' : 'border-taupe text-muted',
                  )}
                >
                  {module.stage === 'MVP' ? 'In the MVP' : 'Next'}
                </span>
              </div>
              <h3 className="mt-10 text-lg tracking-[-0.01em]">{module.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{module.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="charcoal" labelledBy="architecture-title">
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:col-span-5">
            <h2 id="architecture-title" className="type-statement max-w-[12ch]">
              Where the trust sits.
            </h2>
            <p className="type-lede mt-8 max-w-md text-muted">
              Everything that decides whether money moves is on-chain. Everything Oryne runs
              off-chain (the API, the indexer, the directory, notifications) makes it pleasant to
              use, but cannot spend a cent.
            </p>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-6 lg:col-start-7">
            <figure>
              <figcaption className="sr-only">
                The owner controls the agent wallet with a passkey. The agent signs payments with a
                session key. The wallet contract checks every payment against the mandate, then USDC
                moves to the service over x402 or MPP. Oryne's servers only index and notify.
              </figcaption>
              <div aria-hidden="true">
                <div className="grid grid-cols-2 gap-3">
                  <Node title="You" note="Passkey. Sets mandates, approves, withdraws." />
                  <Node title="Your agent" note="Session key. Can only request transfers." />
                </div>
                <Arrow label="owner calls · agent signs" />
                <Node
                  strong
                  title="Agent wallet contract (Soroban)"
                  note="Holds USDC. __check_auth enforces token, payee, per-payment cap, budget, expiry, pause."
                />
                <Arrow label="USDC transfer · x402 or MPP" />
                <div className="grid grid-cols-2 gap-3">
                  <Node title="Service" note="Paid in ~5 s. Uses the Oryne merchant kit or any x402 server." />
                  <Node title="Stellar ledger" note="The public record of every payment and mandate change." />
                </div>
                <div className="mt-8 border border-dashed border-line p-4">
                  <p className="type-label text-muted">Off-chain, run by Oryne</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    API and dashboard · event indexer and receipts · approval notifications ·
                    directory · MCP server · x402 facilitator with fee sponsorship
                  </p>
                </div>
              </div>
            </figure>
          </Reveal>
        </div>
      </Band>

      <Band labelledBy="code-title">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
          <div className="lg:col-span-4">
            <h2 id="code-title" className="text-3xl tracking-[-0.03em] md:text-4xl">
              A few lines on each side.
            </h2>
            <p className="mt-5 leading-relaxed text-muted">
              Agents pay with the MCP server or the SDK. Services charge with the middleware. Both
              speak x402, so either side also works with tools that aren&rsquo;t ours.
            </p>
          </div>
          <div className="lg:col-span-8">
            <CodeBlock samples={code} />
          </div>
        </div>
      </Band>

      <Band labelledBy="contract-title" className="pt-0 md:pt-0">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="contract-title" className="text-3xl tracking-[-0.03em] md:text-4xl">
            The contract, in full.
          </h2>
          <p className="text-sm text-muted">Open source · contracts/agent-wallet · Rust, Soroban SDK</p>
        </div>
        <div className="mt-8 overflow-x-auto border border-line">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-line text-muted">
                <th scope="col" className="px-5 py-3 font-medium">Function</th>
                <th scope="col" className="px-5 py-3 font-medium">Who</th>
                <th scope="col" className="px-5 py-3 font-medium">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/40">
              {contractFns.map(([fn, who, what]) => (
                <tr key={fn}>
                  <td className="px-5 py-3 font-mono text-[0.8125rem]">{fn}</td>
                  <td className="px-5 py-3 text-muted">{who}</td>
                  <td className="px-5 py-3">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </>
  )
}
