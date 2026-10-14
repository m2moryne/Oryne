import { Keypair } from '@stellar/stellar-sdk/base'
import { Bot, Plus, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CodeBlock } from '../../app/dev/devUi'
import { Dialog, EmptyState, Field, inputClasses, Meter, Panel, StatusPill } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { shortKey } from '../../lib/network'
import { api, API_URL, type Intent } from '../api'
import { useLive } from '../LiveContext'
import { ErrorNote, TxLink, useAction, usd } from '../shared'

const kinds = ['Research', 'Shopping', 'Travel', 'Operations', 'Other']

/**
 * Connecting an agent: its key is generated here, in the browser. The public
 * key goes on-chain with the mandate (signed by Freighter); the secret is
 * shown once, for the owner to give to the agent, and never sent anywhere.
 */
function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useLive()
  const action = useAction()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('Research')
  const [perTx, setPerTx] = useState('1')
  const [budget, setBudget] = useState('20')
  const [windowDays, setWindowDays] = useState('30')
  const [result, setResult] = useState<{ secret: string; publicKey: string; hash: string } | null>(null)

  const close = () => {
    onClose()
    setResult(null)
    setName('')
    action.setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const keypair = Keypair.random()
    void action.run(async () => {
      const hash = await live.sign((token) =>
        api<Intent>(`/v1/wallets/${live.wallet!.id}/agents`, {
          body: { publicKey: keypair.publicKey(), name, kind, perTx, budget, windowDays: Number(windowDays) },
          token,
        }),
      )
      setResult({ secret: keypair.secret(), publicKey: keypair.publicKey(), hash })
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={result ? 'Agent connected' : 'Connect an agent'}
      description={
        result ? undefined : 'Give it a mandate. Freighter signs it onto your wallet; the contract enforces it.'
      }
    >
      {!result ? (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Name">
            {(id) => (
              <input id={id} required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Research assistant" className={inputClasses} />
            )}
          </Field>
          <Field label="What it does">
            {(id) => (
              <select id={id} value={kind} onChange={(event) => setKind(event.target.value)} className={inputClasses}>
                {kinds.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Per payment">
              {(id) => <input id={id} required inputMode="decimal" value={perTx} onChange={(event) => setPerTx(event.target.value)} className={inputClasses} />}
            </Field>
            <Field label="Budget">
              {(id) => <input id={id} required inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} className={inputClasses} />}
            </Field>
            <Field label="Every (days)">
              {(id) => <input id={id} required inputMode="numeric" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} className={inputClasses} />}
            </Field>
          </div>
          <p className="text-xs text-muted">Amounts in USDC.</p>
          <ErrorNote error={action.error} />
          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={action.busy}>
              {action.busy ? 'Waiting for Freighter…' : 'Sign with Freighter'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Registered on your wallet in <TxLink hash={result.hash} />.
          </p>
          <div className="flex gap-3 rounded-lg border border-burgundy/30 px-4 py-3 text-sm">
            <Icon icon={TriangleAlert} size={18} className="mt-0.5 shrink-0 text-burgundy" />
            <p>
              <strong>Copy the agent&rsquo;s secret now.</strong> It was made in your browser and is
              shown only once. Anyone with it can spend inside this agent&rsquo;s limits, and no more.
            </p>
          </div>
          <CodeBlock
            samples={{
              'Claude / MCP': JSON.stringify(
                {
                  mcpServers: {
                    oryne: {
                      command: 'node',
                      args: ['<path to oryne>/packages/mcp/src/server.ts'],
                      env: { ORYNE_AGENT_SECRET: result.secret, ORYNE_API_URL: API_URL },
                    },
                  },
                },
                null,
                2,
              ),
              TypeScript: `import { OryneAgent } from '@oryne/agent'

const agent = new OryneAgent({ secret: '${result.secret}', apiUrl: '${API_URL}' })
const res = await agent.fetch(url) // pays 402s inside the mandate`,
              Secret: result.secret,
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export default function LiveAgents() {
  const live = useLive()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('connect') === '1')
  const agents = live.wallet!.agents

  const openDialog = () => setOpen(true)
  const closeDialog = () => {
    setOpen(false)
    if (params.has('connect')) setParams({}, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl tracking-[-0.02em]">Agents</h1>
        <Button size="sm" leadingIcon={Plus} onClick={openDialog}>
          Connect agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={Bot}
            title="Connect your first agent"
            action={
              <Button size="sm" leadingIcon={Plus} onClick={openDialog}>
                Connect agent
              </Button>
            }
          >
            Give an agent a key and a mandate. It can then pay services that accept x402 on Stellar,
            and nothing beyond its limits.
          </EmptyState>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const remaining = agent.remaining !== undefined ? Number(agent.remaining) : undefined
            const budget = Number(agent.budget)
            return (
              <li key={agent.publicKey}>
                <Link to={`/app/agents/${agent.publicKey}`} className="tone-white block border border-taupe/50 p-5 transition-colors hover:border-charcoal/40 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-lg">{agent.name}</p>
                      <p className="font-mono text-xs text-muted">{shortKey(agent.publicKey, 6, 6)}</p>
                    </div>
                    <StatusPill status={agent.status === 'paused' ? 'paused' : 'active'} />
                  </div>
                  <div className="mt-6">
                    <Meter spent={remaining === undefined ? 0 : Math.max(budget - remaining, 0)} budget={budget} />
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    {usd(agent.perTx)} per payment · {usd(agent.budget)} per {agent.windowDays} days
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <ConnectDialog open={open} onClose={closeDialog} />
    </div>
  )
}
