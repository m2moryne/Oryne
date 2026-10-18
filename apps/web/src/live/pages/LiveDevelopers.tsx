import { ArrowRight, Bot } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CodeBlock, CopyButton } from '../../app/dev/devUi'
import { Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { API_URL } from '../api'
import { useLive } from '../LiveContext'

const REPO = 'https://github.com/m2moryne/Oryne'

/** A labelled value with a copy button, for IDs people paste into code. */
function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-taupe/40 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="type-label text-muted">{label}</p>
        <p className="mt-1 truncate font-mono text-xs">{value}</p>
      </div>
      <CopyButton value={value} className="text-muted hover:text-charcoal" />
    </div>
  )
}

/**
 * The real developer page: this account's wallet and the API's network, and
 * how to pay from code, from an MCP client, or get paid. Everything shown is
 * live; the full console with sample data lives in the preview account.
 */
export default function LiveDevelopers() {
  const live = useLive()
  const info = live.info
  const facilitator = info?.facilitator ?? `${API_URL}/v1/x402`
  const hasAgents = (live.wallet?.agents.length ?? 0) > 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">Developers</h1>
        <p className="mt-1 text-sm text-muted">
          Pay from your own code or an MCP client, or charge agents for your API. On Stellar {info?.network.replace('stellar-', '') ?? 'testnet'}.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel title="1. Connect an agent">
            <p className="text-sm leading-relaxed text-muted">
              Each agent gets its own key and mandate. Its secret key (S…) is shown once when you connect it:
              that's the <span className="font-mono text-charcoal">ORYNE_AGENT_SECRET</span> below.
            </p>
            <div className="mt-4">
              <Button to={hasAgents ? '/app/agents' : '/app/agents?connect=1'} size="sm" leadingIcon={Bot}>
                {hasAgents ? 'Your agents' : 'Connect an agent'}
              </Button>
            </div>
          </Panel>

          <Panel title="2. Get the SDKs">
            <p className="text-sm leading-relaxed text-muted">
              The agent SDK, MCP server and merchant kit aren't on npm yet. Use them from the repository; they run on
              Node 22.18 or later.
            </p>
            <div className="mt-4">
              <CodeBlock code={`git clone ${REPO}.git\ncd Oryne\nnpm install`} />
            </div>
          </Panel>

          <Panel title="3. Pay from code">
            <p className="text-sm leading-relaxed text-muted">
              <span className="font-mono text-charcoal">agent.fetch()</span> works like fetch. When a service answers
              402 Payment Required, it pays from your wallet within the agent's mandate and retries. Anything outside
              the mandate is refused by the contract, and the agent can ask you to approve it.
            </p>
            <div className="mt-4">
              <CodeBlock
                label="TypeScript"
                code={`import { OryneAgent } from '@oryne/agent'

const agent = new OryneAgent({
  secret: process.env.ORYNE_AGENT_SECRET!,
  apiUrl: '${API_URL}',
  maxPerRequest: '1', // never pay more than 1 USDC for one request
})

const response = await agent.fetch('https://api.example.com/search?q=stellar')
console.log(await response.json())`}
              />
            </div>
          </Panel>

          <Panel title="4. Or give Claude, Cursor or any MCP client a wallet">
            <p className="text-sm leading-relaxed text-muted">
              The MCP server gives the assistant tools to check its budget, find services, pay and ask you for
              approval. Add it to your client's MCP config:
            </p>
            <div className="mt-4">
              <CodeBlock
                label="claude_desktop_config.json"
                code={`{
  "mcpServers": {
    "oryne": {
      "command": "node",
      "args": ["/path/to/Oryne/packages/mcp/src/server.ts"],
      "env": {
        "ORYNE_AGENT_SECRET": "S…",
        "ORYNE_API_URL": "${API_URL}",
        "ORYNE_MAX_PER_REQUEST": "1"
      }
    }
  }
}`}
              />
            </div>
          </Panel>

          <Panel title="Accept payments from agents">
            <p className="text-sm leading-relaxed text-muted">
              Put a price on any route. Agents pay in USDC on Stellar, and Oryne's facilitator verifies and settles each
              payment before your handler runs. Your address needs a USDC trustline.
            </p>
            <div className="mt-4">
              <CodeBlock
                samples={{
                  Hono: `import { paywall } from '@oryne/merchant'

const pay = paywall({
  payTo: 'G…', // your Stellar address
  facilitator: '${facilitator}',
})

app.get('/search', pay('0.05', 'Search results'), (c) => c.json({ results }))`,
                  Express: `import { expressPaywall } from '@oryne/merchant'

const pay = expressPaywall({
  payTo: 'G…', // your Stellar address
  facilitator: '${facilitator}',
})

app.get('/search', pay('0.05', 'Search results'), (req, res) => res.json({ results }))`,
                }}
              />
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Your setup">
            {live.wallet && <Value label="Wallet contract" value={live.wallet.id} />}
            <Value label="API" value={API_URL} />
            <Value label="x402 facilitator" value={facilitator} />
            {info && <Value label="USDC token contract" value={info.token} />}
            {info && <Value label="Network passphrase" value={info.networkPassphrase} />}
          </Panel>

          <Panel title="See everything">
            <p className="text-sm leading-relaxed text-muted">
              Keys, webhooks, logs and usage are coming. Tour the full developer console with sample data in the
              preview account.
            </p>
            <Link
              to="/dev"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
            >
              Open the preview console <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  )
}
