import { ArrowUpRight, Link2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CodeBlock } from '../app/dev/devUi'
import { Icon } from '../components/Icon'
import { Container } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import { cn } from '../lib/cn'
import { publicPages } from '../lib/seo'

/**
 * Developer documentation for the published packages: @oryne/agent, @oryne/mcp,
 * @oryne/merchant and @oryne/core. Everything here matches the code on npm;
 * when a package's API changes, change it here too.
 */

const API = 'https://oryne.onrender.com'
const FACILITATOR = `${API}/v1/x402`
const REPO = 'https://github.com/m2moryne/Oryne'

type NavItem = { id: string; label: string }
const nav: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Getting started',
    items: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'quickstart', label: 'Quickstart' },
      { id: 'testnet', label: 'Testnet endpoints' },
    ],
  },
  {
    title: 'Packages',
    items: [
      { id: 'agent', label: '@oryne/agent' },
      { id: 'mcp', label: '@oryne/mcp' },
      { id: 'merchant', label: '@oryne/merchant' },
      { id: 'core', label: '@oryne/core' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'mandates', label: 'Mandates' },
      { id: 'refusals', label: 'Refusal reasons' },
      { id: 'protocol', label: 'Payment protocol' },
      { id: 'environment', label: 'Environment variables' },
      { id: 'troubleshooting', label: 'Troubleshooting' },
    ],
  },
]
const allIds = nav.flatMap((group) => group.items.map((item) => item.id))

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/** A heading you can link to: hover shows a link icon that copies the URL. */
function Anchor({ id, level, children }: { id: string; level: 2 | 3; children: ReactNode }) {
  const Tag = level === 2 ? 'h2' : 'h3'
  const copy = () => {
    const url = `${location.origin}${location.pathname}#${id}`
    history.replaceState(null, '', `#${id}`)
    navigator.clipboard?.writeText(url).catch(() => {})
  }
  return (
    <Tag
      id={id}
      className={cn(
        'group flex items-center gap-2',
        level === 2 ? 'mt-20 text-3xl tracking-[-0.03em] first:mt-0 md:text-4xl' : 'mt-12 text-xl tracking-[-0.02em]',
      )}
    >
      {children}
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link to this section"
        className="text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon icon={Link2} size={level === 2 ? 18 : 15} />
      </button>
    </Tag>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[68ch] leading-relaxed text-muted">{children}</p>
}

/** Inline code. */
function C({ children }: { children: ReactNode }) {
  return <code className="bg-code px-1.5 py-0.5 font-mono text-[0.85em] text-charcoal">{children}</code>
}

function Code(props: { code?: string; samples?: Record<string, string>; label?: string }) {
  return (
    <div className="mt-5 max-w-3xl">
      <CodeBlock {...props} />
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-5 max-w-3xl overflow-x-auto border border-taupe/50">
      <table className="w-full text-left text-sm">
        <thead className="bg-code">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-4 py-2.5 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-taupe/50 align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cn('px-4 py-3 leading-relaxed', cellIndex > 0 && 'text-muted')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={cn(
        'mt-5 max-w-3xl border-l-2 bg-code px-4 py-3 text-sm leading-relaxed',
        tone === 'warn' ? 'border-burgundy' : 'border-charcoal',
      )}
    >
      {children}
    </div>
  )
}

/** A method or function signature, then what it does. */
function Api({ signature, children }: { signature: string; children: ReactNode }) {
  return (
    <div className="mt-6 max-w-3xl border-t border-taupe/50 pt-5">
      <p className="font-mono text-sm">{signature}</p>
      <div className="text-sm [&>p]:mt-2 [&>p]:text-[0.9375rem]">{children}</div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative mt-10 pl-12">
      <span className="absolute left-0 top-0 flex size-8 items-center justify-center border border-taupe font-mono text-xs">
        {n}
      </span>
      <h3 className="text-lg tracking-[-0.01em]">{title}</h3>
      {children}
    </li>
  )
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-4">
      {children}
      <Icon icon={ArrowUpRight} size={13} />
    </a>
  )
}

/** Which section is on screen, for the sidebar. */
function useActiveSection() {
  const [active, setActive] = useState(allIds[0])
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    allIds.forEach((id) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])
  return active
}

function Sidebar({ active, onPick }: { active: string; onPick?: () => void }) {
  return (
    <nav aria-label="Documentation" className="space-y-8 text-sm">
      {nav.map((group) => (
        <div key={group.title}>
          <p className="type-label text-muted">{group.title}</p>
          <ul className="mt-3 space-y-0.5 border-l border-taupe/50">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={onPick}
                  className={cn(
                    '-ml-px block border-l py-1.5 pl-4 transition-colors',
                    item.label.startsWith('@') && 'font-mono text-[0.8125rem]',
                    active === item.id ? 'border-charcoal text-charcoal' : 'border-transparent text-muted hover:text-charcoal',
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Docs() {
  usePageMeta(publicPages.docs)
  const active = useActiveSection()
  const [open, setOpen] = useState(false)

  return (
    <div className="tone-white pt-(--nav-h)">
      <Container className="grid gap-10 pb-24 pt-10 md:pt-16 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-[calc(var(--nav-h)+2rem)] lg:max-h-[calc(100svh-var(--nav-h)-3rem)] lg:self-start lg:overflow-y-auto">
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              className="flex w-full items-center justify-between border border-taupe/50 px-4 py-3 text-sm"
            >
              <span>Contents</span>
              <span className="text-muted">{nav.flatMap((g) => g.items).find((i) => i.id === active)?.label}</span>
            </button>
            {open && (
              <div className="border border-t-0 border-taupe/50 p-4">
                <Sidebar active={active} onPick={() => setOpen(false)} />
              </div>
            )}
          </div>
          <div className="hidden lg:block">
            <Sidebar active={active} />
          </div>
        </aside>

        <article className="min-w-0">
          <p className="type-label text-muted">Documentation</p>
          <h1 className="mt-4 text-4xl tracking-[-0.035em] md:text-5xl">Build with Oryne</h1>
          <p className="type-lede mt-5 max-w-2xl text-muted">
            Give an agent a wallet it can pay from, inside limits a smart contract enforces. Or charge agents for your
            API. Four packages on npm, TypeScript types included, Node 20 or later.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs">
            {['agent', 'mcp', 'merchant', 'core'].map((name) => (
              <a
                key={name}
                href={`https://www.npmjs.com/package/@oryne/${name}`}
                target="_blank"
                rel="noreferrer"
                className="border border-taupe/50 px-2.5 py-1 hover:border-charcoal"
              >
                @oryne/{name}
              </a>
            ))}
          </div>

          {/* ---------------- Getting started ---------------- */}

          <div className="mt-16">
            <Anchor id="introduction" level={2}>
              Introduction
            </Anchor>
            <P>
              Oryne gives each AI agent its own key to a wallet you own. The wallet is a Soroban smart contract on
              Stellar that holds USDC. When the agent pays, the contract checks the payment against that agent's{' '}
              <a href="#mandates" className="underline underline-offset-4">mandate</a> (most per payment, budget per
              period, allowed payees, expiry) and refuses anything outside it. The agent never holds the money, and
              nothing it does can get past the check.
            </P>
            <P>Services charge agents with x402: they answer an unpaid request with 402 Payment Required and a price.</P>
            <Code
              label="How a paid request flows"
              code={`agent.fetch(url)
  → service answers 402 Payment Required: { price, payTo, … }
  → agent signs a USDC transfer from its wallet with its own key
  → retries with the X-PAYMENT header
  → service hands it to the Oryne facilitator, which submits it to Stellar
  → the wallet contract checks the mandate: pays, or refuses with a reason
  → service returns the content (about 5 seconds end to end)`}
            />
            <Table
              head={['You want to', 'Use']}
              rows={[
                [<>Pay from your own agent's code</>, <a href="#agent" className="font-mono underline underline-offset-4">@oryne/agent</a>],
                [<>Let Claude, Cursor or any MCP client pay</>, <a href="#mcp" className="font-mono underline underline-offset-4">@oryne/mcp</a>],
                [<>Charge agents for your API</>, <a href="#merchant" className="font-mono underline underline-offset-4">@oryne/merchant</a>],
                [<>Build your own client on the contract</>, <a href="#core" className="font-mono underline underline-offset-4">@oryne/core</a>],
              ]}
            />

            <Anchor id="quickstart" level={2}>
              Quickstart
            </Anchor>
            <P>An agent that pays for an API, on testnet, in about five minutes. No real money is involved.</P>
            <ol>
              <Step n={1} title="Create a wallet and connect an agent">
                <P>
                  Sign in to the <Link to="/app" className="underline underline-offset-4">dashboard</Link>. Your wallet
                  is created on first sign-in. Under Agents, choose Connect agent, give it a name and limits, and copy
                  its secret key (<C>S…</C>). It's shown once.
                </P>
              </Step>
              <Step n={2} title="Add test USDC">
                <P>On the dashboard overview, add test USDC to the wallet. It's free and arrives in a few seconds.</P>
              </Step>
              <Step n={3} title="Install the SDK">
                <Code code="npm install @oryne/agent" />
                <Code label=".env" code="ORYNE_AGENT_SECRET=S…" />
              </Step>
              <Step n={4} title="Make a paid request">
                <Code
                  label="agent.ts"
                  code={`import { OryneAgent } from '@oryne/agent'

const agent = new OryneAgent({
  secret: process.env.ORYNE_AGENT_SECRET!,
  maxPerRequest: '1', // never pay more than 1 USDC for one request
  onPayment: (event) => console.log(event.type, event.amount),
})

// Works like fetch(). If the service answers 402, it pays and retries.
const response = await agent.fetch('https://api.example.com/search?q=stellar')
console.log(await response.json())

// What's left of this agent's budget
const { agent: me } = await agent.me(true)
console.log(me.remaining, 'USDC left')`}
                />
                <Code label="Terminal" code="node --env-file=.env agent.ts" />
                <P>
                  Node 22.18 and later run <C>.ts</C> files directly. On older versions, use <C>npx tsx agent.ts</C>{' '}
                  or plain JavaScript.
                </P>
              </Step>
              <Step n={5} title="Watch it on the dashboard">
                <P>
                  The payment shows under Activity with its Stellar transaction. Try a price above the agent's limit:
                  the wallet refuses it, and <C>fetch</C> throws a{' '}
                  <a href="#agent-errors" className="underline underline-offset-4">PaymentRefusedError</a> naming the
                  reason.
                </P>
              </Step>
            </ol>
            <Note>
              Need a paid API to test against? Put a <a href="#merchant" className="underline underline-offset-4">paywall</a>{' '}
              on a local route in a few lines, or run the{' '}
              <Ext href={`${REPO}/tree/master/examples/demo-merchant`}>demo merchant</Ext> from the repository.
            </Note>

            <Anchor id="testnet" level={2}>
              Testnet endpoints
            </Anchor>
            <P>Everything runs on Stellar testnet for now. The packages use these by default.</P>
            <Table
              head={['', 'Value']}
              rows={[
                ['Oryne API', <C>{API}</C>],
                ['x402 facilitator', <C>{FACILITATOR}</C>],
                ['Network', <><C>stellar-testnet</C> (x402 network name)</>],
                ['Network info', <><C>GET {API}/v1/info</C>: token contract, RPC, passphrase</>],
                ['Explorer', <Ext href="https://stellar.expert/explorer/testnet">stellar.expert/explorer/testnet</Ext>],
              ]}
            />
            <Note tone="warn">
              The hosted API sleeps when idle. The first request after a quiet spell can take up to a minute; the rest
              are fast. The contract isn't audited yet, so don't use it with real funds.
            </Note>
          </div>

          {/* ---------------- Packages ---------------- */}

          <Anchor id="agent" level={2}>
            @oryne/agent
          </Anchor>
          <P>A <C>fetch()</C> that pays. For agents you write yourself, in any Node framework or agent library.</P>
          <Code code="npm install @oryne/agent" />

          <Anchor id="agent-options" level={3}>
            new OryneAgent(options)
          </Anchor>
          <Table
            head={['Option', 'Type', 'Description']}
            rows={[
              [<C>secret</C>, <C>string</C>, <>The agent's secret key, <C>S…</C>. Required. Keep it in an environment variable.</>],
              [<C>apiUrl</C>, <C>string</C>, <>Oryne API. Defaults to <C>ORYNE_API_URL</C>, then <C>{API}</C>.</>],
              [<C>maxPerRequest</C>, <C>string</C>, <>Most this client pays for one request, in USDC, e.g. <C>'1'</C>. A second guard on top of the mandate.</>],
              [<C>onPayment</C>, <C>(event) =&gt; void</C>, <>Called with <C>paying</C>, <C>paid</C> and <C>refused</C> events. See below.</>],
            ]}
          />

          <Anchor id="agent-methods" level={3}>
            Methods
          </Anchor>
          <Api signature="agent.fetch(input, init?): Promise<Response>">
            <P>
              Same arguments as <C>fetch</C>. A 402 with an Oryne-compatible price (same network and token) is paid
              and the request retried with the payment; the paid response comes back. Other responses pass through
              unchanged, including a 402 this wallet can't pay in. Throws <C>PaymentRefusedError</C> when the payment
              is refused.
            </P>
          </Api>
          <Api signature="agent.me(refresh = false): Promise<AgentInfo>">
            <P>
              The agent, its wallet, its limits and what it has left: <C>agent.remaining</C>, <C>agent.perTx</C>,{' '}
              <C>agent.budget</C>, <C>agent.status</C>, plus <C>walletBalance</C> and network details. Cached; pass{' '}
              <C>true</C> for fresh numbers.
            </P>
          </Api>
          <Api signature="agent.requestApproval({ payTo, amount, description, resource?, reason? }): Promise<Approval>">
            <P>
              Asks the owner to allow one payment the mandate refused. <C>amount</C> is in USDC, e.g. <C>'30'</C>;{' '}
              <C>description</C> is the sentence the owner reads. Returns an approval with status <C>pending</C>.
            </P>
          </Api>
          <Api signature="agent.waitForApproval(id, { timeoutMs = 600000, intervalMs = 3000 }?): Promise<Approval>">
            <P>
              Polls until the owner decides or the timeout passes. Status is then <C>approved</C>, <C>declined</C>,{' '}
              <C>expired</C>, or still <C>pending</C> on timeout.
            </P>
          </Api>
          <Api signature="agent.approval(id): Promise<Approval>">
            <P>One approval's current state.</P>
          </Api>
          <Api signature="agent.publicKey: string">
            <P>The agent's public key (<C>G…</C>), as shown on the dashboard.</P>
          </Api>

          <Anchor id="agent-events" level={3}>
            Payment events
          </Anchor>
          <Code
            label="TypeScript"
            code={`type PaymentEvent =
  | { type: 'paying'; amount: string; requirements: PaymentRequirements }
  | { type: 'paid'; amount: string; settlement: { success: true; transaction: string; ledger: number } }
  | { type: 'refused'; amount: string; reason: string }`}
          />

          <Anchor id="agent-errors" level={3}>
            Handling a refusal
          </Anchor>
          <P>
            <C>PaymentRefusedError</C> carries the <a href="#refusals" className="underline underline-offset-4">reason</a>{' '}
            and the service's <C>requirements</C> (price, payee, resource), which is everything needed to ask the owner.
          </P>
          <Code
            label="TypeScript"
            code={`import { OryneAgent, PaymentRefusedError } from '@oryne/agent'

const agent = new OryneAgent({ secret: process.env.ORYNE_AGENT_SECRET! })

async function fetchWithApproval(url: string) {
  try {
    return await agent.fetch(url)
  } catch (error) {
    if (!(error instanceof PaymentRefusedError)) throw error
    console.log('Refused:', error.reason) // e.g. "OverPerTxLimit"

    const approval = await agent.requestApproval({
      payTo: error.requirements.payTo,
      amount: '30',
      description: 'Research report for the weekly summary',
      resource: error.requirements.resource,
      reason: error.reason,
    })
    const decided = await agent.waitForApproval(approval.id)
    if (decided.status !== 'approved') throw new Error(\`Owner \${decided.status} the payment\`)
    return agent.fetch(url) // allowed once, for this payee and amount
  }
}`}
          />

          <Anchor id="mcp" level={2}>
            @oryne/mcp
          </Anchor>
          <P>
            An MCP server that gives an assistant a wallet: Claude Desktop, Claude Code, Cursor, or any MCP client. No
            install needed; <C>npx</C> fetches it.
          </P>
          <Code
            samples={{
              'Claude Desktop': `// claude_desktop_config.json
{
  "mcpServers": {
    "oryne": {
      "command": "npx",
      "args": ["-y", "@oryne/mcp"],
      "env": {
        "ORYNE_AGENT_SECRET": "S…",
        "ORYNE_MAX_PER_REQUEST": "1"
      }
    }
  }
}`,
              'Claude Code': `claude mcp add oryne -e ORYNE_AGENT_SECRET=S… -- npx -y @oryne/mcp`,
              Cursor: `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "oryne": {
      "command": "npx",
      "args": ["-y", "@oryne/mcp"],
      "env": { "ORYNE_AGENT_SECRET": "S…" }
    }
  }
}`,
            }}
          />
          <P>
            Claude Desktop's config is under Settings → Developer → Edit Config. Restart the app after saving.
          </P>

          <Anchor id="mcp-tools" level={3}>
            Tools
          </Anchor>
          <Table
            head={['Tool', 'Input', 'What it does']}
            rows={[
              [<C>fetch_paid</C>, <><C>url</C>, <C>method?</C>, <C>body?</C></>, 'Fetches a URL. Pays a 402 inside the mandate and returns the response, or says why the wallet refused.'],
              [<C>wallet_status</C>, '—', 'The wallet, its balance, the agent\'s limits and the budget left.'],
              [<C>request_approval</C>, <><C>payTo</C>, <C>amount</C>, <C>description</C>, <C>resource?</C></>, 'Asks the owner to approve one payment; waits up to two minutes for an answer.'],
              [<C>find_service</C>, <C>query</C>, 'Searches the Oryne directory for services that accept agent payments.'],
            ]}
          />
          <P>Try asking: “Check my Oryne wallet, then fetch https://… and tell me what it cost.”</P>

          <Anchor id="merchant" level={2}>
            @oryne/merchant
          </Anchor>
          <P>
            Charge agents per request. Unpaid requests get 402 with your price; paid ones are settled on Stellar before
            your handler runs. Your customers need no account or API key with you.
          </P>
          <Code code="npm install @oryne/merchant" />
          <Code
            samples={{
              Hono: `import { Hono } from 'hono'
import { paywall } from '@oryne/merchant'

const pay = paywall({
  payTo: process.env.STELLAR_ADDRESS!, // where the money goes
  facilitator: '${FACILITATOR}',
})

const app = new Hono()
app.get('/search', pay('0.01', 'One search'), (c) => c.json({ results: [] }))

export default app`,
              Express: `import express from 'express'
import { expressPaywall } from '@oryne/merchant'

const pay = expressPaywall({
  payTo: process.env.STELLAR_ADDRESS!,
  facilitator: '${FACILITATOR}',
})

const app = express()
app.get('/search', pay('0.01', 'One search'), (req, res) => res.json({ results: [] }))
app.listen(3000)`,
              'Any framework': `import { createPaywall } from '@oryne/merchant'

const paywall = createPaywall({ payTo: process.env.STELLAR_ADDRESS!, facilitator: '${FACILITATOR}' })

// In your request handler:
const result = await paywall.handle({
  price: '0.01',
  url: request.url,
  paymentHeader: request.headers.get('X-PAYMENT'),
  description: 'One search',
})
if (!result.paid) return Response.json(result.body, { status: 402 })

return Response.json(results, {
  headers: { 'X-PAYMENT-RESPONSE': result.receipt }, // the settlement receipt
})`,
            }}
          />

          <Anchor id="merchant-options" level={3}>
            Options
          </Anchor>
          <Table
            head={['Option', 'Description']}
            rows={[
              [<C>payTo</C>, <>Your Stellar address. A <C>G…</C> account needs a USDC trustline; a contract address (<C>C…</C>) doesn't.</>],
              [<C>facilitator</C>, <>The facilitator URL: <C>{FACILITATOR}</C> on testnet.</>],
              [<><C>network</C>, <C>asset</C>, <C>decimals</C></>, <>Read once from the facilitator's <C>/v1/info</C> when left out.</>],
            ]}
          />
          <P>
            <C>pay(price, description?)</C>: <C>price</C> is in USDC as a string (<C>'0.01'</C>), up to 7 decimals.
            The description is shown to the agent and on the owner's dashboard.
          </P>

          <Anchor id="merchant-test" level={3}>
            Test your paywall
          </Anchor>
          <Code
            label="Terminal"
            code={`# Without paying: 402 and the price
curl -i http://localhost:3000/search

# Paying: run an agent against it
node -e "import('@oryne/agent').then(async ({ OryneAgent }) => {
  const agent = new OryneAgent({ secret: process.env.ORYNE_AGENT_SECRET })
  const res = await agent.fetch('http://localhost:3000/search')
  console.log(res.status, await res.json())
})"`}
          />

          <Anchor id="core" level={2}>
            @oryne/core
          </Anchor>
          <P>
            The Stellar side, shared by the other packages. You only need it to build your own client or facilitator.
          </P>
          <Code code="npm install @oryne/core" />
          <Table
            head={['Export', 'What it is']}
            rows={[
              [<><C>TESTNET</C>, <C>MAINNET</C>, <C>networks</C></>, 'RPC URL, passphrase and token for each network.'],
              [<><C>toBaseUnits</C>, <C>fromBaseUnits</C></>, <>USDC amounts to and from base units (7 decimals): <C>'0.01'</C> ↔ <C>100000n</C>.</>],
              [<C>signPayment</C>, 'Builds and signs the Soroban authorization for an x402 payment with the agent key.'],
              [<><C>encodeHeader</C>, <C>decodeHeader</C></>, <>The base64 JSON format of <C>X-PAYMENT</C> and <C>X-PAYMENT-RESPONSE</C>.</>],
              [<C>readAuthorization</C>, 'Reads the token, payer, payee and amount out of a signed authorization.'],
              [<><C>contractErrors</C>, <C>contractErrorName</C></>, 'The wallet contract\'s error codes, by name.'],
              [<>Types</>, <><C>PaymentRequirements</C>, <C>PaymentRequired</C>, <C>PaymentPayload</C>, <C>SettleResponse</C>, <C>Policy</C></>],
            ]}
          />

          {/* ---------------- Reference ---------------- */}

          <Anchor id="mandates" level={2}>
            Mandates
          </Anchor>
          <P>
            The rules an agent pays under. The owner sets them on the dashboard; they live in the wallet contract, and
            only the owner's passkey can change them.
          </P>
          <Table
            head={['Rule', 'Meaning']}
            rows={[
              ['Per payment', 'The most one payment can be.'],
              ['Budget and period', 'The most the agent can spend in a rolling period, e.g. 20 USDC every 30 days. Spending so far stays counted when limits change.'],
              ['Payees', 'Addresses the agent may pay. Empty means any.'],
              ['Expiry', 'After this time the agent can\'t pay at all. Optional.'],
              ['Paused', 'The owner can freeze an agent at any time, and resume it.'],
            ]}
          />
          <P>
            One payment outside the mandate can be allowed with an approval: the agent asks, the owner approves on the
            dashboard, and the contract lets that payee and amount through once.
          </P>

          <Anchor id="refusals" level={2}>
            Refusal reasons
          </Anchor>
          <P>
            What <C>PaymentRefusedError.reason</C>, the <C>refused</C> event and the MCP tools report, and what to do
            about each.
          </P>
          <Table
            head={['Reason', 'Meaning', 'What to do']}
            rows={[
              [<C>OverPerTxLimit</C>, 'The price is above the most per payment.', 'Request an approval, or raise the limit.'],
              [<C>OverBudget</C>, 'Not enough budget left this period.', 'Wait for the period to roll over, request an approval, or raise the budget.'],
              [<C>PayeeNotAllowed</C>, 'This service isn\'t on the agent\'s payee list.', 'Request an approval, or add the payee.'],
              [<C>AgentPaused</C>, 'The owner paused this agent.', 'Ask the owner to resume it.'],
              [<C>AgentExpired</C>, 'The mandate\'s expiry has passed.', 'The owner sets a new expiry.'],
              [<C>UnknownAgent</C>, 'The key isn\'t on this wallet, or was removed.', 'Check the secret; reconnect the agent.'],
              [<C>WrongToken</C>, 'The service asked for a token this agent may not spend.', 'Use a service that accepts USDC.'],
              [<C>InvalidAmount</C>, 'Zero, negative or malformed price.', 'A problem on the service\'s side.'],
              [<>Asks …, above this client's maxPerRequest</>, <>Blocked by your own <C>maxPerRequest</C>, before signing.</>, 'Raise maxPerRequest if the price is expected.'],
            ]}
          />
          <P>
            A wallet without enough USDC fails at settlement with a balance error from Stellar. Add funds on the
            dashboard.
          </P>

          <Anchor id="protocol" level={2}>
            Payment protocol
          </Anchor>
          <P>
            Oryne speaks <Ext href="https://x402.org">x402</Ext> with the <C>exact</C> scheme on Stellar. You don't
            need any of this to use the packages; it's here for building your own client or server.
          </P>
          <Anchor id="protocol-402" level={3}>
            1. The service asks for payment
          </Anchor>
          <Code
            label="HTTP/1.1 402 Payment Required"
            code={`{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [{
    "scheme": "exact",
    "network": "stellar-testnet",
    "asset": "C…",                  // USDC token contract
    "maxAmountRequired": "100000",  // base units: 0.01 USDC
    "payTo": "G…",
    "resource": "https://api.example.com/search",
    "description": "One search",
    "facilitator": "${FACILITATOR}",
    "maxTimeoutSeconds": 60
  }]
}`}
          />
          <Anchor id="protocol-pay" level={3}>
            2. The agent retries with a payment
          </Anchor>
          <P>
            The <C>X-PAYMENT</C> header is base64 JSON. <C>authorization</C> is a Soroban authorization entry for{' '}
            <C>transfer(wallet, payTo, amount)</C>, signed by the agent key. The payee and amount are inside what was
            signed, so nobody along the way can change them.
          </P>
          <Code
            label="X-PAYMENT (decoded)"
            code={`{
  "x402Version": 1,
  "scheme": "exact",
  "network": "stellar-testnet",
  "payload": {
    "from": "C…",           // the agent's wallet
    "authorization": "AAAA…" // base64 XDR, signed by the agent
  }
}`}
          />
          <Anchor id="protocol-settle" level={3}>
            3. The service settles and answers
          </Anchor>
          <P>
            The service posts the payment to <C>{FACILITATOR}/settle</C> (or <C>/verify</C> to check without
            submitting). The wallet contract's <C>__check_auth</C> enforces the mandate as the transfer runs. The
            response carries the receipt:
          </P>
          <Code
            label="X-PAYMENT-RESPONSE (decoded)"
            code={`{ "success": true, "transaction": "9f3c…", "ledger": 123456, "payer": "C…" }
// or
{ "success": false, "errorReason": "OverBudget" }`}
          />

          <Anchor id="environment" level={2}>
            Environment variables
          </Anchor>
          <Table
            head={['Variable', 'Used by', 'Description']}
            rows={[
              [<C>ORYNE_AGENT_SECRET</C>, 'mcp', <>The agent's secret key, <C>S…</C>. Required. In code, pass it as <C>secret</C>.</>],
              [<C>ORYNE_API_URL</C>, 'agent, mcp', <>Oryne API. Defaults to <C>{API}</C>.</>],
              [<C>ORYNE_MAX_PER_REQUEST</C>, 'mcp', <>Most the assistant pays for one request, e.g. <C>1</C>.</>],
            ]}
          />

          <Anchor id="troubleshooting" level={2}>
            Troubleshooting
          </Anchor>
          <Table
            head={['Symptom', 'Cause and fix']}
            rows={[
              ['The first call takes up to a minute', 'The hosted testnet API was asleep. Later calls are fast.'],
              [<>An “unknown agent” error from the Oryne API</>,'The secret is wrong, or the agent was removed. Copy the key again by reconnecting the agent.'],
              [<>A 402 comes back from <C>agent.fetch</C> without paying</>, <>The service wants a different network or token than your wallet's. <C>agent.fetch</C> only pays USDC on the same Stellar network.</>],
              [<>Payment fails with a balance error</>, 'The wallet is out of USDC. Add funds on the dashboard.'],
              [<>Merchant: settlement fails for every payment</>, <>Your <C>payTo</C> account has no USDC trustline. Add one, or use a contract address.</>],
              [<>MCP tools don't appear</>, 'Restart the client after editing its config, and check the JSON is valid. The server logs to stderr in the client\'s MCP log.'],
              [<><C>ERR_REQUIRE_ESM</C></>, <>The packages are ES modules. Use <C>import</C>, or <C>await import()</C> from CommonJS.</>],
            ]}
          />

          <div className="mt-20 max-w-3xl border-t border-taupe/50 pt-8 text-sm text-muted">
            Something unclear or missing? <Ext href={`${REPO}/issues`}>Open an issue</Ext> or{' '}
            <Link to="/contact" className="underline underline-offset-4">contact us</Link>. Source:{' '}
            <Ext href={REPO}>github.com/m2moryne/Oryne</Ext>. All packages are MIT licensed.
          </div>
        </article>
      </Container>
    </div>
  )
}
