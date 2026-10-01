import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

type CardProps = {
  index: string
  title: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}

/** Sharp-edged card: hairline border, no shadow. Takes its colours from the section tone. */
export function Card({ index, title, icon, children, className }: CardProps) {
  return (
    <article
      className={cn('group relative flex h-full flex-col border border-line p-8 md:p-10', className)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -top-px h-px origin-left scale-x-0 bg-accent transition-transform duration-700 ease-quiet group-hover:scale-x-100"
      />
      <div className="flex items-start justify-between text-muted">
        <span className="type-label tabular-nums">{index}</span>
        <Icon icon={icon} size={20} />
      </div>
      <h3 className="mt-20 text-sm font-medium uppercase tracking-[0.22em] md:mt-28">{title}</h3>
      <p className="mt-4 max-w-[30ch] text-[0.9375rem] leading-relaxed text-muted">{children}</p>
    </article>
  )
}
