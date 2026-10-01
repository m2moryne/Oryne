import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

export function LongTerm() {
  return (
    <Section id="long-term" labelledBy="long-term-title" tone="charcoal">
      <Reveal className="my-auto py-14">
        <h2 id="long-term-title" className="type-statement max-w-[17ch]">
          We are building for the economy after the interface.
        </h2>
      </Reveal>

      <div className="grid lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-5 lg:col-start-7">
          <p className="type-lede text-muted">
            The next generation of commerce will not always begin with a person opening an app.
            Increasingly, it will begin with software acting on someone&rsquo;s behalf.
          </p>
          <span aria-hidden="true" className="mt-14 block h-px w-24 bg-accent" />
          <p className="mt-6 font-serif text-3xl">Oryne</p>
        </Reveal>
      </div>
    </Section>
  )
}
