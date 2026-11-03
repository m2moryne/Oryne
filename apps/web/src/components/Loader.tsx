import { cn } from '../lib/cn'

/**
 * The system loader, centred. `screen` fills the viewport (the dashboard
 * starting up); otherwise it centres in its container (a panel loading).
 */
export function Loader({ screen, className, label = 'Loading' }: { screen?: boolean; className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center', screen ? 'tone-white fixed inset-0 z-50' : 'py-16', className)}
    >
      <span className="loader" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
