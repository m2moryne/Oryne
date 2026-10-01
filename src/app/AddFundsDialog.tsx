import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { cn } from '../lib/cn'
import { MoneyInput } from './ConnectAgentDialog'
import { wholeMoney } from './format'
import { useStore } from './store'
import { Dialog, Field, inputClasses } from './ui'

const presets = [50, 100, 250, 500]
const methods = ['Bank transfer', 'Card']

export function AddFundsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore()
  const [amount, setAmount] = useState('100')
  const [method, setMethod] = useState(methods[0])

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
      description="Funds sit in your Oryne balance until an agent spends them."
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
                <option key={option}>{option}</option>
              ))}
            </select>
          )}
        </Field>

        <p className="rounded-lg bg-cream/70 px-4 py-3 text-sm text-muted">
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
