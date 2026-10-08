import { hexHash, ledgerAt, NETWORK, shortKey, strkey } from '../../../lib/network'
import { formatDateTime } from '../../format'
import { useStore } from '../../store'
import { Panel, Stat } from '../../ui'
import { CodeBlock, Mono } from '../devUi'

const HOUR = 3_600_000

const interfaceFns = [
  ['__constructor(owner: Address)', 'Deploy with an owner: passkey wallet, G-account or multisig'],
  ['add_agent(agent: BytesN<32>, policy: Policy)', 'Register an agent session key'],
  ['set_policy(agent, policy)', 'Replace limits; spend this window stays counted'],
  ['set_paused(agent, paused: bool)', 'Freeze or resume'],
  ['remove_agent(agent)', 'Revoke for good'],
  ['approve_once(agent, payee, amount, expires_at)', 'One payment outside the policy'],
  ['withdraw(token, to, amount)', 'Owner moves funds out'],
  ['set_owner(new_owner)', 'Rotate the owner'],
  ['remaining(agent) → i128', 'Budget left this window'],
  ['__check_auth(payload, AgentSignature, Vec<Context>)', 'Called by the network on every agent transfer'],
]

const errors = [
  ['1', 'UnknownAgent'],
  ['2', 'AgentPaused'],
  ['3', 'AgentExpired'],
  ['4', 'NotATransfer'],
  ['5', 'WrongToken'],
  ['6', 'PayeeNotAllowed'],
  ['7', 'OverPerTxLimit'],
  ['8', 'OverBudget'],
  ['9', 'InvalidAmount'],
  ['10', 'AgentExists'],
  ['11', 'InvalidPolicy'],
]

const deploy = `cd contracts
cargo test
stellar contract build

# Upload once, then deploy a wallet per owner from the same wasm
stellar contract upload --wasm target/wasm32v1-none/release/agent_wallet.wasm \\
  --source deployer --network testnet

stellar contract deploy --wasm-hash ${shortKey(NETWORK.walletWasm, 8, 8)} \\
  --source deployer --network testnet -- --owner <OWNER_ADDRESS>`

/** The agent-wallet contract as a developer sees it: versions, wallets deployed, events. */
export default function Contracts() {
  const { state } = useStore()
  const live = state.dev.mode === 'live'
  const events = Array.from({ length: 12 }, (_, i) => {
    const at = Date.now() - i * 0.37 * HOUR - (i % 3) * 600_000
    const kind = ['agent_spend', 'agent_spend', 'agent_added', 'agent_spend', 'approve_once', 'agent_spend'][i % 6]
    return {
      id: `ev_${i}`,
      at,
      kind,
      wallet: strkey(`dev-wallet-${i % 5}`, 'C'),
      hash: hexHash(`dev-event-${i}`),
    }
  })

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Contracts</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Contract" value={`agent-wallet v${NETWORK.walletVersion}`} note="Rust · Soroban SDK 26" />
        <Stat label="Network" value={live ? 'Mainnet' : 'Testnet'} note={live ? 'After audit' : 'Free to experiment'} />
        <Stat label="Wallets deployed" value={live ? '0' : '1,284'} note="By your organization's users" />
        <Stat label="Audit" value="Pending" note="Required before mainnet funds" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Deployment">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Wasm hash</dt>
              <dd className="mt-1 font-mono text-[0.8125rem] break-all">{NETWORK.walletWasm}</dd>
            </div>
            <div>
              <dt className="text-muted">USDC contract</dt>
              <dd className="mt-1 font-mono text-[0.8125rem] break-all">{NETWORK.usdc}</dd>
            </div>
            <div>
              <dt className="text-muted">Facilitator</dt>
              <dd className="mt-1">
                <Mono>{NETWORK.facilitator}</Mono>
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <CodeBlock code={deploy} />
          </div>
        </Panel>

        <Panel title="Interface" flush>
          <ul className="divide-y divide-taupe/30">
            {interfaceFns.map(([fn, note]) => (
              <li key={fn} className="px-5 py-3 md:px-6">
                <p className="font-mono text-[0.8125rem]">{fn}</p>
                <p className="mt-0.5 text-sm text-muted">{note}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Recent contract events" flush className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-5 py-3 font-medium md:px-6">Event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Wallet</th>
                  <th scope="col" className="px-4 py-3 font-medium">Transaction</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-5 py-3 font-mono text-[0.8125rem] md:px-6">{event.kind}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortKey(event.wallet)}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {shortKey(event.hash, 6, 4)}{' '}
                      <span className="text-muted">#{ledgerAt(event.at).toLocaleString('en-US')}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-muted md:px-6">
                      {formatDateTime(new Date(event.at).toISOString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Error codes" flush>
          <ul className="divide-y divide-taupe/30">
            {errors.map(([code, name]) => (
              <li key={code} className="flex gap-4 px-5 py-2 font-mono text-[0.8125rem] md:px-6">
                <span className="w-6 text-muted tabular-nums">{code}</span>
                {name}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
