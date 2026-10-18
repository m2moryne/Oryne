import { Check, Copy, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { adminGet, AdminError } from '../lib/api'
import { cn } from '../lib/format'

/** The signed-in admin: their token and a way out. */
export const AdminContext = createContext<{ token: string; signOut: () => void; network: string }>({
  token: '',
  signOut: () => {},
  network: 'stellar-testnet',
})
export const useAdmin = () => useContext(AdminContext)

/** Loads an admin endpoint; signs out if the token stops working. */
export function useAdminData<T>(path: string) {
  const { token, signOut } = useAdmin()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminGet<T>(path, token))
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 401) signOut()
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }, [path, token, signOut])

  useEffect(() => {
    void load()
  }, [load])

  return { data, error, loading, reload: load }
}

export function PageHeader({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl tracking-[-0.02em]">{title}</h1>
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      {children}
    </div>
  )
}

export function Panel({ title, action, children, flush }: { title?: string; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="border border-line bg-surface">
      {title && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={flush ? undefined : 'p-5'}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="border border-line bg-surface p-5">
      <p className="type-label text-muted">{label}</p>
      <p className="mt-3 text-3xl tracking-[-0.03em] tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="border border-accent/50 px-4 py-2.5 text-sm text-accent">{children}</p>
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center border border-line text-muted">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  )
}

/** A table with a label row; rows are given as ready-made cells. */
export function Table({ columns, children, minWidth = '48rem' }: { columns: Array<string | { label: string; right?: boolean }>; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead>
          <tr className="type-label border-b border-line text-muted">
            {columns.map((column, index) => {
              const { label, right } = typeof column === 'string' ? { label: column, right: false } : column
              return (
                <th key={index} scope="col" className={cn('px-4 py-3 font-medium first:pl-5 last:pr-5', right && 'text-right')}>
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

export const cell = 'px-4 py-3 first:pl-5 last:pr-5'

/** Segmented filter, e.g. All / Errors. */
export function Filter<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return (
    <div role="group" className="flex rounded-full border border-line p-1">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
            value === option ? 'bg-text text-bg' : 'text-muted hover:text-text',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function StatusText({ status }: { status: string | number }) {
  const bad = typeof status === 'number' ? status >= 400 : ['refused', 'failed', 'revoked', 'removed', 'paused'].includes(status)
  return <span className={cn('font-mono text-xs', bad ? 'text-accent' : 'text-muted')}>{status}</span>
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard blocked: the value is on screen to select.
        }
      }}
      className="inline-flex size-7 items-center justify-center text-muted transition-colors hover:text-text"
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  )
}

/** A monospace ID with a copy button, shortened unless `full`. */
export function Id({ value, full, href }: { value: string | null; full?: boolean; href?: string }) {
  if (!value) return <span className="text-muted">—</span>
  const text = full ? value : value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
          {text}
        </a>
      ) : (
        text
      )}
      <CopyButton value={value} />
    </span>
  )
}
