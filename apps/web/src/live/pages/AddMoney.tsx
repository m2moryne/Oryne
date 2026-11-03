import { ArrowRight, CreditCard, FlaskConical, Landmark, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CopyButton } from '../../app/dev/devUi'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { shortKey } from '../../lib/network'
import { api, type CardInfo } from '../api'
import { useLive } from '../LiveContext'
import { ErrorNote, TxLink, useAction, usd } from '../shared'

type Method = 'card' | 'test' | 'stellar'

export const formatCharge = (amount: string, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
  } catch {
    return `${currency} ${amount}`
  }
}

/** Brand blue from the logo, for the one action on the page. */
const payButton =
  'flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#0576fe] px-5 text-[0.9375rem] font-medium text-[#ffffff] shadow-[0_10px_30px_-12px_rgba(5,118,254,0.7)] transition-[background-color,opacity] hover:bg-[#0466e0] disabled:opacity-45'

const presets = { card: ['10', '20', '50', '100'], test: ['50', '100', '500', '1000'] }

/**
 * Adding money, laid out as a checkout: a picture of the wallet on the left,
 * the payment on the right. Card details are never entered here: Paystack's
 * own checkout takes them, so they never reach Oryne.
 */
export function AddMoney({ card, faucet, onDone }: { card: CardInfo | null; faucet: boolean; onDone: () => Promise<void> }) {
  const live = useLive()
  const [method, setMethod] = useState<Method>(card ? 'card' : faucet ? 'test' : 'stellar')
  const testnet = live.info?.network !== 'stellar-mainnet'

  return (
    <section className="tone-white grid overflow-hidden rounded-2xl border border-taupe/50 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <WalletArt balance={usd(live.wallet!.balance)} address={live.wallet!.id} testnet={testnet} />

      <div className="px-5 py-7 sm:px-8 md:px-12 md:py-10">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl tracking-[-0.02em]">Add money</h2>
          {method !== 'stellar' && (
            <button
              type="button"
              onClick={() => setMethod('stellar')}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#0576fe] hover:underline hover:underline-offset-4"
            >
              Wallet address <Icon icon={ArrowRight} size={14} />
            </button>
          )}
        </div>

        <div role="tablist" aria-label="How to add money" className="mt-7 grid grid-cols-3 gap-2">
          <MethodPill active={method === 'card'} icon={CreditCard} onClick={() => setMethod('card')}>
            Card
          </MethodPill>
          {faucet ? (
            <MethodPill active={method === 'test'} icon={FlaskConical} onClick={() => setMethod('test')}>
              Test USDC
            </MethodPill>
          ) : (
            <span aria-hidden="true" />
          )}
          <MethodPill active={method === 'stellar'} icon={Landmark} onClick={() => setMethod('stellar')}>
            Stellar
          </MethodPill>
        </div>

        <div className="mt-8">
          {method === 'card' && <CardForm card={card} testnet={testnet} />}
          {method === 'test' && <TestForm onDone={onDone} />}
          {method === 'stellar' && <StellarForm testnet={testnet} />}
        </div>
      </div>
    </section>
  )
}

function MethodPill({ active, icon, children, onClick }: { active: boolean; icon: typeof CreditCard; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm transition-colors',
        active
          ? 'border-[#0576fe] bg-[#0576fe]/[0.06] text-charcoal shadow-[0_0_0_3px_rgba(5,118,254,0.12)]'
          : 'border-taupe/50 bg-charcoal/[0.025] text-muted hover:border-charcoal/40 hover:text-charcoal',
      )}
    >
      <Icon icon={icon} size={16} className={active ? 'text-[#0576fe]' : undefined} />
      {children}
    </button>
  )
}

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {children}
      {required && <span className="ml-1 text-[#0576fe]">*</span>}
    </label>
  )
}

const boxInput =
  'mt-2 h-13 w-full rounded-xl border border-taupe/60 bg-white px-4 text-[0.9375rem] outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-[#0576fe] focus:shadow-[0_0_0_3px_rgba(5,118,254,0.14)]'

/** The amount, as a big input with USDC beside it and quick picks under it. */
function AmountInput({ value, onChange, choices }: { value: string; onChange: (value: string) => void; choices: string[] }) {
  return (
    <div>
      <FieldLabel htmlFor="add-amount" required>
        Amount
      </FieldLabel>
      <div className="relative">
        <input
          id="add-amount"
          value={value}
          inputMode="decimal"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ''))}
          className={cn(boxInput, 'pr-20 text-xl tabular-nums tracking-[-0.01em]')}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 mt-1 -translate-y-1/2 text-sm text-muted">USDC</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm tabular-nums transition-colors',
              value === choice ? 'border-charcoal bg-charcoal text-cream' : 'border-taupe/60 text-muted hover:border-charcoal hover:text-charcoal',
            )}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  )
}

function Total({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="mt-8 border-t border-taupe/40 pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xl tabular-nums tracking-[-0.01em] text-[#0576fe]">{value}</span>
      </div>
      {note && <p className="mt-1 text-right text-xs text-muted">{note}</p>}
    </div>
  )
}

function CardForm({ card, testnet }: { card: CardInfo | null; testnet: boolean }) {
  const live = useLive()
  const wallet = live.wallet!
  const start = useAction()
  const [amount, setAmount] = useState('20')
  const knownEmail = live.user?.email ?? (live.session?.address.startsWith('email:') ? live.session.address.slice(6) : '')
  const [email, setEmail] = useState(knownEmail)

  if (!card) {
    return (
      <p className="rounded-xl border border-taupe/50 px-4 py-4 text-sm leading-relaxed text-muted">
        Card payments aren’t switched on yet.{testnet ? ' On testnet, use Test USDC in the meantime.' : ' Send USDC on Stellar instead.'}
      </p>
    )
  }

  const value = Number(amount)
  const valid = value >= Number(card.min) && value <= Number(card.max)
  const charge = valid ? formatCharge((value * card.rate).toFixed(2), card.currency) : null

  return (
    <div>
      <AmountInput value={amount} onChange={setAmount} choices={presets.card} />
      {!knownEmail && (
        <div className="mt-6">
          <FieldLabel htmlFor="add-email" required>
            Email for the receipt
          </FieldLabel>
          <input id="add-email" type="email" value={email} onChange={(event) => setEmail(event.target.value.trim())} className={boxInput} />
        </div>
      )}

      <Total
        label="Total amount"
        value={charge ?? '—'}
        note={
          valid
            ? `${amount} USDC at ${formatCharge(String(card.rate), card.currency)} each`
            : `Between ${card.min} and ${card.max} USDC`
        }
      />

      <button
        type="button"
        className={cn(payButton, 'mt-6')}
        disabled={!valid || start.busy || !email}
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
        {start.busy ? 'Opening secure checkout…' : charge ? `Pay ${charge}` : 'Pay'}
      </button>
      <ErrorNote error={start.error} />
      <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted">
        <Icon icon={Lock} size={13} className="mt-0.5 shrink-0" />
        <span>
          You enter your card on Paystack’s secure checkout; Oryne never sees it.
          {testnet && (
            <>
              {' '}
              Test card <span className="font-mono">4084 0840 8408 4081</span>, any future expiry, CVV{' '}
              <span className="font-mono">408</span>.
            </>
          )}
        </span>
      </p>
    </div>
  )
}

function TestForm({ onDone }: { onDone: () => Promise<void> }) {
  const live = useLive()
  const wallet = live.wallet!
  const fund = useAction()
  const [amount, setAmount] = useState('100')
  const valid = Number(amount) > 0 && Number(amount) <= 1000
  return (
    <div>
      <AmountInput value={amount} onChange={setAmount} choices={presets.test} />
      <Total label="Total amount" value="Free" note="Test USDC on Stellar testnet, up to 1,000 at a time" />
      <button
        type="button"
        className={cn(payButton, 'mt-6')}
        disabled={!valid || fund.busy}
        onClick={() =>
          fund.run(async () => {
            const result = await api<{ hash: string }>('/v1/faucet', { body: { to: wallet.id, amount } })
            await onDone()
            return result.hash
          })
        }
      >
        {fund.busy ? 'Adding…' : `Add ${valid ? amount : ''} test USDC`}
      </button>
      {fund.done && (
        <p className="mt-4 text-center text-sm text-muted">
          Added to your wallet. <TxLink hash={fund.done} />
        </p>
      )}
      <ErrorNote error={fund.error} />
    </div>
  )
}

function StellarForm({ testnet }: { testnet: boolean }) {
  const live = useLive()
  const wallet = live.wallet!
  return (
    <div className="text-sm">
      <FieldLabel htmlFor="add-address">Your wallet address</FieldLabel>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-taupe/60 bg-code px-4 py-3.5">
        <span id="add-address" className="break-all font-mono text-xs leading-relaxed">
          {wallet.id}
        </span>
        <CopyButton value={wallet.id} className="shrink-0 text-muted hover:text-charcoal" />
      </div>
      <p className="mt-4 leading-relaxed text-muted">
        Send USDC on Stellar {testnet ? 'testnet ' : ''}to this address from an exchange or a wallet that can send to contract
        addresses (C…). Only USDC counts toward what your agents can spend.
      </p>
      {testnet && (
        <p className="mt-4 rounded-xl border border-burgundy/40 px-4 py-3 text-xs leading-relaxed text-burgundy">
          This is your test wallet. It only exists on Stellar testnet: never send real USDC to it. Your live wallet has its own
          address, shown here when you switch to Live.
        </p>
      )}
      <Total label="Network" value={testnet ? 'Testnet' : 'Mainnet'} note="Arrives in about 5 seconds, no fee from Oryne" />
    </div>
  )
}

/**
 * The left half: the wallet as three stacked glass cards on a deep blue field,
 * lit with the logo's blue and orange. Decorative, apart from the balance.
 */
function WalletArt({ balance, address, testnet }: { balance: string; address: string; testnet: boolean }) {
  const short = shortKey(address, 4, 4)
  const cards = [
    {
      // Back: warm, the logo's orange.
      className: 'bg-[linear-gradient(135deg,#fc771f_0%,#e2367a_55%,#7b2ff7_100%)] border-[rgba(255,255,255,0.25)]',
      lift: 0,
    },
    {
      className: 'bg-[linear-gradient(135deg,#7fb2ff_0%,#4b7dff_60%,#3b5bfd_100%)] border-[rgba(255,255,255,0.4)]',
      lift: 64,
    },
    {
      // Front: clear glass.
      className: 'border-[rgba(255,255,255,0.45)] bg-[rgba(255,255,255,0.08)] backdrop-blur-md',
      lift: 128,
    },
  ]
  return (
    <div
      aria-hidden="true"
      className="relative min-h-[23rem] overflow-hidden bg-[#071228] text-[#ffffff] lg:min-h-[34rem]"
      style={{
        backgroundImage:
          'radial-gradient(40% 35% at 8% 30%, rgba(5,118,254,0.55), transparent 70%), radial-gradient(35% 30% at 95% 92%, rgba(252,119,31,0.45), transparent 70%), radial-gradient(30% 25% at 85% 8%, rgba(123,47,247,0.35), transparent 70%)',
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center [perspective:1400px]">
        <div
          className="relative h-[9.5rem] w-[15rem] sm:h-[11rem] sm:w-[17.5rem]"
          style={{ transformStyle: 'preserve-3d', transform: 'rotateX(56deg) rotateZ(-36deg) translateY(-2.25rem)' }}
        >
          {cards.map((card, index) => (
            <div
              key={index}
              className={cn('absolute inset-0 rounded-[1.1rem] border p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]', card.className)}
              style={{ transform: `translateZ(${card.lift}px)` }}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[0.8rem] font-semibold tracking-[0.18em]">USDC</span>
                  <span className="rounded-full border border-[rgba(255,255,255,0.4)] px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em]">
                    {testnet ? 'Testnet' : 'Mainnet'}
                  </span>
                </div>
                <div>
                  <p className="font-mono text-[0.95rem] tracking-[0.12em]">{short}</p>
                  <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.75)]">Oryne agent wallet</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071228] via-[#071228]/70 to-transparent px-6 pb-6 pt-16 md:px-8 md:pb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,255,255,0.6)]">{testnet ? 'Test wallet' : 'Live wallet'} balance</p>
        <p className="mt-1.5 text-3xl tabular-nums tracking-[-0.02em]">{balance}</p>
      </div>
    </div>
  )
}
