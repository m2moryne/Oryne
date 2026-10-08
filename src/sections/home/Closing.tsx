import { ArrowRight } from 'lucide-react'
import { Button } from '../../components/Button'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'

export function Closing() {
  return (
    <Section id="start" labelledBy="start-title" tone="burgundy">
      <div className="my-auto grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-8">
          <h2 id="start-title" className="type-statement max-w-[14ch]">
            Give your agent a wallet. Keep the keys to it.
          </h2>
        </Reveal>
        <Reveal delay={120} className="lg:col-span-4 lg:self-end">
          <p className="type-lede text-muted">
            The preview runs on simulated data, end to end: connect an agent, set its mandate, watch
            it pay, approve what it asks for.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Button to="/app/agents?connect=1" variant="light" icon={ArrowRight}>
              Try the dashboard
            </Button>
            <TextLink to="/contact" className="type-label">
              Talk to us
            </TextLink>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
