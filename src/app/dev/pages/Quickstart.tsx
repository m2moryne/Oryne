import { ArrowUpRight, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { useDashboard } from '../../DashboardLayout'
import { catalogue, id } from '../../seed'
import { useStore } from '../../store'
import { Panel, Stat, inputClasses } from '../../ui'
import { API, maskKey, mockLogs, snippets } from '../devData'
import { CodeBlock, CopyButton, ModeTag, Mono } from '../devUi'

const DAY = 86_400_000

const resources = [
  { label: 'API reference', note: 'Every endpoint, parameter and error', to: '/docs' },
  { label: 'Guides', note: 'Budgets, idempotency, going live', to: '/docs' },
  { label: 'Changelog', note: `Current version ${API.version}`, to: '/journal' },
  { label: 'API status', note: 'Uptime and incidents', to: '/status' },
]

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="grid gap-4 py-6 first:pt-0 last:pb-0 lg:grid-cols-[14rem_1fr] lg:gap-8">
      <div className="flex gap-4">
        <span className="flex size-7 shrink-0 items-center justify-center border border-charcoal text-xs font-medium tabular-nums">
          {number}
        </span>
        <h3 className="pt-0.5 font-medium">{title}</h3>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </li>
  )
}

/** Fires a sandbox payment through the same checks the dashboard uses, and shows the API's answer. */
function Sandbox() {
  const { state, dispatch } = useStore()
  const agents = state.agents.filter((agent) => agent.status === 'active')
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [paymentId, setPaymentId] = useState('')

  const payment = state.purchases.find((purchase) => purchase.id === paymentId)

  const run = () => {
    const agent = agents.find((candidate) => candidate.id === agentId)
    if (!agent) return
    const template = catalogue[agent.kind][0]
    const next = id('pay')
    dispatch({
      type: 'attemptPurchase',
      purchase: {
        id: next,
        agentId: agent.id,
        merchant: template.merchant,
        item: template.item,
        category: template.category,
        amount: template.min,
        at: new Date().toISOString(),
      },
    })
    setPaymentId(next)
  }

  const response = payment
    ? JSON.stringify(
        {
          id: payment.id,
          object: 'payment',
          agent: payment.agentId,
          amount: Math.round(payment.amount * 100),
          currency: 'usd',
          merchant: payment.merchant.toLowerCase().replace(/\s+/g, '-'),
          description: payment.item,
          status: payment.status,
          ...(payment.reason && { decline_reason: payment.reason }),
          livemode: false,
        },
        null,
        2,
      )
    : '// The response appears here.'

  return (
    <Panel title="Try it: send a test payment">
      <p className="text-sm leading-relaxed text-muted">
        Runs a sandbox payment for one of your agents. It passes through the same budget and
        balance checks as a real one, and shows up in the agent dashboard.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          aria-label="Agent"
          className={`${inputClasses} w-auto! min-w-48 flex-1 rounded-none! py-2`}
        >
          {agents.length === 0 && <option value="">No active agents</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <Button size="sm" leadingIcon={Play} onClick={run} disabled={!agentId}>
          Send request
        </Button>
      </div>
      <div className="mt-4">
        <CodeBlock code={response} label={payment ? `201 · POST /v1/payments` : 'Response'} />
      </div>
    </Panel>
  )
}

export default function Quickstart() {
  const { state } = useStore()
  const { openCreateKey } = useDashboard()
  const { mode, keys } = state.dev

  const key = keys.find((candidate) => candidate.mode === mode)
  const shownKey = key ? maskKey(key) : `oryne_${mode}_sk_…`

  const logs = mockLogs().filter((log) => log.mode === mode)
  const recent = logs.filter((log) => Date.now() - new Date(log.at).getTime() < DAY)
  const succeeded = recent.filter((log) => log.status < 400).length
  const latencies = recent.map((log) => log.latency).sort((a, b) => a - b)
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Quickstart</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requests, 24 hours" value={recent.length.toLocaleString()} note={`In ${mode} mode`} />
        <Stat
          label="Success rate"
          value={recent.length ? `${((succeeded / recent.length) * 100).toFixed(1)}%` : '—'}
          note={`${recent.length - succeeded} failed`}
        />
        <Stat label="p95 latency" value={`${p95} ms`} note="Across all endpoints" />
        <Stat label="API version" value={API.version} note="Pinned for your account" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Make your first payment" className="xl:col-span-2">
          <ol className="divide-y divide-taupe/30">
            <Step number={1} title="Install the SDK">
              <CodeBlock samples={snippets.install} />
            </Step>
            <Step number={2} title="Add your API key">
              <CodeBlock code={snippets.env(shownKey)} label=".env" />
              <p className="text-sm text-muted">
                {key ? (
                  <>
                    Using <span className="text-charcoal">{key.name}</span>. The full secret is only
                    shown when a key is created.{' '}
                  </>
                ) : (
                  <>You have no {mode} key yet. </>
                )}
                <button type="button" onClick={openCreateKey} className="underline underline-offset-4 hover:text-charcoal">
                  Create a key
                </button>
              </p>
            </Step>
            <Step number={3} title="Create an agent and let it pay">
              <CodeBlock samples={snippets.firstPayment} />
            </Step>
            <Step number={4} title="Listen for what happens">
              <CodeBlock code={snippets.listen} />
              <p className="text-sm text-muted">
                Forwards events such as <Mono>payment.settled</Mono> to your machine while you build.{' '}
                <Link to="/dev/webhooks" className="underline underline-offset-4 hover:text-charcoal">
                  Set up webhooks
                </Link>
              </p>
            </Step>
          </ol>
        </Panel>

        <div className="space-y-4">
          <Panel title="Your environment" action={<ModeTag mode={mode} />}>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted">Base URL</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <Mono>{API.base}</Mono>
                  <CopyButton value={API.base} className="-mr-2.5 text-muted hover:text-charcoal" />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Authentication</dt>
                <dd className="mt-1">
                  <Mono>{'Authorization: Bearer <key>'}</Mono>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Rate limit</dt>
                <dd className="mt-1 tabular-nums">{API.rateLimit} requests per minute</dd>
              </div>
              <div>
                <dt className="text-muted">Amounts</dt>
                <dd className="mt-1">Integers, in the smallest currency unit (cents)</dd>
              </div>
            </dl>
          </Panel>

          <Sandbox />

          <Panel title="Resources" flush>
            <ul className="divide-y divide-taupe/30">
              {resources.map((resource) => (
                <li key={resource.label}>
                  <Link
                    to={resource.to}
                    className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-200 hover:bg-cream/50 md:px-6"
                  >
                    <span>
                      <span className="block text-sm font-medium">{resource.label}</span>
                      <span className="block text-sm text-muted">{resource.note}</span>
                    </span>
                    <Icon icon={ArrowUpRight} size={16} className="text-muted group-hover:text-charcoal" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
