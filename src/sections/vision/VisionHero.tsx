import { Container } from '../../components/Section'

export function VisionHero() {
  return (
    <section
      aria-labelledby="vision-title"
      className="tone-cream flex min-h-svh flex-col pt-(--nav-h)"
    >
      <Container className="flex flex-1 flex-col justify-center py-20">
        <h1 id="vision-title" className="type-display">
          <span className="block">An economy</span>
          <span className="block">where software</span>
          <span className="block">can act.</span>
        </h1>
        <p className="type-lede mt-10 max-w-md text-muted md:mt-14">
          A view of where commerce is heading, and of what will need to exist beneath it.
        </p>
      </Container>
    </section>
  )
}
