import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Panel, Stat } from '../../app/ui'
import { useLive } from '../LiveContext'
import { AddressLink, TxLink, usd, when } from '../shared'

export default function LiveOverview() {
  const live = useLive()
  const wallet = live.wallet!

  const active = wallet.agents.filter((agent) => agent.status === 'active').length
  const settled = live.payments.filter((payment) => payment.status === 'settled')
  const spent = settled.reduce((total, payment) => total + Number(payment.amount), 0)
  const pending = live.approvals.filter((approval) => approval.status === 'pending').length

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Balance" value={usd(wallet.balance)} note="In your wallet contract" />
        <Stat label="Paid by agents" value={usd(spent.toFixed(2).replace(/\.00$/, ''))} note={`${settled.length} payments`} />
        <Stat label="Agents" value={String(wallet.agents.length)} note={`${active} active`} />
        <Stat
          label="Approvals"
          value={String(pending)}
          note={pending ? <Link to="/app/approvals" className="underline underline-offset-4">Review</Link> : 'Nothing waiting'}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title={live.member ? 'Wallet' : 'Your wallet'} className="xl:col-span-2">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Contract</dt>
              <dd><AddressLink address={wallet.id} /></dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">{live.member ? 'Owner' : 'Owner (you)'}</dt>
              <dd>{wallet.owner_kind === 'passkey' ? (live.member ? 'Passkey on the owner’s device' : 'Passkey on your device') : <AddressLink address={wallet.owner} />}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Token</dt>
              <dd><AddressLink address={wallet.token} /></dd>
            </div>
            {wallet.tx_hash && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">Deployed in</dt>
                <dd><TxLink hash={wallet.tx_hash} /></dd>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Created</dt>
              <dd>{when(wallet.created_at)}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-taupe/40 pt-4 text-sm leading-relaxed text-muted">
            {live.member ? 'Only the owner' : 'Only you'} can change agents&rsquo; limits or move money out
            {wallet.owner_kind === 'passkey' ? `, with ${live.member ? 'their' : 'your'} passkey` : `, with ${live.member ? 'their' : 'your'} Freighter account`}.
            Agents can only send USDC inside their mandates; the contract refuses anything else.
          </p>
        </Panel>

        <Panel title="Funds">
          <p className="text-sm leading-relaxed text-muted">
            Your agents spend from this balance, within their limits. Top up by card{live.info?.faucet ? ' or with test USDC' : ''}, or move money back out.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button to="/app/funds" size="sm" leadingIcon={Plus}>
              Add money
            </Button>
            <Button to="/app/funds" size="sm" variant="outline">
              Withdraw
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
