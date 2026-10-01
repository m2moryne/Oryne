import { Check, Copy } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { cn } from '../lib/cn'
import { money } from './format'
import { id } from './seed'
import { useStore } from './store'
import type { Agent, AgentKind } from './types'
import { Dialog, Field, inputClasses } from './ui'

const kinds: Array<{ kind: AgentKind; note: string }> = [
  { kind: 'Research', note: 'Finds and reads things' },
  { kind: 'Shopping', note: 'Buys goods for you' },
  { kind: 'Travel', note: 'Plans and books trips' },
  { kind: 'Operations', note: 'Keeps systems running' },
  { kind: 'Other', note: 'Something else' },
]

const steps = ['Your agent', 'Its budget', 'Connect']

type Props = {
  open: boolean
  onClose: () => void
  /** Called with the new agent once it has been connected. */
  onConnected?: (agent: Agent) => void
}

/** Three plain steps: name the agent, give it a budget, hand it a connection code. */
export function ConnectAgentDialog({ open, onClose, onConnected }: Props) {
  const { dispatch } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AgentKind>('Research')
  const [budget, setBudget] = useState('100')
  const [perPurchase, setPerPurchase] = useState('20')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  const close = () => {
    onClose()
    setStep(0)
    setName('')
    setKind('Research')
    setBudget('100')
    setPerPurchase('20')
    setCopied(false)
  }

  const next = (event: FormEvent) => {
    event.preventDefault()
    if (step === 0) setStep(1)
    if (step === 1) {
      // Placeholder code. A real one would be issued by the Oryne backend.
      setCode(`oryne-${id('link').slice(5)}-${id('key').slice(4)}`)
      setStep(2)
    }
  }

  const finish = () => {
    const agent: Agent = {
      id: id('agt'),
      name: name.trim(),
      kind,
      status: 'active',
      budget: Number(budget),
      perPurchase: Number(perPurchase),
      connectedAt: new Date().toISOString(),
    }
    dispatch({ type: 'connectAgent', agent })
    onConnected?.(agent)
    close()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Connect an agent"
      description="No code needed. It takes about a minute."
    >
      <ol className="mb-7 flex gap-2" aria-label="Progress">
        {steps.map((label, index) => (
          <li key={label} className="flex-1" aria-current={index === step ? 'step' : undefined}>
            <span
              className={cn('block h-1 rounded-full', index <= step ? 'bg-burgundy' : 'bg-taupe/40')}
            />
            <span className={cn('mt-2 block text-xs', index === step ? 'font-medium' : 'text-muted')}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step < 2 ? (
        <form onSubmit={next} className="space-y-6">
          {step === 0 && (
            <>
              <Field label="What do you call this agent?">
                {(fieldId) => (
                  <input
                    id={fieldId}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Research assistant"
                    required
                    autoFocus
                    className={inputClasses}
                  />
                )}
              </Field>

              <fieldset>
                <legend className="text-sm font-medium">What does it mostly do?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {kinds.map((option) => (
                    <label
                      key={option.kind}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors duration-200 has-focus-visible:ring-2 has-focus-visible:ring-burgundy',
                        kind === option.kind
                          ? 'border-charcoal'
                          : 'border-taupe/60 hover:border-charcoal/50',
                      )}
                    >
                      <input
                        type="radio"
                        name="kind"
                        value={option.kind}
                        checked={kind === option.kind}
                        onChange={() => setKind(option.kind)}
                        className="sr-only"
                      />
                      <span>
                        <span className="block text-sm font-medium">{option.kind}</span>
                        <span className="block text-xs text-muted">{option.note}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <Field
                label="Monthly budget"
                hint="The most this agent can spend in any 30 days. You can change it later."
              >
                {(fieldId) => (
                  <MoneyInput id={fieldId} value={budget} onChange={setBudget} autoFocus />
                )}
              </Field>
              <Field
                label="Limit per purchase"
                hint="Anything above this is declined, however much budget is left."
              >
                {(fieldId) => (
                  <MoneyInput id={fieldId} value={perPurchase} onChange={setPerPurchase} max={budget} />
                )}
              </Field>
            </>
          )}

          <div className="flex justify-between gap-3 pt-1">
            {step === 0 ? (
              <Button variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStep(0)}>
                Back
              </Button>
            )}
            <Button type="submit" size="sm">
              Continue
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium">Give this code to your agent</p>
            <p className="mt-1 text-sm text-muted">
              Paste it wherever your agent keeps its payment or tool settings. It tells the agent to
              pay through Oryne, inside the limits you just set.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-taupe/70 bg-cream/60 py-2 pl-4 pr-2">
              <code className="min-w-0 flex-1 truncate font-mono text-sm">{code}</code>
              <button
                type="button"
                onClick={copy}
                className="flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-white"
              >
                <Icon icon={copied ? Check : Copy} size={15} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-lg border border-taupe/50 p-4 text-sm">
            <div>
              <dt className="text-muted">Agent</dt>
              <dd className="mt-1 font-medium">{name}</dd>
            </div>
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="mt-1 font-medium">{kind}</dd>
            </div>
            <div>
              <dt className="text-muted">Monthly budget</dt>
              <dd className="mt-1 font-medium tabular-nums">{money(Number(budget))}</dd>
            </div>
            <div>
              <dt className="text-muted">Per purchase</dt>
              <dd className="mt-1 font-medium tabular-nums">{money(Number(perPurchase))}</dd>
            </div>
          </dl>

          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button size="sm" onClick={finish}>
              Finish connecting
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function MoneyInput({
  id: fieldId,
  value,
  onChange,
  max,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  max?: string
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
      <input
        id={fieldId}
        type="number"
        inputMode="decimal"
        min="1"
        max={max}
        step="1"
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputClasses, 'pl-8 tabular-nums')}
      />
    </div>
  )
}
