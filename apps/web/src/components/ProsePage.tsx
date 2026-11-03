import type { ReactNode } from 'react'
import { PageHero } from './PageHero'
import { Container } from './Section'

export type ProseSection = { id: string; title: string; body: ReactNode }

/**
 * A page of writing: About, Security, Privacy, Terms. The hero, then numbered
 * sections with their titles in a left column on wide screens.
 */
export function ProsePage({
  label,
  title,
  lede,
  updated,
  sections,
}: {
  label: string
  title: ReactNode
  lede: ReactNode
  /** "Last updated" date for policies. */
  updated?: string
  sections: ProseSection[]
}) {
  return (
    <>
      <PageHero label={label} title={title} lede={lede}>
        {updated && <p className="text-sm text-muted">Last updated {updated}</p>}
      </PageHero>
      <section className="tone-white pb-24 md:pb-32">
        <Container>
          <div className="divide-y divide-line border-t border-line">
            {sections.map((section, index) => (
              <article key={section.id} id={section.id} className="grid scroll-mt-24 gap-y-4 py-10 md:py-14 lg:grid-cols-12 lg:gap-x-8">
                <h2 className="text-xl tracking-[-0.01em] lg:col-span-4">
                  <span className="mr-3 text-sm tabular-nums text-muted">{String(index + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <div className="prose-body max-w-2xl space-y-4 text-[0.975rem] leading-relaxed text-charcoal/85 lg:col-span-8">
                  {section.body}
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>
    </>
  )
}

/** A bulleted list in prose pages. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

/** An inline link styled for prose. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:/.test(href)
  return (
    <a
      href={href}
      className="text-charcoal underline underline-offset-4 hover:text-burgundy"
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
