import { ArrowDown } from 'lucide-react'
import { ArrowLine } from '../../components/ArrowLine'
import { Icon } from '../../components/Icon'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const sequence = [
  { index: '01', label: 'Discover', note: 'Find the services and counterparts a task requires.' },
  { index: '02', label: 'Decide', note: 'Weigh the options against a goal and its constraints.' },
  { index: '03', label: 'Act', note: 'Carry out the decision within the permissions given.' },
  { index: '04', label: 'Settle', note: 'Complete the exchange and leave a record of it.' },
]

export function AutonomousSystems() {
  return (
    <Section id="autonomous-systems" labelledBy="autonomous-systems-title" tone="burgundy">
      <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-7">
          <h2 id="autonomous-systems-title" className="type-statement max-w-[15ch]">
            From recommending to executing.
          </h2>
        </Reveal>
        <Reveal delay={120} className="type-lede space-y-5 text-muted lg:col-span-4 lg:col-start-9 lg:pt-3">
          <p>
            Until now, software has mostly advised. It surfaces options, then waits for a person to
            choose and to act.
          </p>
          <p>
            That is changing. Software will not simply recommend actions; increasingly, it will
            execute them.
          </p>
        </Reveal>
      </div>

      <Reveal className="mt-auto pt-16 lg:pt-20">
        <ol className="grid lg:grid-cols-4">
          {sequence.map((step, i) => {
            const last = i === sequence.length - 1
            return (
              <li
                key={step.index}
                className="border-t border-line py-7 lg:border-t-0 lg:py-0 lg:pr-8"
              >
                <span className="type-label tabular-nums text-muted">{step.index}</span>
                <div className="mt-4 flex items-center gap-5 lg:mt-6">
                  <span className="text-[clamp(1.5rem,2.2vw,2.25rem)] uppercase leading-none tracking-[0.12em]">
                    {step.label}
                  </span>
                  {last ? (
                    <span aria-hidden="true" className="size-[7px] bg-accent" />
                  ) : (
                    <>
                      <ArrowLine className="hidden opacity-45 lg:block" />
                      <Icon icon={ArrowDown} size={18} className="ml-auto opacity-45 lg:hidden" />
                    </>
                  )}
                </div>
                <p className="mt-4 max-w-[28ch] text-sm leading-relaxed text-muted lg:mt-6">
                  {step.note}
                </p>
              </li>
            )
          })}
        </ol>
      </Reveal>
    </Section>
  )
}
