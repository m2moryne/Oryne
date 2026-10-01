import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

export function Beginning() {
  return (
    <Section id="beginning" labelledBy="beginning-title" tone="purple">
      <div className="my-auto grid lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-10">
          <h2 id="beginning-title" className="type-statement max-w-[17ch]">
            Oryne starts with machine-to-machine interaction.
          </h2>
        </Reveal>
        <Reveal delay={120} className="mt-10 lg:col-span-5 lg:col-start-7 lg:mt-14">
          <p className="type-lede text-muted">
            We are exploring the infrastructure required for autonomous systems to safely discover
            services, operate within defined limits and exchange value without constant human
            intervention.
          </p>
        </Reveal>
      </div>
    </Section>
  )
}
