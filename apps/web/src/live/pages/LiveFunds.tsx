import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, FlaskConical, Landmark } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CopyButton } from '../../app/dev/devUi'
import { EmptyState, Field, inputClasses, Panel, Stat } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { api, type CardInfo, type FundMovement, type Intent } from '../api'
import { useLive } from '../LiveContext'
import { AddressLink, ErrorNote, TxLink, useAction, usd, when } from '../shared'
import { Loader } from '../../components/Loader'

type Method = 'card' | 'test' | 'stellar'

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

const formatCharge = (amount: string, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
  } catch {
    return `${currency} ${amount}`
  }
}

function MethodTab({ active, icon, children, onClick }: { active: boolean; icon: typeof Coins; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b px-1 pb-3 text-sm transition-colors',
        active ? 'border-charcoal text-charcoal' : 'border-transparent text-muted hover:text-charcoal',
      )}
    >
      <Icon icon={icon} size={15} />
      {children}
    </button>
  )
}

/**
 * Money into and out of the wallet: top up by card (Paystack), with test USDC
 * on testnet, or by sending USDC on Stellar; withdraw; and every movement.
 * Paystack sends the owner back here with ?reference=…, which is confirmed
 * with the API and credited once.
 */
export default function LiveFunds() {
  const live = useLive()
  const wallet = live.wallet!
  const token = live.session?.token
  const faucet = !!live.info?.faucet
  const [card, setCard] = useState<CardInfo | null>(live.info?.card ?? null)
  const [funds, setFunds] = useState<FundMovement[] | null>(null)
  const [method, setMethod] = useState<Method>(live.info?.card ? 'card' : faucet ? 'test' : 'stellar')
  const [params, setParams] = useSearchParams()

  const load = useCallback(async () => {
    if (!token) return
    const data = await api<{ funds: FundMovement[]; card: CardInfo | null }>(`/v1/wallets/${wallet.id}/funds`, { token })
    setFunds(data.funds)
    setCard(data.card)
  }, [token, wallet.id])

  useEffect(() => {
    void load().catch(() => setFunds([]))
  }, [load])

  useEffect(() => {
    if (card && method === 'test' && !params.get('reference')) setMethod('card')
    // Only when card top-ups first turn out to be available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card])

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

  const totalIn = (funds ?? [])
    .filter((row) => row.kind !== 'withdrawal' && row.status === 'completed')
    .reduce((total, row) => total + Number(row.amount), 0)
  const totalOut = (funds ?? [])
    .filter((row) => row.kind === 'withdrawal' && row.status === 'completed')
    .reduce((total, row) => total + Number(row.amount), 0)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Funds</h1>

      {(returned || returnError) && <ReturnBanner movement={returned} error={returnError} onClose={() => { setReturned(null); setReturnError(null) }} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={usd(wallet.balance)} note="Available to your agents, within their limits" />
        <Stat label="Added" value={usd(totalIn.toFixed(2).replace(/\.00$/, ''))} note="Card and test top-ups" />
        <Stat label="Withdrawn" value={usd(totalOut.toFixed(2).replace(/\.00$/, ''))} note="Moved out by you" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_24rem]">
        <Panel title="Add money">
          <div role="tablist" aria-label="How to add money" className="flex flex-wrap gap-x-6 border-b border-taupe/40">
            <MethodTab active={method === 'card'} icon={CreditCard} onClick={() => setMethod('card')}>
              Card
            </MethodTab>
            {faucet && (
              <MethodTab active={method === 'test'} icon={FlaskConical} onClick={() => setMethod('test')}>
                Test USDC
              </MethodTab>
            )}
            <MethodTab active={method === 'stellar'} icon={Landmark} onClick={() => setMethod('stellar')}>
              From Stellar
            </MethodTab>
          </div>
          <div className="pt-6">
            {method === 'card' && <CardTopUp card={card} testnet={faucet} />}
            {method === 'test' && <TestTopUp onDone={() => Promise.all([load(), live.refresh()]).then(() => undefined)} />}
            {method === 'stellar' && <StellarDeposit />}
          </div>
        </Panel>

        <Withdraw onDone={() => Promise.all([load(), live.refresh()]).then(() => undefined)} />
      </div>

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

function CardTopUp({ card, testnet }: { card: CardInfo | null; testnet: boolean }) {
  const live = useLive()
  const wallet = live.wallet!
  const start = useAction()
  const [amount, setAmount] = useState('20')
  const knownEmail = live.user?.email ?? ''
  const [email, setEmail] = useState(knownEmail)

  if (!card) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        Card top-ups aren’t switched on yet.{testnet ? ' On testnet, use Test USDC in the meantime.' : ''}
      </p>
    )
  }

  const value = Number(amount)
  const valid = value >= Number(card.min) && value <= Number(card.max)
  const charge = valid ? formatCharge((value * card.rate).toFixed(2), card.currency) : null

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount, USDC" hint={`Between ${card.min} and ${card.max}.`}>
          {(id) => (
            <input id={id} value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} className={`${inputClasses} py-2`} />
          )}
        </Field>
        {!knownEmail && (
          <Field label="Email for the receipt">
            {(id) => (
              <input id={id} type="email" value={email} onChange={(event) => setEmail(event.target.value.trim())} className={`${inputClasses} py-2`} />
            )}
          </Field>
        )}
      </div>
      <p className="mt-4 text-sm text-muted">
        {charge ? (
          <>
            You pay <span className="text-charcoal">{charge}</span> by card, at {formatCharge(String(card.rate), card.currency)} per USDC.
          </>
        ) : (
          'Enter an amount to see the price.'
        )}
      </p>
      <Button
        size="sm"
        className="mt-5"
        leadingIcon={CreditCard}
        disabled={!valid || start.busy || (!knownEmail && !email)}
        onClick={() =>
          start.run(async () => {
            const checkout = await api<{ authorizationUrl: string }>(`/v1/wallets/${wallet.id}/topups`, {
              token: live.session!.token,
              body: { amount, email: email || undefined },
            })
            window.location.assign(checkout.authorizationUrl)
          })
        }
      >
        {start.busy ? 'Opening checkout…' : 'Pay with card'}
      </Button>
      <ErrorNote error={start.error} />
      <p className="mt-5 border-t border-taupe/40 pt-4 text-xs leading-relaxed text-muted">
        Card payments are handled by Paystack; Oryne never sees your card details.
        {testnet && (
          <>
            {' '}
            Testnet uses Paystack’s test mode: pay with test card <span className="font-mono">4084 0840 8408 4081</span>, any
            future expiry, CVV <span className="font-mono">408</span>. No real money moves.
          </>
        )}
      </p>
    </div>
  )
}

function TestTopUp({ onDone }: { onDone: () => Promise<void> }) {
  const live = useLive()
  const wallet = live.wallet!
  const fund = useAction()
  const [amount, setAmount] = useState('100')
  return (
    <div>
      <p className="text-sm text-muted">Testnet only: free test USDC, straight into your wallet. Up to 1000 at a time.</p>
      <div className="mt-4 flex max-w-sm gap-2">
        <input aria-label="Amount, USDC" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} className={`${inputClasses} py-2`} />
        <Button
          size="sm"
          disabled={fund.busy}
          onClick={() =>
            fund.run(async () => {
              const result = await api<{ hash: string }>('/v1/faucet', { body: { to: wallet.id, amount } })
              await onDone()
              return result.hash
            })
          }
        >
          {fund.busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {fund.done && (
        <p className="mt-3 text-sm text-muted">
          Added. <TxLink hash={fund.done} />
        </p>
      )}
      <ErrorNote error={fund.error} />
    </div>
  )
}

function StellarDeposit() {
  const live = useLive()
  const wallet = live.wallet!
  return (
    <div className="text-sm">
      <p className="leading-relaxed text-muted">
        Send USDC on Stellar {live.info?.network === 'stellar-testnet' ? 'testnet ' : ''}straight to your wallet’s contract
        address, from an exchange or another wallet that supports sending to contract addresses (C…).
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border border-taupe/50 bg-code px-4 py-3">
        <span className="break-all font-mono text-xs">{wallet.id}</span>
        <CopyButton value={wallet.id} className="shrink-0 text-muted hover:text-charcoal" />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Only USDC counts toward what your agents can spend. Deposits sent this way show in your balance, and on Stellar
        Expert, but aren’t listed in the history below yet.
      </p>
    </div>
  )
}

function Withdraw({ onDone }: { onDone: () => Promise<void> }) {
  const live = useLive()
  const wallet = live.wallet!
  const withdraw = useAction()
  const passkey = wallet.owner_kind === 'passkey'
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')

  return (
    <Panel title="Withdraw">
      <Field label="Amount, USDC" hint={passkey ? undefined : 'Sent to your Freighter account. It needs a USDC trustline.'}>
        {(id) => <input id={id} value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} className={`${inputClasses} py-2`} />}
      </Field>
      {passkey && (
        <div className="mt-3">
          <Field label="To" hint="A Stellar address with a USDC trustline, or a contract.">
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
        disabled={withdraw.busy || !amount || (passkey && !to)}
        onClick={() =>
          withdraw.run(async () => {
            const hash = await live.sign((token) =>
              api<Intent>(`/v1/wallets/${wallet.id}/withdraw`, { body: { amount, to: to || undefined }, token }),
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
      <ErrorNote error={withdraw.error} />
      <p className="mt-5 border-t border-taupe/40 pt-4 text-xs leading-relaxed text-muted">
        {live.member ? 'Only the owner' : 'Only you'} can withdraw, with {live.member ? 'their' : 'your'}{' '}
        {passkey ? 'passkey' : 'Freighter signature'}. Agents can’t move money out.
      </p>
    </Panel>
  )
}
