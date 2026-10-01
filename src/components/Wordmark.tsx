import { cn } from '../lib/cn'

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block font-medium uppercase tracking-[0.34em]', className)}>
      Oryne
    </span>
  )
}
