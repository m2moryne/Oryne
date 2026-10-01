import { Panel } from '../../ui'
import { sdks, snippets, testMerchants } from '../devData'
import { CodeBlock, Mono } from '../devUi'

const principles = [
  {
    title: 'Idempotent by default',
    note: 'Send an Idempotency-Key and a retried request never pays twice.',
  },
  {
    title: 'Errors you can act on',
    note: 'Every error has a type, a code and a plain message, plus the request ID.',
  },
  {
    title: 'Pinned versions',
    note: 'Your account stays on its API version until you choose to upgrade.',
  },
  {
    title: 'The same in test and live',
    note: 'Swap the key and nothing else changes. The sandbox behaves like production.',
  },
]

export default function Sdks() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">SDKs and tools</h1>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sdks.map((sdk) => (
          <li key={sdk.name}>
            <div className="tone-white flex h-full flex-col border border-taupe/50 p-5 md:p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-medium">{sdk.name}</h2>
                <span className="border border-taupe px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums text-muted">
                  v{sdk.version}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted">
                <Mono>{sdk.pkg}</Mono>
              </p>
              <p className="mb-5 mt-4 text-sm leading-relaxed text-muted">{sdk.note}</p>
              <div className="mt-auto">
                <CodeBlock code={sdk.install} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Sandbox merchants" flush>
          <p className="px-5 pt-5 text-sm leading-relaxed text-muted md:px-6">
            In test mode, pay these merchants to exercise every outcome without waiting for one to
            happen.
          </p>
          <ul className="mt-4 divide-y divide-taupe/30 border-t border-taupe/30">
            {testMerchants.map((merchant) => (
              <li key={merchant.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 md:px-6">
                <span className="w-52 shrink-0">
                  <Mono>{merchant.id}</Mono>
                </span>
                <span className="text-sm text-muted">{merchant.behaviour}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Build locally with the CLI">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Forward webhooks to your machine, tail API logs as they happen, and trigger any event on
            demand.
          </p>
          <CodeBlock
            code={`${snippets.listen}\noryne logs tail --status 4xx\noryne trigger payment.declined`}
          />
        </Panel>
      </div>

      <Panel title="What to expect from the API" flush>
        <ul className="grid divide-taupe/30 max-md:divide-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          {principles.map((principle) => (
            <li key={principle.title} className="px-5 py-5 md:px-6">
              <h3 className="text-sm font-medium">{principle.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{principle.note}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
