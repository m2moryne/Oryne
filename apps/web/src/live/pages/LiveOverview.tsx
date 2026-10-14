import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Field, inputClasses, Panel, Stat } from '../../app/ui'
import { api, type Intent } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, TxLink, useAction, usd, when } from '../shared'

export default function LiveOverview() {
  const live = useLive()
  const wallet = live.wallet!
  const fund = useAction()
  const withdraw = useAction()
  const [amount, setAmount] = useState('100')
  const [out, setOut] = useState('')

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
        <Panel title="Your wallet" className="xl:col-span-2">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Contract</dt>
              <dd><AddressLink address={wallet.id} /></dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Owner (you)</dt>
              <dd><AddressLink address={wallet.owner} /></dd>
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
            Only your Freighter account can change agents&rsquo; limits or move money out. Agents can
            only send USDC inside their mandates; the contract refuses anything else.
          </p>
        </Panel>

        <div className="space-y-4">
          {live.info?.faucet && (
            <Panel title="Add test USDC">
              <p className="mb-4 text-sm text-muted">Testnet only: mints test USDC straight into your wallet.</p>
              <div className="flex gap-2">
                <input
                  aria-label="Amount"
                  value={amount}
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  className={`${inputClasses} py-2`}
                />
                <Button
                  size="sm"
                  disabled={fund.busy}
                  onClick={() =>
                    fund.run(async () => {
                      await api('/v1/faucet', { body: { to: wallet.id, amount } })
                      await live.refresh()
                    })
                  }
                >
                  {fund.busy ? 'Adding…' : 'Add'}
                </Button>
              </div>
              <ErrorNote error={fund.error} />
            </Panel>
          )}

          <Panel title="Withdraw">
            <Field label="Amount, USDC" hint="Sent to your Freighter account. It needs a USDC trustline.">
              {(id) => (
                <input id={id} value={out} inputMode="decimal" onChange={(event) => setOut(event.target.value)} className={`${inputClasses} py-2`} />
              )}
            </Field>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={withdraw.busy || !out}
              onClick={() =>
                withdraw.run(() =>
                  live.sign((token) =>
                    api<Intent>(`/v1/wallets/${wallet.id}/withdraw`, { body: { amount: out }, token }),
                  ),
                )
              }
            >
              {withdraw.busy ? 'Waiting for Freighter…' : 'Withdraw'}
            </Button>
            {withdraw.done && (
              <p className="mt-3 text-sm text-muted">
                Sent. <TxLink hash={withdraw.done} />
              </p>
            )}
            <ErrorNote error={withdraw.error} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
