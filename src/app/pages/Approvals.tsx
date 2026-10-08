import { Check, ClipboardCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { money, timeAgo } from '../format'
import { useStore } from '../store'
import { EmptyState, Panel } from '../ui'

/** Purchases an agent could not make on its own. The owner says yes or no. */
export default function Approvals() {
  const { state, dispatch } = useStore()
  const { approvals, agents, balance } = state

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Approvals</h1>

      <Panel title={`Waiting for you${approvals.length ? ` (${approvals.length})` : ''}`} flush>
        {approvals.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to approve">
            When an agent wants to buy something outside its limits, it asks here first.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-taupe/30">
            {approvals.map((approval) => {
              const agent = agents.find((candidate) => candidate.id === approval.agentId)
              const short = approval.amount > balance
              return (
                <li
                  key={approval.id}
                  className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-5 md:px-6"
                >
                  <div className="min-w-0 flex-1 basis-72">
                    <p className="font-medium">{approval.item}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {approval.merchant} · {approval.category}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Asked by{' '}
                      {agent ? (
                        <Link
                          to={`/app/agents/${agent.id}`}
                          className="text-charcoal underline underline-offset-4"
                        >
                          {agent.name}
                        </Link>
                      ) : (
                        'a disconnected agent'
                      )}{' '}
                      · {timeAgo(approval.requestedAt).toLowerCase()}
                    </p>
                  </div>

                  <div className="basis-56">
                    <p className="text-2xl tracking-[-0.02em] tabular-nums">{money(approval.amount)}</p>
                    <p className="mt-1 text-sm text-burgundy">{approval.why}</p>
                    {short && <p className="mt-1 text-sm text-muted">More than your balance</p>}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      leadingIcon={X}
                      onClick={() => dispatch({ type: 'resolveApproval', id: approval.id, approve: false })}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      leadingIcon={Check}
                      disabled={short}
                      onClick={() => dispatch({ type: 'resolveApproval', id: approval.id, approve: true })}
                    >
                      Approve once
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="When an agent has to ask">
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>The purchase is over the agent&rsquo;s per-purchase limit.</li>
            <li>The merchant is not on the agent&rsquo;s payee allowlist.</li>
            <li>It is the first purchase from a merchant the agent has not used before.</li>
            <li>The purchase would take the agent past its monthly budget.</li>
          </ul>
        </Panel>
        <Panel title="What happens next">
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>
              Approve, and your passkey signs <code className="font-mono text-[0.8125rem]">approve_once</code> on
              your wallet: the payment goes through at once, this one time.
            </li>
            <li>Decline, and the agent is told no. Nothing is charged.</li>
            <li>Requests you do not answer expire after 24 hours.</li>
          </ul>
        </Panel>
        <Panel title="Asked too often?">
          <p className="text-sm leading-relaxed text-muted">
            Raise the agent&rsquo;s per-purchase limit or budget on its page and it will stop
            asking for purchases of that size.
          </p>
          <Link to="/app/agents" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
            Review limits
          </Link>
        </Panel>
      </div>
    </div>
  )
}
