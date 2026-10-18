import { Plus, TriangleAlert, Webhook } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CopyButton } from '../../app/dev/devUi'
import { Dialog, EmptyState, Field, inputClasses, Panel, Toggle } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { api } from '../api'
import { useLive } from '../LiveContext'
import { when } from '../shared'

type Endpoint = { id: string; url: string; events: string[]; createdAt: number }
type Delivery = {
  id: string
  url: string
  event: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  responseStatus: number | null
  error: string | null
  createdAt: number
  nextAttemptAt: number | null
}

const eventLabels: Record<string, string> = {
  'payment.settled': 'Payment settled',
  'payment.refused': 'Payment refused',
  'approval.requested': 'Approval requested',
  'approval.approved': 'Approval approved',
  'approval.declined': 'Approval declined',
}

/** Real webhooks: the owner's endpoints and what was sent to them. */
export default function Webhooks() {
  const live = useLive()
  const token = live.session?.token
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [events, setEvents] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const data = await api<{ events: string[]; endpoints: Endpoint[]; deliveries: Delivery[] }>('/v1/webhooks', { token })
      setEvents(data.events)
      setEndpoints(data.endpoints)
      setDeliveries(data.deliveries)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const act = (id: string, path: string) => async () => {
    if (!token) return
    setBusy(id)
    setError(null)
    try {
      await api(path, { token, body: {} })
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl tracking-[-0.02em]">Webhooks</h1>
        <Button size="sm" leadingIcon={Plus} onClick={() => setAdding(true)}>
          Add endpoint
        </Button>
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel title="Endpoints" flush>
        {endpoints.length === 0 ? (
          <EmptyState icon={Webhook} title="No endpoints yet" />
        ) : (
          <ul className="divide-y divide-taupe/30">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 md:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{endpoint.url}</p>
                  <p className="mt-1 text-xs text-muted">{endpoint.events.map((event) => eventLabels[event] ?? event).join(', ')}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    type="button"
                    disabled={busy === endpoint.id}
                    onClick={act(endpoint.id, `/v1/webhooks/${endpoint.id}/test`)}
                    className="underline-offset-4 hover:underline disabled:opacity-45"
                  >
                    {busy === endpoint.id ? 'Sending…' : 'Send test'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === endpoint.id}
                    onClick={act(endpoint.id, `/v1/webhooks/${endpoint.id}/remove`)}
                    className="text-burgundy underline-offset-4 hover:underline disabled:opacity-45"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {deliveries.length > 0 && (
        <Panel title="Deliveries" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-5 py-3 font-medium md:px-6">Event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Endpoint</th>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-5 py-3 md:px-6">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-5 py-3 md:px-6">{eventLabels[delivery.event] ?? delivery.event}</td>
                    <td className="max-w-56 truncate px-4 py-3 font-mono text-xs text-muted">{delivery.url}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn('font-mono text-xs', delivery.status === 'delivered' ? 'text-muted' : 'text-burgundy')}
                        title={delivery.error ?? undefined}
                      >
                        {delivery.status === 'delivered'
                          ? `${delivery.responseStatus ?? 200}`
                          : delivery.status === 'failed'
                            ? `failed · ${delivery.responseStatus ?? 'no answer'}`
                            : delivery.attempts === 0
                              ? 'sending'
                              : `retrying · ${delivery.responseStatus ?? 'no answer'}`}
                      </span>
                      {delivery.attempts > 1 && <span className="ml-2 text-xs text-muted">{delivery.attempts} tries</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{when(delivery.createdAt)}</td>
                    <td className="px-5 py-3 text-right md:px-6">
                      {delivery.status !== 'delivered' && delivery.attempts > 0 && (
                        <button
                          type="button"
                          disabled={busy === delivery.id}
                          onClick={act(delivery.id, `/v1/webhooks/deliveries/${delivery.id}/retry`)}
                          className="text-xs underline-offset-4 hover:underline disabled:opacity-45"
                        >
                          {busy === delivery.id ? 'Retrying…' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <AddEndpoint open={adding} events={events} onClose={() => setAdding(false)} onAdded={load} />
    </div>
  )
}

function AddEndpoint({ open, events, onClose, onAdded }: { open: boolean; events: string[]; onClose: () => void; onAdded: () => void }) {
  const live = useLive()
  const [url, setUrl] = useState('')
  const [chosen, setChosen] = useState<string[]>(['payment.settled', 'payment.refused', 'approval.requested'])
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setUrl('')
    setSecret(null)
    setError(null)
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!live.session) return
    setBusy(true)
    setError(null)
    try {
      const added = await api<{ secret: string }>('/v1/webhooks', { token: live.session.token, body: { url, events: chosen } })
      setSecret(added.secret)
      onAdded()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} title={secret ? 'Signing secret' : 'Add an endpoint'}>
      {secret ? (
        <div className="space-y-4">
          <p className="flex gap-3 border border-burgundy/40 px-4 py-3 text-sm">
            <Icon icon={TriangleAlert} size={18} className="shrink-0 text-burgundy" />
            Copy it now; it won’t be shown again.
          </p>
          <div className="flex items-center gap-2 border border-taupe/60 px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{secret}</code>
            <CopyButton value={secret} className="text-muted hover:text-charcoal" />
          </div>
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="URL">
            {(id) => (
              <input
                id={id}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhooks/oryne"
                required
                className={inputClasses}
              />
            )}
          </Field>
          <div className="space-y-3">
            <p className="text-sm font-medium">Events</p>
            {events.map((type) => (
              <Toggle
                key={type}
                label={eventLabels[type] ?? type}
                checked={chosen.includes(type)}
                onChange={(on) => setChosen((current) => (on ? [...current, type] : current.filter((item) => item !== type)))}
              />
            ))}
          </div>
          {error && <p className="text-sm text-burgundy">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !url.trim() || chosen.length === 0}>
            {busy ? 'Adding…' : 'Add endpoint'}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
