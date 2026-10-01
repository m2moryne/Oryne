import { ArrowLeftRight, Scan, ShieldCheck } from 'lucide-react'
import { Card } from '../../components/Card'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const pillars = [
  {
    index: '01',
    title: 'Agency',
    icon: Scan,
    body: 'Systems that can act within clearly defined permissions.',
  },
  {
    index: '02',
    title: 'Exchange',
    icon: ArrowLeftRight,
    body: 'Infrastructure for systems to interact and transact.',
  },
  {
    index: '03',
    title: 'Trust',
    icon: ShieldCheck,
    body: 'Controls that make autonomous activity accountable.',
  },
]

export function Building() {
  return (
    <Section id="building" labelledBy="building-title" tone="white">
      <Reveal>
        <h2 id="building-title" className="type-statement max-w-[17ch]">
          New infrastructure for a new kind of commerce.
        </h2>
      </Reveal>

      <Reveal delay={120} className="mt-auto pt-16 lg:pt-20">
        <ul className="grid md:grid-cols-3">
          {pillars.map((pillar) => (
            <li
              key={pillar.index}
              className="max-md:[&:not(:first-child)]:-mt-px md:[&:not(:first-child)]:-ml-px"
            >
              <Card index={pillar.index} title={pillar.title} icon={pillar.icon}>
                {pillar.body}
              </Card>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  )
}
