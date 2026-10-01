import { Check, CirclePause, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { cn } from '../lib/cn'
import { money } from './format'

/** White surface with a hairline border: the dashboard's basic container. */
export function Panel({
  children,
  title,
  action,
  className,
  flush,
}: {
  children: ReactNode
  title?: string
  action?: ReactNode
  className?: string
  /** Drop the body padding, e.g. for tables that run edge to edge. */
  flush?: boolean
}) {
  return (
    <section className={cn('tone-white border border-taupe/50', className)}>
      {title && (
        <header className="flex items-center justify-between gap-4 border-b border-taupe/40 px-5 py-4 md:px-6">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={flush ? undefined : 'p-5 md:p-6'}>{children}</div>
    </section>
  )
}

/** A headline figure. Not a chart: one number, its label and a line of context. */
export function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: ReactNode
}) {
  return (
    <div className="tone-white border border-taupe/50 p-5 md:p-6">
      <p className="type-label text-muted">{label}</p>
      <p className="mt-5 text-3xl tracking-[-0.03em] tabular-nums">{value}</p>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
    </div>
  )
}

/** Spent against a budget. The figures are always written out beside the bar. */
export function Meter({ spent, budget, compact }: { spent: number; budget: number; compact?: boolean }) {
  const ratio = budget > 0 ? Math.min(spent / budget, 1) : 0
  const full = ratio >= 1
  return (
    <div>
      <div
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(spent, budget)}
        aria-valuetext={`${money(spent)} of ${money(budget)}`}
        className="h-1.5 overflow-hidden rounded-full bg-taupe/30"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-quiet', full ? 'bg-burgundy' : 'bg-charcoal')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {!compact && (
        <p className="mt-2 flex justify-between text-sm tabular-nums">
          <span>{money(spent)} spent</span>
          <span className="text-muted">of {money(budget)}</span>
        </p>
      )}
    </div>
  )
}

const pills = {
  active: { label: 'Active', icon: Check, classes: 'border-charcoal/25 text-charcoal' },
  paused: { label: 'Paused', icon: CirclePause, classes: 'border-taupe text-muted' },
  settled: { label: 'Settled', icon: Check, classes: 'border-charcoal/25 text-charcoal' },
  declined: { label: 'Declined', icon: X, classes: 'border-burgundy/40 text-burgundy' },
}

/** Status is always an icon and a word, never colour alone. */
export function StatusPill({ status }: { status: keyof typeof pills }) {
  const pill = pills[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        pill.classes,
      )}
    >
      <Icon icon={pill.icon} size={13} />
      {pill.label}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-taupe/60 text-muted">
        <Icon icon={icon} size={20} />
      </span>
      <h3 className="mt-5 text-lg">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export const inputClasses =
  'block w-full rounded-lg border border-taupe/70 bg-white px-4 py-3 text-base outline-none transition-colors duration-200 placeholder:text-charcoal/40 hover:border-charcoal/50 focus:border-burgundy focus:ring-1 focus:ring-burgundy'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-2">{children(id)}</div>
    </div>
  )
}

/** Modal built on the native <dialog>, so focus trapping and Escape come for free. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose()
      }}
      className="tone-white m-auto w-[min(34rem,calc(100vw-2rem))] border border-taupe/50 p-0 backdrop:bg-charcoal/55"
    >
      {open && (
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 id={titleId} className="text-2xl tracking-[-0.02em]">
                {title}
              </h2>
              {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-cream hover:text-charcoal"
            >
              <Icon icon={X} size={18} />
            </button>
          </div>
          <div className="mt-6">{children}</div>
        </div>
      )}
    </dialog>
  )
}
