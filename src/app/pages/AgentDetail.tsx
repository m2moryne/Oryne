import { ArrowLeft, Check, Pause, Play, Receipt, Unplug } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { MoneyInput } from '../ConnectAgentDialog'
import { formatDate, money } from '../format'
import { PurchaseList } from '../PurchaseList'
import { spentBy, useStore } from '../store'
import type { Agent } from '../types'
import { Dialog, EmptyState, Field, Meter, Panel, StatusPill } from '../ui'

function BudgetForm({ agent }: { agent: Agent }) {
  const { dispatch } = useStore()
  const [budget, setBudget] = useState(String(agent.budget))
  const [perPurchase, setPerPurchase] = useState(String(agent.perPurchase))
  const [saved, setSaved] = useState(false)

  const changed = Number(budget) !== agent.budget || Number(perPurchase) !== agent.perPurchase

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({
      type: 'updateAgent',
      id: agent.id,
      patch: { budget: Number(budget), perPurchase: Number(perPurchase) },
    })
    setSaved(true)
  }

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-5">
      <Field label="Monthly budget" hint="The most it can spend in any 30 days.">
        {(fieldId) => <MoneyInput id={fieldId} value={budget} onChange={setBudget} />}
      </Field>
      <Field label="Limit per purchase" hint="Anything above this is declined.">
        {(fieldId) => (
          <MoneyInput id={fieldId} value={perPurchase} onChange={setPerPurchase} max={budget} />
        )}
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit" size="sm" disabled={!changed}>
          Save limits
        </Button>
        <p role="status" className="flex items-center gap-1.5 text-sm text-muted">
          {saved && !changed && (
            <>
              <Icon icon={Check} size={15} /> Saved
            </>
          )}
        </p>
      </div>
    </form>
  )
}

export default function AgentDetail() {
  const { agentId } = useParams()
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const agent = state.agents.find((candidate) => candidate.id === agentId)
  if (!agent) return <Navigate to="/app/agents" replace />

  const purchases = state.purchases.filter((purchase) => purchase.agentId === agent.id)
  const spent = spentBy(state.purchases, agent.id)
  const declined = purchases.filter((purchase) => purchase.status === 'declined').length
  const paused = agent.status === 'paused'

  return (
    <div className="space-y-8">
      <Link
        to="/app/agents"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-charcoal"
      >
        <Icon icon={ArrowLeft} size={16} /> All agents
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl tracking-[-0.03em]">{agent.name}</h1>
              <StatusPill status={agent.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {agent.kind} agent · connected {formatDate(agent.connectedAt)}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          leadingIcon={paused ? Play : Pause}
          onClick={() =>
            dispatch({ type: 'updateAgent', id: agent.id, patch: { status: paused ? 'active' : 'paused' } })
          }
        >
          {paused ? 'Resume agent' : 'Pause agent'}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Budget this period">
            <Meter spent={spent} budget={agent.budget} />
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-taupe/30 pt-5">
              <div>
                <dt className="text-sm text-muted">Left to spend</dt>
                <dd className="mt-1 text-xl tabular-nums">{money(Math.max(agent.budget - spent, 0))}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Purchases</dt>
                <dd className="mt-1 text-xl tabular-nums">{purchases.length - declined}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Declined</dt>
                <dd className="mt-1 text-xl tabular-nums">{declined}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="What it bought" flush>
            {purchases.length === 0 ? (
              <EmptyState icon={Receipt} title="Nothing bought yet">
                {paused
                  ? 'This agent is paused. Resume it to let it spend again.'
                  : 'Purchases appear here the moment this agent makes one.'}
              </EmptyState>
            ) : (
              <PurchaseList purchases={purchases.slice(0, 25)} agents={state.agents} showAgent={false} />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Limits">
            {/* Remount when the agent changes so the fields pick up its values. */}
            <BudgetForm key={agent.id} agent={agent} />
          </Panel>

          <Panel title="Disconnect">
            <p className="text-sm leading-relaxed text-muted">
              The agent loses the ability to spend straight away. Its past purchases stay in your
              activity.
            </p>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={Unplug}
              onClick={() => setConfirming(true)}
              className="mt-5"
            >
              Disconnect agent
            </Button>
          </Panel>
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Disconnect ${agent.name}?`}
        description="It will no longer be able to spend from your balance. You can connect it again later with a new code."
      >
        <div className="flex justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
            Keep connected
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              dispatch({ type: 'removeAgent', id: agent.id })
              navigate('/app/agents')
            }}
          >
            Disconnect
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
