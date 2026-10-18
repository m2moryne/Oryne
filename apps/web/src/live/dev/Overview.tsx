import { Bot } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CodeBlock } from '../../app/dev/devUi'
import { allDevPages, devPath } from '../../app/dev/devNav'
import { Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { API_URL } from '../api'
import { useLive } from '../LiveContext'
import { DEV_BASE } from './LiveDevShell'
import { realPages, REPO, Value } from './shared'

const comingSoon = allDevPages.filter((page) => page.slug && !realPages.includes(page.slug))

/**
 * The developer console's overview for a real account: this account's wallet
 * and the API's network, and the steps to an agent that pays from code or an
 * MCP client. Everything shown is live.
 */
export default function Overview() {
  const live = useLive()
  const info = live.info
  const facilitator = info?.facilitator ?? `${API_URL}/v1/x402`
  const hasAgents = (live.wallet?.agents.length ?? 0) > 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Pay from your own code or an MCP client. On Stellar {info?.network.replace('stellar-', '') ?? 'testnet'}.
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
              <Button to={hasAgents ? `${DEV_BASE}/agents` : `${DEV_BASE}/agents?connect=1`} size="sm" leadingIcon={Bot}>
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

        </div>

        <div className="space-y-4">
          <Panel title="Your setup">
            {live.wallet && <Value label="Wallet contract" value={live.wallet.id} />}
            <Value label="API" value={API_URL} />
            <Value label="x402 facilitator" value={facilitator} />
            {info && <Value label="USDC token contract" value={info.token} />}
            {info && <Value label="Network passphrase" value={info.networkPassphrase} />}
          </Panel>

          <Panel title="In development">
            <ul className="space-y-2.5 text-sm">
              {comingSoon.map((page) => (
                <li key={page.slug}>
                  <Link to={devPath(DEV_BASE, page.slug)} className="flex items-center gap-3 text-muted hover:text-charcoal">
                    <Icon icon={page.icon} size={16} />
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
