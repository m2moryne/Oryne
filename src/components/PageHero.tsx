import type { ReactNode } from 'react'
import { Container } from './Section'

/** The opening of an inner page: a label, a large title and a short lede. */
export function PageHero({
  label,
  title,
  lede,
  children,
}: {
  label: string
  title: ReactNode
  lede: ReactNode
  /** Actions or extras under the lede. */
  children?: ReactNode
}) {
  return (
    <section aria-labelledby="page-title" className="tone-white pt-(--nav-h)">
      <Container className="pb-16 pt-20 md:pb-24 md:pt-28">
        <p className="type-label text-muted">{label}</p>
        <h1 id="page-title" className="type-statement mt-8 max-w-[18ch]">
          {title}
        </h1>
        <p className="type-lede mt-8 max-w-2xl text-muted">{lede}</p>
        {children && <div className="mt-10">{children}</div>}
      </Container>
    </section>
  )
}
