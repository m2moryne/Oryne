import { Bot, Check, ExternalLink, KeyRound, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton } from '../../app/dev/devUi'
import { EmptyState, Meter, Panel, Stat, StatusPill } from '../../app/ui'
import { Icon } from '../../components/Icon'
import { shortKey } from '../../lib/network'
import { explorerAccount } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, TxLink, usd, when } from '../shared'

const fixed = (value: number) => value.toFixed(2).replace(/\.00$/, '')

/** A label and a value in the contract panel, with a copy button for long ids. */
function Row({ label, children, copy }: { label: string; children: ReactNode; copy?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-taupe/40 py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-sm">
        {children}
        {copy && <CopyButton value={copy} label="Copy" className="text-muted hover:text-charcoal" />}
      </dd>
    </div>
  )
}

/** Who can do what with this wallet. Each line is enforced by the contract, not by Oryne. */
const powers: Array<{ action: string; owner: boolean; agent: boolean | string }> = [
  { action: 'Pay a service', owner: true, agent: 'Inside its mandate' },
  { action: 'Add or remove an agent', owner: true, agent: false },
  { action: 'Change limits, pause or resume', owner: true, agent: false },
  { action: 'Approve a payment over the limits', owner: true, agent: false },
  { action: 'Withdraw funds', owner: true, agent: false },
]

function Can({ value }: { value: boolean | string }) {
  if (value === false)
    return (
      <>
        <Icon icon={Minus} size={15} className="text-muted" />
        <span className="sr-only">No</span>
      </>
    )
  if (value === true)
    return (
      <>
        <Icon icon={Check} size={15} />
        <span className="sr-only">Yes</span>
      </>
    )
  return <span className="text-muted">{value}</span>
}

/**
 * The owner's wallet up close: the contract and what it holds, how much of it
 * agents may spend, every agent it trusts with its rules, and who can do what.
 * Everything here is read from the dashboard's live data.
 */
export default function LiveWallet() {
  const live = useLive()
  const wallet = live.wallet!
  const info = live.info
  const network = info?.network ?? ''
  const passkey = wallet.owner_kind === 'passkey'

  const trusted = wallet.agents.filter((agent) => agent.status !== 'removed')
  const active = trusted.filter((agent) => agent.status === 'active')
  // Most agents could still spend right now: what's left of each active agent's budget.
  const spendable = active.reduce((total, agent) => total + Number(agent.remaining ?? agent.budget), 0)
  const settled = live.payments.filter((payment) => payment.status === 'settled')
  const paidOut = settled.reduce((total, payment) => total + Number(payment.amount), 0)
  const balance = Number(wallet.balance)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{wallet.name}</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Balance" value={usd(wallet.balance)} note={<Link to="/app" className="underline underline-offset-4">Add or withdraw</Link>} />
        <Stat
          label="Agents can still spend"
          value={usd(fixed(Math.min(spendable, balance)))}
          note={spendable > balance ? `Budgets allow ${fixed(spendable)}; capped by the balance` : `Across ${active.length} active ${active.length === 1 ? 'agent' : 'agents'}`}
        />
        <Stat label="Paid out by agents" value={usd(fixed(paidOut))} note={`${settled.length} ${settled.length === 1 ? 'payment' : 'payments'}`} />
        <Stat label="Trusted agents" value={String(trusted.length)} note={`${active.length} active, ${trusted.length - active.length} paused`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_24rem]">
        <Panel
          title="Agents this wallet trusts"
          flush
          action={
            <Link to="/app/agents" className="text-sm underline underline-offset-4">
              Manage
            </Link>
          }
        >
          {trusted.length === 0 ? (
            <EmptyState icon={Bot} title="No agents yet">
              Connect an agent to give it a key to this wallet, with limits you choose.
            </EmptyState>
          ) : (
            <ul>
              {trusted.map((agent) => {
                const budget = Number(agent.budget)
                const remaining = agent.remaining !== undefined ? Number(agent.remaining) : undefined
                return (
                  <li key={agent.publicKey} className="border-t border-taupe/40 px-5 py-5 first:border-t-0 md:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/app/agents/${agent.publicKey}`} className="font-medium hover:underline">
                          {agent.name}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted">{shortKey(agent.publicKey, 6, 6)}</p>
                      </div>
                      <StatusPill status={agent.status === 'active' ? 'active' : 'paused'} />
                    </div>
                    <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">Per payment</dt>
                        <dd className="mt-0.5 tabular-nums">{usd(agent.perTx)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Budget</dt>
                        <dd className="mt-0.5 tabular-nums">
                          {usd(agent.budget)} / {agent.windowDays} {agent.windowDays === 1 ? 'day' : 'days'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Payees</dt>
                        <dd className="mt-0.5">{agent.payees.length ? `${agent.payees.length} allowed` : 'Any'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Expires</dt>
                        <dd className="mt-0.5">{agent.expiresAt ? when(agent.expiresAt) : 'Never'}</dd>
                      </div>
                    </dl>
                    <div className="mt-4">
                      <Meter spent={remaining === undefined ? 0 : Math.max(budget - remaining, 0)} budget={budget} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="The contract">
            <dl>
              <Row label="Contract ID" copy={wallet.id}>
                <AddressLink address={wallet.id} />
              </Row>
              <Row label="Owner" copy={passkey ? undefined : wallet.owner}>
                {passkey ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon icon={KeyRound} size={14} /> Passkey on your device
                  </span>
                ) : (
                  <AddressLink address={wallet.owner} />
                )}
              </Row>
              <Row label="Holds" copy={wallet.token}>
                <span className="inline-flex items-center gap-1.5">
                  USDC <AddressLink address={wallet.token} />
                </span>
              </Row>
              {info?.walletWasmHash && (
                <Row label="Code (wasm hash)" copy={info.walletWasmHash}>
                  <span className="font-mono text-[0.8125rem]">{shortKey(info.walletWasmHash, 6, 6)}</span>
                </Row>
              )}
              {wallet.tx_hash && (
                <Row label="Deployed in">
                  <TxLink hash={wallet.tx_hash} />
                </Row>
              )}
              <Row label="Created">{when(wallet.created_at)}</Row>
              {info?.sponsor && (
                <Row label="Network fees paid by">
                  <span className="text-muted">Oryne</span>
                </Row>
              )}
            </dl>
            <a
              href={explorerAccount(network, wallet.id)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
            >
              Every transaction and change, on Stellar Expert <Icon icon={ExternalLink} size={13} />
            </a>
          </Panel>

          <Panel title="Who can do what" flush>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-5 py-3 font-normal md:px-6"></th>
                  <th className="px-3 py-3 font-normal">You</th>
                  <th className="px-5 py-3 font-normal md:px-6">Agents</th>
                </tr>
              </thead>
              <tbody>
                {powers.map((power) => (
                  <tr key={power.action} className="border-t border-taupe/40 align-top">
                    <td className="px-5 py-3 md:px-6">{power.action}</td>
                    <td className="px-3 py-3"><Can value={power.owner} /></td>
                    <td className="px-5 py-3 md:px-6"><Can value={power.agent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-taupe/40 px-5 py-4 text-sm leading-relaxed text-muted md:px-6">
              The contract enforces this, not Oryne. Your changes need {passkey ? 'your passkey' : 'your Freighter signature'}
              , and nobody else, including Oryne, can make them.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
