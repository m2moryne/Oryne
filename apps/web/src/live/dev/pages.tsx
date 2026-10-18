import { ExternalLink } from 'lucide-react'
import { CodeBlock } from '../../app/dev/devUi'
import { Panel } from '../../app/ui'
import { Icon } from '../../components/Icon'
import { API_URL, explorerAccount, explorerTx } from '../api'
import { useLive } from '../LiveContext'
import { REPO, Value } from './shared'

/** The real developer pages that aren't the overview: SDKs, accepting payments, contracts. */

const packages = [
  {
    name: '@oryne/agent',
    path: 'packages/agent',
    note: 'A fetch() that pays 402 Payment Required from the agent’s wallet, inside its mandate, and can ask the owner to approve the rest.',
  },
  {
    name: '@oryne/mcp',
    path: 'packages/mcp',
    note: 'An MCP server for Claude, Cursor and other clients: fetch_paid, wallet_status, request_approval and find_service.',
  },
  {
    name: '@oryne/merchant',
    path: 'packages/merchant',
    note: 'Paywall middleware for Hono and Express. Put a price on a route; Oryne verifies and settles the payment.',
  },
  {
    name: '@oryne/core',
    path: 'packages/core',
    note: 'The agent-wallet contract client, payment signing and the x402 payload format the others are built on.',
  },
]

export function Sdks() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">SDKs & tools</h1>
        <p className="mt-1 text-sm text-muted">TypeScript, on Node 22.18 or later. Not on npm yet: use them from the repository.</p>
      </div>
      <CodeBlock code={`git clone ${REPO}.git\ncd Oryne\nnpm install`} />
      <div className="grid gap-4 md:grid-cols-2">
        {packages.map((pkg) => (
          <Panel key={pkg.name}>
            <p className="font-mono text-sm">{pkg.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{pkg.note}</p>
            <a
              href={`${REPO}/tree/master/${pkg.path}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
            >
              Source <Icon icon={ExternalLink} size={13} />
            </a>
          </Panel>
        ))}
      </div>
    </div>
  )
}

export function Merchant() {
  const live = useLive()
  const facilitator = live.info?.facilitator ?? `${API_URL}/v1/x402`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">Accept payments</h1>
        <p className="mt-1 text-sm text-muted">
          Charge agents per request. They pay in USDC on Stellar, and Oryne’s facilitator verifies and settles each
          payment before your handler runs.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel title="Put a price on a route">
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-mono text-charcoal">payTo</span> is your Stellar address; it needs a trustline to
            the USDC token. Unpaid requests get a 402 with the price, which Oryne agents pay automatically.
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
        <Panel title="Settlement">
          <Value label="x402 facilitator" value={facilitator} />
          {live.info && <Value label="USDC token contract" value={live.info.token} />}
          {live.info && <Value label="Network" value={live.info.network} />}
        </Panel>
      </div>
    </div>
  )
}

export function Contracts() {
  const live = useLive()
  const { info, wallet } = live
  const network = info?.network ?? ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">Contracts</h1>
        <p className="mt-1 text-sm text-muted">
          Your wallet is a Soroban smart contract you own. It holds the USDC and checks every agent payment against
          its mandate in <span className="font-mono">__check_auth</span>.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Your agent wallet">
          {wallet ? (
            <>
              <Value label="Contract ID" value={wallet.id} />
              <Value label="Owner" value={`${wallet.owner_kind === 'passkey' ? 'Passkey' : 'Stellar account'} · ${wallet.owner}`} />
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a href={explorerAccount(network, wallet.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4">
                  On Stellar Expert <Icon icon={ExternalLink} size={13} />
                </a>
                {wallet.tx_hash && (
                  <a href={explorerTx(network, wallet.tx_hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4">
                    Deployment transaction <Icon icon={ExternalLink} size={13} />
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No wallet yet.</p>
          )}
        </Panel>
        <Panel title="The code it runs">
          {info?.walletWasmHash && <Value label="Wasm hash" value={info.walletWasmHash} />}
          {info && <Value label="Fee sponsor" value={info.sponsor} />}
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Built and tested in CI from the repository. Not audited yet: don’t use it with real funds.
          </p>
          <a
            href={`${REPO}/tree/master/contracts/contracts/agent-wallet`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            Contract source <Icon icon={ExternalLink} size={13} />
          </a>
        </Panel>
      </div>
    </div>
  )
}
