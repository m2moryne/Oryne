import { ArrowLine } from '../../components/ArrowLine'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { cn } from '../../lib/cn'

type RelationProps = {
  caption: string
  from: string
  to: string
  note: string
  /** The established model is set back; the emerging one stands at full strength. */
  established?: boolean
}

function Relation({ caption, from, to, note, established }: RelationProps) {
  return (
    <div className="border-b border-line py-7 md:py-8">
      <p className="type-label text-muted">{caption}</p>
      <p
        className={cn(
          'mt-6 flex items-center gap-5 text-lg font-medium uppercase tracking-[0.2em] md:gap-8 md:text-2xl',
          established && 'opacity-55',
        )}
      >
        <span>{from}</span>
        <ArrowLine />
        <span className="sr-only">to</span>
        <span>{to}</span>
      </p>
      <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">{note}</p>
    </div>
  )
}

export function Shift() {
  return (
    <Section id="shift" labelledBy="shift-title" tone="charcoal">
      <Reveal>
        <h2 id="shift-title" className="type-statement max-w-[18ch]">
          Software is no longer only executing instructions.
        </h2>
      </Reveal>

      <div className="mt-auto grid gap-y-14 pt-16 lg:grid-cols-12 lg:gap-x-8 lg:pt-20">
        <Reveal className="lg:col-span-4">
          <p className="type-lede text-muted">
            Autonomous systems are beginning to make decisions, access services and coordinate with
            other systems. The infrastructure beneath them was built for humans.
          </p>
        </Reveal>

        <Reveal delay={120} className="border-t border-line lg:col-span-7 lg:col-start-6">
          <Relation
            established
            caption="Built for people"
            from="Human"
            to="Service"
            note="An interface, a session, and a person approving each step."
          />
          <Relation
            caption="Beginning now"
            from="System"
            to="System"
            note="Direct and continuous, with no interface in between."
          />
        </Reveal>
      </div>
    </Section>
  )
}
