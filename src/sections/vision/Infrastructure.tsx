import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'

const strata = [
  {
    label: 'Mandate',
    layers: [
      { index: '01', name: 'Identity', note: 'Who, or what, is acting.' },
      { index: '02', name: 'Authorization', note: 'On whose behalf it acts.' },
      { index: '03', name: 'Permissions', note: 'The limits it must stay within.' },
    ],
  },
  {
    label: 'Transaction',
    layers: [
      { index: '04', name: 'Exchange', note: 'How systems interact and agree.' },
      { index: '05', name: 'Settlement', note: 'How value moves between them.' },
    ],
  },
  {
    label: 'Record',
    layers: [{ index: '06', name: 'Accountability', note: 'What can be answered for afterwards.' }],
  },
]

function Endpoint({ label, note }: { label: string; note: string }) {
  return (
    <div className="type-label relative flex items-center gap-5">
      <span
        aria-hidden="true"
        className="absolute left-[calc(-1*var(--gutter))] top-1/2 size-[7px] -translate-y-1/2 bg-current"
      />
      <span>{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="text-muted">{note}</span>
    </div>
  )
}

/** A section drawing: six strata between an intention and the action that fulfils it. */
function Diagram() {
  return (
    <figure className="relative pl-(--gutter) [--gutter:1.75rem] md:[--gutter:2.5rem]">
      <figcaption className="sr-only">
        Six layers sit between intention and action. Identity, authorization and permissions form
        the mandate. Exchange and settlement form the transaction. Accountability forms the record.
      </figcaption>

      <span aria-hidden="true" className="absolute bottom-1.5 left-[3px] top-1.5 w-px bg-line" />

      <Endpoint label="Intention" note="A goal is set" />

      <div className="my-7 space-y-4">
        {strata.map((stratum) => (
          <div key={stratum.label} role="group" aria-label={stratum.label} className="sm:flex">
            <p aria-hidden="true" className="type-label mb-3 text-muted sm:hidden">
              {stratum.label}
            </p>

            <ul className="flex-1 divide-y divide-line border border-line">
              {stratum.layers.map((layer) => (
                <li
                  key={layer.index}
                  className="relative grid grid-cols-[2.25rem_1fr] items-baseline gap-x-4 gap-y-2 px-5 py-5 md:grid-cols-[2.25rem_11rem_1fr] md:px-6"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-[calc(-1*var(--gutter)-1px)] top-1/2 size-[7px] -translate-y-1/2 border border-line bg-surface"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute left-[calc(-1*var(--gutter)+6px)] top-1/2 h-px w-[calc(var(--gutter)-7px)] bg-line"
                  />
                  <span className="type-label tabular-nums text-muted">{layer.index}</span>
                  <span className="text-sm font-medium uppercase tracking-[0.18em]">
                    {layer.name}
                  </span>
                  <span className="col-start-2 text-sm leading-relaxed text-muted md:col-start-3">
                    {layer.note}
                  </span>
                </li>
              ))}
            </ul>

            <div aria-hidden="true" className="ml-3 hidden w-36 items-stretch sm:flex">
              <span className="w-2.5 border-y border-r border-line" />
              <span className="type-label ml-4 self-center text-muted">{stratum.label}</span>
            </div>
          </div>
        ))}
      </div>

      <Endpoint label="Action" note="The outcome is delivered" />
    </figure>
  )
}

export function Infrastructure() {
  return (
    <Section id="infrastructure" labelledBy="infrastructure-title" tone="white">
      <Reveal>
        <h2 id="infrastructure-title" className="type-statement max-w-[16ch]">
          The interface between intention and action.
        </h2>
      </Reveal>

      <div className="mt-auto grid gap-y-16 pt-16 lg:grid-cols-12 lg:gap-x-8 lg:pt-20">
        <Reveal className="type-lede space-y-5 text-muted lg:col-span-4">
          <p>
            For software to act on someone&rsquo;s behalf, intelligence is not enough. It has to be
            recognized, to carry a mandate, to stay within limits, and to answer for what it does.
          </p>
          <p>
            These are not separate features. They are layers of one structure, and autonomous
            commerce rests on all of them.
          </p>
        </Reveal>

        <Reveal delay={120} className="lg:col-span-7 lg:col-start-6">
          <Diagram />
        </Reveal>
      </div>
    </Section>
  )
}
