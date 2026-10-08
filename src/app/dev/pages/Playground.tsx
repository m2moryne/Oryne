import { Check, Circle, LoaderCircle, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { cn } from '../../../lib/cn'
import { hexHash, ledgerAt, NETWORK, services, shortKey } from '../../../lib/network'
import { agentKey, baseUnits, contractErrors, walletAddress } from '../../chain'
import { money } from '../../format'
import { id } from '../../seed'
import { declineReason, useStore } from '../../store'
import { Panel, inputClasses } from '../../ui'
import { CodeBlock } from '../devUi'

type Step = { title: string; detail: string; code?: string; failed?: boolean }

const STEP_MS = 850

/**
 * Walks one x402 payment end to end, step by step: request, 402, signature,
 * the wallet contract's check, settlement, and the paid response. The result
 * lands in the agent dashboard like any other payment.
 */
export default function Playground() {
  const { state, dispatch } = useStore()
  const agents = state.agents.filter((agent) => agent.status === 'active')
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [serviceId, setServiceId] = useState(services[0].id)
  const [units, setUnits] = useState('500')
  const [steps, setSteps] = useState<Step[]>([])
  const [shown, setShown] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => () => clearInterval(timer.current), [])

  const service = services.find((item) => item.id === serviceId)!
  const agent = agents.find((item) => item.id === agentId)
  const amount = Math.round(service.price * Number(units) * 100) / 100
  const running = steps.length > 0 && shown < steps.length

  const run = () => {
    if (!agent || amount <= 0) return
    const wallet = walletAddress(state.user)
    const reason = declineReason(state, agent, amount, service.name)
    const payId = id('pay')
    const hash = hexHash(payId)
    const url = `${service.endpoint}/${service.category.toLowerCase()}?units=${units}`

    const plan: Step[] = [
      { title: 'Agent calls the service', detail: 'A normal HTTP request, no account or API key.', code: `GET ${url}` },
      {
        title: 'Service answers 402 Payment Required',
        detail: `It wants ${money(amount)} in USDC, paid to its Stellar address.`,
        code: `402 Payment Required
{ "scheme": "exact", "network": "stellar-testnet", "asset": "USDC",
  "maxAmountRequired": "${amount}", "payTo": "${shortKey(service.payee, 8, 6)}" }`,
      },
      {
        title: 'Agent signs a transfer from your wallet',
        detail: 'The SDK builds the USDC transfer and signs its authorization with the agent’s session key.',
        code: `usdc.transfer(
  from:   ${shortKey(wallet, 8, 6)}   // your agent wallet
  to:     ${shortKey(service.payee, 8, 6)}
  amount: ${baseUnits(amount)}      // 7 decimals
)
signed by ${shortKey(agentKey(agent), 8, 6)} (ed25519)`,
      },
      reason
        ? {
            title: 'Wallet contract refuses it',
            detail: `__check_auth stops the transfer: ${reason.toLowerCase()}. Nothing is submitted, nothing moves.`,
            code: `__check_auth → ${contractErrors[reason] ?? reason}`,
            failed: true,
          }
        : {
            title: 'Wallet contract checks the mandate',
            detail: 'Token, payee, per-payment cap, budget and expiry all pass.',
            code: `__check_auth → Ok
  token ✓  payee ✓  per_tx ${money(agent.perPurchase)} ✓  budget ✓  not paused ✓`,
          },
    ]
    if (!reason) {
      plan.push(
        {
          title: 'Facilitator submits; Stellar settles',
          detail: `Fee of ${NETWORK.feeXlm} XLM sponsored by Oryne. Final in one ledger.`,
          code: `tx ${shortKey(hash, 10, 8)}  ledger #${ledgerAt(Date.now()).toLocaleString('en-US')}  4.8 s`,
        },
        {
          title: 'Service returns the result',
          detail: 'The agent gets its data. The payment shows in the dashboard with its receipt.',
          code: `200 OK
X-Payment-Response: { "success": true, "transaction": "${shortKey(hash, 6, 6)}" }`,
        },
      )
    }

    clearInterval(timer.current)
    setSteps(plan)
    setShown(1)
    let count = 1
    timer.current = setInterval(() => {
      count++
      setShown(count)
      if (count >= plan.length) {
        clearInterval(timer.current)
        dispatch({
          type: 'attemptPurchase',
          purchase: {
            id: payId,
            agentId: agent.id,
            merchant: service.name,
            item: `${service.description.split(/[.,]/)[0]} · ${units} ${service.unit}s`,
            category: service.category,
            amount,
            at: new Date().toISOString(),
          },
        })
      }
    }, STEP_MS)
  }

  const failed = steps.find((step) => step.failed)
  const done = steps.length > 0 && shown >= steps.length

  const askOwner = () => {
    if (!agent) return
    dispatch({
      type: 'requestApproval',
      approval: {
        id: id('apr'),
        agentId: agent.id,
        merchant: service.name,
        item: `${service.description.split(/[.,]/)[0]} · ${units} ${service.unit}s`,
        category: service.category,
        amount,
        why: declineReason(state, agent, amount, service.name) ?? 'Asked from the playground',
        requestedAt: new Date().toISOString(),
      },
    })
    setSteps((current) => [
      ...current,
      {
        title: 'Agent asks the owner instead',
        detail: 'A request appears in Approvals. Approving signs approve_once on the wallet.',
        code: 'request_approval → apr_… (waiting for owner)',
      },
    ])
    setShown((count) => count + 1)
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">x402 playground</h1>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="One payment, step by step">
          <div className="space-y-5">
            <div>
              <label htmlFor="pg-agent" className="text-sm font-medium">Agent</label>
              <select
                id="pg-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className={cn(inputClasses, 'mt-2 py-2')}
              >
                {agents.length === 0 && <option value="">No active agents</option>}
                {agents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {money(item.perPurchase)} per payment
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pg-service" className="text-sm font-medium">Service</label>
              <select
                id="pg-service"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className={cn(inputClasses, 'mt-2 py-2')}
              >
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.price} USDC / {item.unit}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pg-units" className="text-sm font-medium">
                How many {service.unit}s
              </label>
              <input
                id="pg-units"
                type="number"
                min="1"
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                className={cn(inputClasses, 'mt-2 py-2 tabular-nums')}
              />
              <p className="mt-2 text-sm text-muted">
                Total <span className="font-medium text-charcoal tabular-nums">{money(amount)}</span>. Go over
                the agent&rsquo;s per-payment limit to see the contract refuse it.
              </p>
            </div>
            <Button size="sm" leadingIcon={Play} onClick={run} disabled={!agent || running || amount <= 0}>
              {running ? 'Running…' : 'Send request'}
            </Button>
          </div>
        </Panel>

        <Panel title="What happens" className="xl:col-span-2">
          {steps.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Choose an agent and a service, then send a request.
            </p>
          ) : (
            <ol className="space-y-5">
              {steps.map((step, index) => {
                const visible = index < shown
                const current = index === shown - 1 && running
                return (
                  <li
                    key={step.title}
                    className={cn('grid grid-cols-[1.5rem_1fr] gap-4 transition-opacity duration-300', !visible && 'opacity-30')}
                  >
                    <span className="mt-0.5">
                      <Icon
                        icon={!visible ? Circle : current ? LoaderCircle : step.failed ? X : Check}
                        size={18}
                        className={cn(current && 'animate-spin', step.failed && 'text-burgundy')}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className={cn('font-medium', step.failed && 'text-burgundy')}>{step.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
                      {visible && step.code && (
                        <div className="mt-3">
                          <CodeBlock code={step.code} label={`Step ${index + 1}`} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {done && (
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-taupe/40 pt-5">
              {failed && steps.length < 5 && (
                <Button size="sm" variant="outline" onClick={askOwner}>
                  Ask the owner to approve it
                </Button>
              )}
              <Link to={failed ? '/app/approvals' : '/app/activity'} className="text-sm underline underline-offset-4">
                {failed ? 'Open approvals' : 'See it in the agent dashboard'}
              </Link>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
