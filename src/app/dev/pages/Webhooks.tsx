import { Plus, RotateCw, Webhook } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatDateTime } from '../../format'
import { id } from '../../seed'
import { useStore } from '../../store'
import { Dialog, EmptyState, Field, Panel, StatusPill, inputClasses } from '../../ui'
import { eventTypes, mockDeliveries, randomToken, snippets, type Delivery } from '../devData'
import { CodeBlock, Mono, StatusCode } from '../devUi'

function AddEndpointDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState(['payment.settled', 'payment.declined'])

  const close = () => {
    onClose()
    setUrl('')
    setEvents(['payment.settled', 'payment.declined'])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({
      type: 'addWebhook',
      webhook: {
        id: id('wh'),
        url: url.trim(),
        mode: state.dev.mode,
        events,
        enabled: true,
        secretLast4: randomToken(4),
        createdAt: new Date().toISOString(),
      },
    })
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add an endpoint"
      description={`Oryne will POST the events you choose to this URL, in ${state.dev.mode} mode.`}
    >
      <form onSubmit={submit} className="space-y-6">
        <Field label="Endpoint URL" hint="Must be HTTPS.">
          {(fieldId) => (
            <input
              id={fieldId}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/webhooks/oryne"
              pattern="https://.*"
              required
              autoFocus
              className={`${inputClasses} font-mono text-sm`}
            />
          )}
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Events to send</legend>
          <ul className="mt-2 grid border border-taupe/60 sm:grid-cols-2">
            {eventTypes.map((entry) => (
              <li key={entry.type}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={events.includes(entry.type)}
                    onChange={() =>
                      setEvents((current) =>
                        current.includes(entry.type)
                          ? current.filter((type) => type !== entry.type)
                          : [...current, entry.type],
                      )
                    }
                    className="size-4 accent-charcoal"
                  />
                  <code className="font-mono text-[0.8125rem]">{entry.type}</code>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="flex justify-between gap-3">
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={events.length === 0}>
            Add endpoint
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Webhooks() {
  const { state, dispatch } = useStore()
  const [adding, setAdding] = useState(false)
  const [resent, setResent] = useState<Delivery[]>([])

  const { mode } = state.dev
  const endpoints = state.dev.webhooks.filter((webhook) => webhook.mode === mode)
  const deliveries = [...resent, ...mockDeliveries()].filter((delivery) => delivery.mode === mode)

  const resend = (delivery: Delivery) =>
    setResent((current) => [
      { ...delivery, id: id('evt'), status: 200, attempts: delivery.attempts + 1, at: new Date().toISOString() },
      ...current,
    ])

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Webhooks</h1>

      <Panel
        title="Endpoints"
        flush
        action={
          <Button size="sm" leadingIcon={Plus} onClick={() => setAdding(true)}>
            Add endpoint
          </Button>
        }
      >
        {endpoints.length === 0 ? (
          <EmptyState icon={Webhook} title={`No ${mode} endpoints`}>
            Add an endpoint to be told the moment an agent pays, is declined, or runs out of budget.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-taupe/30">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 md:px-6">
                <div className="min-w-0 flex-1 basis-80">
                  <p className="truncate">
                    <Mono>{endpoint.url}</Mono>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {endpoint.events.length} events · signing secret{' '}
                    <Mono>{`whsec_••••${endpoint.secretLast4}`}</Mono>
                  </p>
                </div>
                <StatusPill status={endpoint.enabled ? 'active' : 'paused'} />
                <div className="flex gap-5 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'updateWebhook', id: endpoint.id, patch: { enabled: !endpoint.enabled } })
                    }
                    className="underline-offset-4 hover:underline"
                  >
                    {endpoint.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removeWebhook', id: endpoint.id })}
                    className="text-burgundy underline-offset-4 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Recent deliveries" flush className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-6 py-3 font-medium">Event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Response</th>
                  <th scope="col" className="px-4 py-3 font-medium">Attempts</th>
                  <th scope="col" className="px-4 py-3 font-medium">Sent</th>
                  <th scope="col" className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {deliveries.slice(0, 12).map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-6 py-3.5">
                      <Mono>{delivery.event}</Mono>
                      <p className="mt-0.5 font-mono text-xs text-muted">{delivery.id}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusCode status={delivery.status} />
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-muted">{delivery.attempts}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-muted">{formatDateTime(delivery.at)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => resend(delivery)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                      >
                        <Icon icon={RotateCw} size={14} /> Resend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Event types" flush>
          <ul className="divide-y divide-taupe/30">
            {eventTypes.map((entry) => (
              <li key={entry.type} className="px-5 py-3 md:px-6">
                <Mono>{entry.type}</Mono>
                <p className="mt-0.5 text-sm text-muted">{entry.note}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Verify that an event came from Oryne">
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted">
          Every delivery is signed with your endpoint&rsquo;s signing secret. Check the signature
          before trusting the payload, and reply with a 2xx within 10 seconds. Failed deliveries are
          retried with backoff for up to three days.
        </p>
        <CodeBlock samples={snippets.verifyWebhook} />
      </Panel>

      <AddEndpointDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
