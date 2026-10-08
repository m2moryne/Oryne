import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { cn } from '../lib/cn'
import { shortKey } from '../lib/network'
import { walletAddress } from './chain'
import { MoneyInput } from './ConnectAgentDialog'
import { CopyButton } from './dev/devUi'
import { wholeMoney } from './format'
import { useStore } from './store'
import { Dialog, Field, inputClasses } from './ui'

const presets = [50, 100, 250, 500]
const methods = [
  { name: 'USDC on Stellar', note: 'Send USDC from any Stellar wallet or exchange to your wallet address.' },
  { name: 'Bank transfer', note: 'Through a Stellar anchor. Arrives as USDC, usually within the hour.' },
  { name: 'Mobile money', note: 'M-Pesa and others, through a Stellar anchor. Arrives as USDC in minutes.' },
  { name: 'Card', note: 'Through an on-ramp partner. Arrives as USDC in minutes; a fee applies.' },
]

export function AddFundsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore()
  const [amount, setAmount] = useState('100')
  const [method, setMethod] = useState(methods[0].name)
  const { state } = useStore()
  const chosen = methods.find((option) => option.name === method)!

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'addFunds', amount: Number(amount), method })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add funds"
      description="Funds sit in your own agent wallet on Stellar, as USDC, until an agent spends them."
    >
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-medium">Amount</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                aria-pressed={Number(amount) === preset}
                className={cn(
                  'rounded-lg border py-2.5 text-sm font-medium tabular-nums transition-colors duration-200',
                  Number(amount) === preset
                    ? 'border-charcoal bg-charcoal text-cream'
                    : 'border-taupe/60 hover:border-charcoal/50',
                )}
              >
                {wholeMoney(preset)}
              </button>
            ))}
          </div>
        </div>

        <Field label="Or enter an amount">
          {(fieldId) => <MoneyInput id={fieldId} value={amount} onChange={setAmount} max="10000" />}
        </Field>

        <Field label="Pay with">
          {(fieldId) => (
            <select
              id={fieldId}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className={inputClasses}
            >
              {methods.map((option) => (
                <option key={option.name}>{option.name}</option>
              ))}
            </select>
          )}
        </Field>

        <div className="text-sm">
          <p className="text-muted">{chosen.note}</p>
          {method === 'USDC on Stellar' && (
            <p className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[0.8125rem]">{shortKey(walletAddress(state.user), 10, 10)}</span>
              <CopyButton value={walletAddress(state.user)} className="text-muted hover:text-charcoal" />
            </p>
          )}
        </div>

        <p className="rounded-lg bg-taupe/15 px-4 py-3 text-sm text-muted">
          This is a preview. No payment is taken and no real money moves.
        </p>

        <div className="flex justify-between gap-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Add {Number(amount) > 0 ? wholeMoney(Number(amount)) : 'funds'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
