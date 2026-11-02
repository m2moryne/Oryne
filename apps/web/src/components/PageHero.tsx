import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Container } from './Section'

/** The opening of an inner page: a label, a large title and a short lede. */
export function PageHero({
  label,
  title,
  lede,
  fill,
  children,
}: {
  label?: string
  title: ReactNode
  lede: ReactNode
  /** Take the whole first screen, with the content centred in it. */
  fill?: boolean
  /** Actions or extras under the lede. */
  children?: ReactNode
}) {
  return (
    <section aria-labelledby="page-title" className={cn('tone-white pt-(--nav-h)', fill && 'flex min-h-svh flex-col')}>
      <Container className={cn('pb-16 pt-20 md:pb-24 md:pt-28', fill && 'flex flex-1 flex-col justify-center md:pt-20')}>
        {label && <p className="type-label mb-8 text-muted">{label}</p>}
        <h1 id="page-title" className="type-statement max-w-[18ch]">
          {title}
        </h1>
        <p className="type-lede mt-8 max-w-2xl text-muted">{lede}</p>
        {children && <div className="mt-10">{children}</div>}
      </Container>
    </section>
  )
}
