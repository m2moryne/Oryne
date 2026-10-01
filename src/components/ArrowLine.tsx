import { cn } from '../lib/cn'

/** A hairline that grows to fill its row and ends in an arrowhead. Inherits text colour. */
export function ArrowLine({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative block h-px min-w-8 flex-1 bg-current', className)}>
      <span className="absolute right-0 top-1/2 size-[7px] -translate-y-1/2 rotate-45 border-r border-t border-current" />
    </span>
  )
}
