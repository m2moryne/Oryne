import { Check, X } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

const POLICY = { perTx: 25, budget: 400, spent: 372.4 }
const payees = [
  { name: 'Lumen Search', allowed: true },
  { name: 'Quill Docs', allowed: true },
  { name: 'Unknown service (GZ7Q…)', allowed: false },
]

/**
 * A try-it-yourself version of the wallet contract's __check_auth: pick a
 * payment and see which rule lets it through or stops it. Runs in the page;
 * the rules match contracts/agent-wallet.
 */
export function MandateSimulator({ className }: { className?: string }) {
  const amountId = useId()
  const [amount, setAmount] = useState(12)
  const [payee, setPayee] = useState(payees[0].name)
  const [paused, setPaused] = useState(false)

  const allowed = payees.find((option) => option.name === payee)!.allowed
  const checks = [
    { label: 'Signed by a registered agent key', ok: true, error: 'UnknownAgent' },
    { label: 'Agent is active', ok: !paused, error: 'AgentPaused' },
    { label: 'Payee is on the allowlist', ok: allowed, error: 'PayeeNotAllowed' },
    { label: `At most $${POLICY.perTx} per payment`, ok: amount <= POLICY.perTx, error: 'OverPerTxLimit' },
    {
      label: `Within budget ($${(POLICY.budget - POLICY.spent).toFixed(2)} left of $${POLICY.budget})`,
      ok: POLICY.spent + amount <= POLICY.budget,
      error: 'OverBudget',
    },
  ]
  const failed = checks.find((check) => !check.ok)

  return (
    <div className={cn('border border-line', className)}>
      <div className="grid gap-6 border-b border-line p-5 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6">
        <div>
          <label htmlFor={amountId} className="type-label text-muted">
            Agent tries to pay
          </label>
          <p className="mt-3 text-3xl tracking-[-0.03em] tabular-nums">${amount.toFixed(2)}</p>
          <input
            id={amountId}
            type="range"
            min={0.5}
            max={60}
            step={0.5}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="mt-3 w-full accent-current"
          />
        </div>
        <fieldset>
          <legend className="type-label text-muted">To</legend>
          <div className="mt-3 space-y-1.5">
            {payees.map((option) => (
              <label key={option.name} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="sim-payee"
                  checked={payee === option.name}
                  onChange={() => setPayee(option.name)}
                  className="accent-current"
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={paused}
            onChange={(event) => setPaused(event.target.checked)}
            className="accent-current"
          />
          Owner paused the agent
        </label>
      </div>

      <ul className="space-y-2.5 p-5 text-sm md:p-6">
        {checks.map((check) => (
          <li key={check.label} className={cn('flex items-center gap-3', !check.ok && 'font-medium')}>
            <Icon icon={check.ok ? Check : X} size={16} className={check.ok ? 'text-muted' : undefined} />
            <span>{check.label}</span>
            <span className="ml-auto text-xs text-muted">{check.ok ? 'passes' : 'fails'}</span>
          </li>
        ))}
      </ul>

      <p
        role="status"
        className={cn(
          'border-t border-line px-5 py-4 font-mono text-[0.8125rem] md:px-6',
          failed && 'bg-accent/10',
        )}
      >
        {failed
          ? `__check_auth → Error::${failed.error}. The transfer is refused; nothing moves. The agent can ask you to approve it once.`
          : '__check_auth → Ok. USDC transfer authorized; settles on Stellar in about 5 seconds.'}
      </p>
    </div>
  )
}
