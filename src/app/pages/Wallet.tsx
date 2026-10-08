import { Fingerprint, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { hexHash, ledgerAt, NETWORK, shortKey } from '../../lib/network'
import { agentKey, walletAddress } from '../chain'
import { CopyButton } from '../dev/devUi'
import { formatDateTime, money } from '../format'
import { spentBy, useStore } from '../store'
import { Panel, StatusPill } from '../ui'

type ChainEvent = { id: string; at: string; name: string; detail: string; hash: string }

/** The wallet as Stellar sees it: the contract, the keys on it, and its event log. */
export default function Wallet() {
  const { state } = useStore()
  const { agents, purchases, balance, user } = state
  const address = walletAddress(user)

  // The contract's own history, rebuilt from what the dashboard knows.
  const events: ChainEvent[] = [
    ...agents.map((agent) => ({
      id: `add-${agent.id}`,
      at: agent.connectedAt,
      name: 'agent_added',
      detail: `${agent.name} · per_tx ${money(agent.perPurchase)} · budget ${money(agent.budget)}`,
      hash: hexHash(`add-${agent.id}`),
    })),
    ...purchases
      .filter((purchase) => purchase.status === 'settled')
      .slice(0, 30)
      .map((purchase) => ({
        id: `spend-${purchase.id}`,
        at: purchase.at,
        name: purchase.approvedByOwner ? 'approve_once + agent_spend' : 'agent_spend',
        detail: `${agents.find((agent) => agent.id === purchase.agentId)?.name ?? 'Removed agent'} → ${purchase.merchant} · ${money(purchase.amount)}`,
        hash: hexHash(purchase.id),
      })),
    ...state.fundings.map((funding) => ({
      id: `fund-${funding.id}`,
      at: funding.at,
      name: 'transfer (deposit)',
      detail: `${money(funding.amount)} USDC in · ${funding.method}`,
      hash: hexHash(funding.id),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25)

  const facts = [
    ['Contract', address],
    ['Network', `${NETWORK.name} ${NETWORK.environment}`],
    ['Code', `agent-wallet v${NETWORK.walletVersion}`],
    ['Wasm hash', NETWORK.walletWasm],
    ['USDC contract', NETWORK.usdc],
  ]

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Wallet</h1>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Your agent wallet" className="xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="type-label text-muted">Balance</p>
              <p className="mt-4 text-5xl tracking-[-0.04em] tabular-nums">
                {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-2 text-xl text-muted">USDC</span>
              </p>
              <p className="mt-2 text-sm text-muted">0 XLM needed. Oryne sponsors network fees.</p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-taupe/60 px-3 py-1.5 text-xs">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-burgundy" />
              {NETWORK.environment} · preview
            </p>
          </div>
          <dl className="mt-8 divide-y divide-taupe/30 border-t border-taupe/40 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
                <dt className="w-32 shrink-0 text-muted">{label}</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-[0.8125rem]">{value}</span>
                  {value.length > 40 && <CopyButton value={value} className="text-muted hover:text-charcoal" />}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Who can control it">
          <ul className="space-y-5 text-sm">
            <li className="flex gap-3">
              <Icon icon={Fingerprint} size={20} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="font-medium">Owner passkey · this device</p>
                <p className="mt-0.5 text-muted">
                  Signs mandates, approvals and withdrawals. Stays in your device&rsquo;s secure chip.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Icon icon={Smartphone} size={20} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="font-medium">Recovery passkey · phone</p>
                <p className="mt-0.5 text-muted">Can rotate the owner with set_owner if this device is lost.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Icon icon={KeyRound} size={20} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="font-medium">
                  {agents.length} agent {agents.length === 1 ? 'key' : 'keys'}
                </p>
                <p className="mt-0.5 text-muted">Can only request USDC transfers inside their mandates.</p>
              </div>
            </li>
            <li className="flex gap-3 border-t border-taupe/40 pt-5">
              <Icon icon={ShieldCheck} size={20} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-muted">
                Oryne holds no key to this wallet. We can&rsquo;t move your funds, and neither can
                anyone who breaks into our servers.
              </p>
            </li>
          </ul>
        </Panel>
      </div>

      <Panel title="Agent keys on this wallet" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Agent</th>
                <th scope="col" className="px-4 py-3 font-medium">Session key</th>
                <th scope="col" className="px-4 py-3 font-medium">Mandate</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">Left this window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-5 py-4 md:px-6">
                    <Link to={`/app/agents/${agent.id}`} className="font-medium underline-offset-4 hover:underline">
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 font-mono text-[0.8125rem]">{shortKey(agentKey(agent), 6, 6)}</td>
                  <td className="px-4 py-4 text-muted">
                    {money(agent.perPurchase)} / payment · {money(agent.budget)} / 30 days
                    {agent.payees?.length ? ` · ${agent.payees.length} payees` : ' · any payee'}
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill status={agent.status} />
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums md:px-6">
                    {money(Math.max(agent.budget - spentBy(purchases, agent.id), 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Contract events" flush>
        <ul className="divide-y divide-taupe/30">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 text-sm md:px-6">
              <span className="w-44 shrink-0 font-mono text-[0.8125rem]">{event.name}</span>
              <span className="min-w-0 flex-1">{event.detail}</span>
              <span className="font-mono text-xs text-muted">
                {shortKey(event.hash, 6, 4)} · #{ledgerAt(new Date(event.at).getTime()).toLocaleString('en-US')}
              </span>
              <span className="w-28 text-right text-xs text-muted">{formatDateTime(event.at)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
