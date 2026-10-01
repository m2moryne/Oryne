import soon from '../assets/soon.svg'
import { Button } from '../components/Button'
import { Container } from '../components/Section'
import { TextLink } from '../components/TextLink'
import { usePageMeta } from '../hooks/usePageMeta'

/** Placeholder for pages that are linked but not built yet (see soonPages in lib/site.ts). */
export default function ComingSoon({ name }: { name: string }) {
  usePageMeta(`Coming soon — Oryne`, `${name} is under construction. More to come from Oryne.`)

  return (
    <section
      aria-labelledby="soon-title"
      className="tone-cream flex min-h-svh flex-col pt-(--nav-h)"
    >
      <Container className="grid flex-1 items-center gap-y-14 py-16 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-6">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line px-4 py-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-burgundy" />
            Coming soon
          </p>
          <h1 id="soon-title" className="type-statement mt-8 max-w-[14ch]">
            Hard hats on. We&rsquo;re still building.
          </h1>
          <p className="type-lede mt-8 max-w-md text-muted">
            {name} is under construction. We&rsquo;re laying the foundations carefully, and it will
            open as soon as it&rsquo;s ready to carry weight.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Button to="/">Back to home</Button>
            <TextLink to="/contact" className="type-label">
              Start a conversation
            </TextLink>
          </div>
        </div>

        <div className="lg:col-span-6">
          <img
            src={soon}
            alt=""
            width={1178}
            height={724}
            className="mx-auto h-auto w-full max-w-xl"
          />
        </div>
      </Container>
    </section>
  )
}
