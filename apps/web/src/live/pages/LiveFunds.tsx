import { ArrowDownLeft, ArrowUpRight, Coins, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, Field, inputClasses, Panel, Stat } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { api, type CardInfo, type FundMovement, type Intent } from '../api'
import { formatCharge } from './AddMoney'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, RefreshButton, TxLink, useAction, useBase, usd, when } from '../shared'
import { Loader } from '../../components/Loader'

const kindLabel: Record<FundMovement['kind'], string> = {
  card: 'Card top-up',
  test: 'Test USDC',
  withdrawal: 'Withdrawal',
}

const statusLabel: Record<FundMovement['status'], { label: string; classes: string }> = {
  completed: { label: 'Completed', classes: 'border-charcoal/25 text-charcoal' },
  pending: { label: 'Pending', classes: 'border-taupe text-muted' },
  failed: { label: 'Failed', classes: 'border-burgundy/40 text-burgundy' },
  review: { label: 'Being checked', classes: 'border-burgundy/40 text-burgundy' },
}

/**
 * Money into and out of the wallet: balances, withdrawals and every movement.
 * Adding money is its own page (AddMoney.tsx), linked from here.
 * Paystack sends the owner back here with ?reference=…, which is confirmed
 * with the API and credited once.
 */
export default function LiveFunds() {
  const live = useLive()
  const wallet = live.wallet!
  const token = live.session?.token
  const base = useBase()
  const [funds, setFunds] = useState<FundMovement[] | null>(null)
  const [params, setParams] = useSearchParams()

  const load = useCallback(async () => {
    if (!token) return
    const data = await api<{ funds: FundMovement[]; card: CardInfo | null }>(`/v1/wallets/${wallet.id}/funds`, { token })
    setFunds(data.funds)
  }, [token, wallet.id])

  useEffect(() => {
    void load().catch(() => setFunds([]))
  }, [load])

  // Back from Paystack's checkout: confirm the payment, then keep checking briefly if it's still settling.
  const reference = params.get('reference') ?? params.get('trxref')
  const [returned, setReturned] = useState<FundMovement | null>(null)
  const [returnError, setReturnError] = useState<string | null>(null)
  const checking = useRef(false)
  useEffect(() => {
    if (!reference || !token || checking.current) return
    checking.current = true
    let tries = 0
    const check = async () => {
      try {
        const result = await api<FundMovement>(`/v1/topups/${encodeURIComponent(reference)}/confirm`, { method: 'POST', token })
        setReturned(result)
        if (result.status === 'pending' && tries++ < 10) {
          setTimeout(() => void check(), 3000)
          return
        }
        await Promise.all([load(), live.refresh()])
      } catch (error) {
        setReturnError((error as Error).message)
      }
      setParams((current) => {
        current.delete('reference')
        current.delete('trxref')
        return current
      }, { replace: true })
    }
    void check()
  }, [reference, token, load, live, setParams])

  const refreshAll = () => Promise.all([load(), live.refresh()]).then(() => undefined)

  const totalIn = (funds ?? [])
    .filter((row) => row.kind !== 'withdrawal' && row.status === 'completed')
    .reduce((total, row) => total + Number(row.amount), 0)
  const totalOut = (funds ?? [])
    .filter((row) => row.kind === 'withdrawal' && row.status === 'completed')
    .reduce((total, row) => total + Number(row.amount), 0)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Funds</h1>
      <div className="flex items-center justify-end gap-3">
        <RefreshButton onRefresh={refreshAll} />
        <Button size="sm" leadingIcon={Plus} to={`${base}/add-money`}>
          Add money
        </Button>
      </div>

      {(returned || returnError) && <ReturnBanner movement={returned} error={returnError} onClose={() => { setReturned(null); setReturnError(null) }} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={usd(wallet.balance)} note="Available to your agents, within their limits" />
        <Stat label="Added" value={usd(totalIn.toFixed(2).replace(/\.00$/, ''))} note="Card and test top-ups" />
        <Stat label="Withdrawn" value={usd(totalOut.toFixed(2).replace(/\.00$/, ''))} note="Moved out by you" />
      </div>

      {Number(wallet.xlmBalance ?? 0) > 0 && (
        <p className="border border-taupe/60 px-4 py-3 text-sm leading-relaxed">
          This wallet also holds <span className="font-medium">{trim(wallet.xlmBalance!)} XLM</span>.{' '}
          <span className="text-muted">Agents can only spend USDC, so it isn’t in the balance. Withdraw it below, or swap it for USDC and send that.</span>
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_24rem]">
      <Panel title="History" flush>
        {funds === null ? (
          <Loader />
        ) : funds.length === 0 ? (
          <EmptyState icon={Coins} title="No money in or out yet">
            Top-ups and withdrawals will show here, each with its Stellar transaction.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-5 py-3 font-normal md:px-6">When</th>
                  <th className="px-3 py-3 font-normal">What</th>
                  <th className="px-3 py-3 text-right font-normal">Amount</th>
                  <th className="px-3 py-3 font-normal">Details</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-5 py-3 font-normal md:px-6">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((row) => {
                  const out = row.kind === 'withdrawal'
                  const status = statusLabel[row.status]
                  return (
                    <tr key={row.id} className="border-t border-taupe/40 align-top">
                      <td className="whitespace-nowrap px-5 py-3.5 text-muted md:px-6">{when(row.createdAt)}</td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-2">
                          <Icon icon={out ? ArrowUpRight : ArrowDownLeft} size={15} className="text-muted" />
                          {kindLabel[row.kind]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                        {out ? '−' : '+'}
                        {row.amount} USDC
                      </td>
                      <td className="px-3 py-3.5 text-muted">
                        {row.charge && <>Charged {formatCharge(row.charge.amount, row.charge.currency)}</>}
                        {out && row.counterparty && (
                          <span className="inline-flex items-center gap-1">
                            To <AddressLink address={row.counterparty} />
                          </span>
                        )}
                        {row.error && <p className="mt-1 text-burgundy">{row.error}</p>}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={cn('inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', status.classes)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 md:px-6">{row.txHash ? <TxLink hash={row.txHash} /> : <span className="text-muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

        <Withdraw onDone={refreshAll} />
      </div>
    </div>
  )
}

function ReturnBanner({ movement, error, onClose }: { movement: FundMovement | null; error: string | null; onClose: () => void }) {
  const done = movement?.status === 'completed'
  const message = error
    ? `We couldn't confirm that payment: ${error}`
    : !movement
      ? ''
      : done
        ? `${movement.amount} USDC is in your wallet.`
        : movement.status === 'pending'
          ? 'Checking your payment with Paystack…'
          : movement.status === 'review'
            ? 'Your card was charged, but the USDC hasn’t arrived yet. We’re looking into it; you don’t need to pay again.'
            : `The card payment didn’t go through${movement.error ? `: ${movement.error}` : ''}. You weren’t charged.`
  return (
    <div
      role="status"
      className={cn(
        'flex items-start justify-between gap-4 border px-5 py-4 text-sm',
        done ? 'border-charcoal/30' : error || movement?.status === 'failed' || movement?.status === 'review' ? 'border-burgundy/40 text-burgundy' : 'border-taupe/60',
      )}
    >
      <p>{message}</p>
      {movement?.status !== 'pending' && (
        <button type="button" onClick={onClose} className="text-muted underline underline-offset-4">
          Dismiss
        </button>
      )}
    </div>
  )
}

/** 10.6145176 → 10.6145176, 10.5000000 → 10.5 */
const trim = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

function Withdraw({ onDone }: { onDone: () => Promise<void> }) {
  const live = useLive()
  const wallet = live.wallet!
  const withdraw = useAction()
  const passkey = wallet.owner_kind === 'passkey'
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const hasXlm = Number(wallet.xlmBalance ?? 0) > 0
  const [asset, setAsset] = useState<'usdc' | 'xlm'>('usdc')
  const xlm = hasXlm && asset === 'xlm'
  const unit = xlm ? 'XLM' : 'USDC'
  const tooMuch = Number(amount) > Number(xlm ? wallet.xlmBalance : wallet.balance)

  return (
    <Panel title="Withdraw">
      {hasXlm && (
        <div role="group" aria-label="What to withdraw" className="mb-4 grid grid-cols-2 gap-2 text-sm">
          {(['usdc', 'xlm'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={asset === option}
              onClick={() => {
                setAsset(option)
                setAmount('')
              }}
              className={cn(
                'rounded-full border py-2 transition-colors',
                asset === option ? 'border-charcoal' : 'border-taupe/60 text-muted hover:text-charcoal',
              )}
            >
              {option === 'usdc' ? 'USDC' : `XLM · ${trim(wallet.xlmBalance!)}`}
            </button>
          ))}
        </div>
      )}
      <Field
        label={`Amount, ${unit}`}
        hint={passkey ? undefined : xlm ? 'Sent to your Freighter account.' : 'Sent to your Freighter account. It needs a USDC trustline.'}
      >
        {(id) => <input id={id} value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} className={`${inputClasses} py-2`} />}
      </Field>
      {passkey && (
        <div className="mt-3">
          <Field label="To" hint={xlm ? 'Any Stellar address (G…), or a contract (C…).' : 'A Stellar address with a USDC trustline, or a contract.'}>
            {(id) => (
              <input id={id} value={to} onChange={(event) => setTo(event.target.value.trim())} placeholder="G… or C…" className={`${inputClasses} py-2 font-mono text-xs`} />
            )}
          </Field>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        className="mt-4"
        disabled={withdraw.busy || !amount || (passkey && !to) || tooMuch}
        onClick={() =>
          withdraw.run(async () => {
            const hash = await live.sign((token) =>
              api<Intent>(`/v1/wallets/${wallet.id}/withdraw`, { body: { amount, to: to || undefined, asset: xlm ? 'xlm' : undefined }, token }),
            )
            setAmount('')
            await onDone()
            return hash
          })
        }
      >
        {withdraw.busy ? 'Waiting for your signature…' : 'Withdraw'}
      </Button>
      {withdraw.done && (
        <p className="mt-3 text-sm text-muted">
          Sent. <TxLink hash={withdraw.done} />
        </p>
      )}
      {tooMuch && <p className="mt-3 text-sm text-burgundy">More than the wallet holds.</p>}
      <ErrorNote error={withdraw.error} />
      <p className="mt-5 border-t border-taupe/40 pt-4 text-xs leading-relaxed text-muted">
        {live.member ? 'Only the owner' : 'Only you'} can withdraw, with {live.member ? 'their' : 'your'}{' '}
        {passkey ? 'passkey' : 'Freighter signature'}. Agents can’t move money out.
      </p>
    </Panel>
  )
}
