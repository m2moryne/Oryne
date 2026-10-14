import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[90rem] px-6 md:px-10 lg:px-16', className)}>
      {children}
    </div>
  )
}

export type Tone = 'cream' | 'white' | 'charcoal' | 'purple' | 'burgundy'

type SectionProps = {
  children: ReactNode
  id?: string
  /** id of the heading that names this section. */
  labelledBy: string
  /** Background and matching text colours; defined in index.css. */
  tone?: Tone
  className?: string
}

/** A full-viewport chapter. Children are laid out in a column inside the page grid. */
export function Section({ children, id, labelledBy, tone = 'cream', className }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('flex min-h-svh flex-col', `tone-${tone}`, className)}
    >
      <Container className="flex flex-1 flex-col py-20 md:py-24">{children}</Container>
    </section>
  )
}
