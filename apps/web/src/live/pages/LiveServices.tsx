import { Check, ExternalLink, Pencil, Plus, Search, Store, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CopyButton } from '../../app/dev/devUi'
import { Dialog, EmptyState, Field, inputClasses, Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { shortKey } from '../../lib/network'
import { api, type Intent, type LiveAgent, type ServiceListing } from '../api'
import { useLive } from '../LiveContext'
import { ErrorNote, useAction, when } from '../shared'
import { Loader } from '../../components/Loader'

const defaultCategories = ['Search', 'Data', 'AI models', 'Media', 'Finance', 'Developer tools', 'Other']

/** Whether an agent may pay a service, and if not, why not. */
function access(agent: LiveAgent, service: ServiceListing): { ok: boolean; note: string } {
  if (agent.status !== 'active') return { ok: false, note: 'Paused' }
  if (Number(service.price) > Number(agent.perTx)) return { ok: false, note: `Price is over its ${agent.perTx} USDC per-payment limit` }
  if (agent.payees.length === 0) return { ok: true, note: 'Can pay any service' }
  if (agent.payees.includes(service.payTo)) return { ok: true, note: 'Allowed' }
  return { ok: false, note: 'Not on its payee list' }
}

/**
 * The service directory: paid APIs agents can use, what each costs, and which
 * of your agents may pay it. Owners who sell an API list it here too.
 */
export default function LiveServices() {
  const live = useLive()
  const token = live.session?.token
  const [services, setServices] = useState<ServiceListing[] | null>(null)
  const [mine, setMine] = useState<ServiceListing[]>([])
  const [categories, setCategories] = useState(defaultCategories)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [allowing, setAllowing] = useState<ServiceListing | null>(null)
  const [editing, setEditing] = useState<ServiceListing | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [all, own] = await Promise.all([
        api<{ services: ServiceListing[]; categories: string[] }>('/v1/services'),
        token ? api<{ services: ServiceListing[] }>('/v1/services/mine', { token }) : Promise.resolve({ services: [] }),
      ])
      setServices(all.services)
      setCategories(all.categories)
      setMine(own.services)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
      setServices((current) => current ?? [])
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (services ?? []).filter(
      (service) =>
        (!category || service.category === category) &&
        words.every((word) => `${service.name} ${service.description} ${service.category} ${service.url}`.toLowerCase().includes(word)),
    )
  }, [services, query, category])

  const agents = (live.wallet?.agents ?? []).filter((agent) => agent.status !== 'removed')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-[-0.02em]">Services</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Paid APIs your agents can use, charged per request in USDC. Choose which ones each agent may pay.
          </p>
        </div>
        <Button size="sm" variant="outline" leadingIcon={Plus} onClick={() => setEditing('new')}>
          List your service
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search services</span>
          <Icon icon={Search} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, use or URL"
            className={`${inputClasses} py-2 pl-10`}
          />
        </label>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {['', ...categories].map((option) => (
            <button
              key={option || 'all'}
              type="button"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                category === option ? 'border-charcoal bg-charcoal text-cream' : 'border-taupe/60 text-muted hover:border-charcoal hover:text-charcoal',
              )}
            >
              {option || 'All'}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote error={error} />

      {services === null ? (
        <Loader />
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Store}
            title={services.length === 0 ? 'No services listed yet' : 'Nothing matches'}
            action={
              services.length === 0 ? (
                <Button size="sm" leadingIcon={Plus} onClick={() => setEditing('new')}>
                  List your service
                </Button>
              ) : undefined
            }
          >
            {services.length === 0
              ? 'Selling an API? List it here so people can point their agents at it. Your agents can still pay any service that accepts x402 on Stellar.'
              : 'Try another word or category.'}
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((service) => {
            const allowed = agents.filter((agent) => access(agent, service).ok).length
            return (
              <article key={service.id} className="tone-white flex flex-col border border-taupe/50 p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg tracking-[-0.01em]">{service.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">{service.category}</p>
                  </div>
                  <p className="shrink-0 text-right tabular-nums">
                    {service.price} USDC
                    <span className="block text-xs text-muted">per {service.unit}</span>
                  </p>
                </div>
                {service.description && <p className="mt-3 text-sm leading-relaxed text-muted">{service.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-2 border border-taupe/40 bg-code px-3 py-2">
                  <span className="truncate font-mono text-xs">{service.url}</span>
                  <CopyButton value={service.url} className="shrink-0 text-muted hover:text-charcoal" />
                </div>
                <p className="mt-3 text-xs text-muted">
                  {service.paidCalls > 0
                    ? `Paid ${service.paidCalls} ${service.paidCalls === 1 ? 'time' : 'times'} through Oryne, last ${when(service.lastPaidAt!)}`
                    : 'No payments through Oryne yet'}
                  {' · '}pays to <span className="font-mono">{shortKey(service.payTo, 4, 4)}</span>
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  <span className="text-sm text-muted">
                    {agents.length === 0 ? 'No agents yet' : `${allowed} of ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'} can pay it`}
                  </span>
                  {agents.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setAllowing(service)}>
                      Agents
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {mine.length > 0 && (
        <Panel title="Your listings" flush>
          <ul>
            {mine.map((service) => (
              <MyListing key={service.id} service={service} onEdit={() => setEditing(service)} onRemoved={load} />
            ))}
          </ul>
        </Panel>
      )}

      <AllowDialog service={allowing} onClose={() => setAllowing(null)} />
      <ListingDialog
        listing={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await load()
        }}
      />
    </div>
  )
}

function MyListing({ service, onEdit, onRemoved }: { service: ServiceListing; onEdit: () => void; onRemoved: () => Promise<void> }) {
  const live = useLive()
  const remove = useAction()
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-taupe/40 px-5 py-4 first:border-t-0 md:px-6">
      <div className="min-w-0">
        <p className="font-medium">{service.name}</p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {service.price} USDC per {service.unit} · {service.paidCalls} paid {service.paidCalls === 1 ? 'call' : 'calls'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-muted">Remove from the directory?</span>
            <Button
              size="sm"
              variant="outline"
              disabled={remove.busy}
              onClick={() =>
                remove.run(async () => {
                  await api(`/v1/services/${service.id}`, { method: 'DELETE', token: live.session!.token })
                  await onRemoved()
                })
              }
            >
              {remove.busy ? 'Removing…' : 'Remove'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" leadingIcon={Pencil} onClick={onEdit}>
              Edit
            </Button>
            <button type="button" onClick={() => setConfirming(true)} className="p-2 text-muted hover:text-burgundy" aria-label={`Remove ${service.name}`}>
              <Icon icon={Trash2} size={16} />
            </button>
          </>
        )}
      </div>
      <div className="w-full">
        <ErrorNote error={remove.error} />
      </div>
    </li>
  )
}

/** Which agents may pay a service; adds it to an agent's payee list with the owner's signature. */
function AllowDialog({ service, onClose }: { service: ServiceListing | null; onClose: () => void }) {
  const live = useLive()
  const action = useAction()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const agents = (live.wallet?.agents ?? []).filter((agent) => agent.status !== 'removed')

  const allow = (agent: LiveAgent) => {
    if (!service) return
    setBusyKey(agent.publicKey)
    void action
      .run(() =>
        live.sign((token) =>
          api<Intent>(`/v1/wallets/${agent.wallet}/agents/${agent.publicKey}`, {
            method: 'PATCH',
            body: { payees: [...agent.payees, service.payTo] },
            token,
          }),
        ),
      )
      .finally(() => setBusyKey(null))
  }

  return (
    <Dialog
      open={!!service}
      onClose={() => {
        action.setError(null)
        onClose()
      }}
      title={service ? `Agents and ${service.name}` : ''}
      description="An agent can pay a service when the price is within its per-payment limit and the service is on its payee list, or it has no list."
    >
      {service && (
        <ul className="mt-6 divide-y divide-taupe/40 border-y border-taupe/40">
          {agents.map((agent) => {
            const state = access(agent, service)
            const canAdd = !state.ok && agent.status === 'active' && agent.payees.length > 0 && !agent.payees.includes(service.payTo) && Number(service.price) <= Number(agent.perTx)
            return (
              <li key={agent.publicKey} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium">{agent.name}</p>
                  <p className={cn('mt-0.5 text-sm', state.ok ? 'text-muted' : 'text-burgundy')}>
                    {state.ok && <Icon icon={Check} size={13} className="mr-1 inline" />}
                    {state.note}
                  </p>
                </div>
                {canAdd && (
                  <Button size="sm" variant="outline" disabled={action.busy} onClick={() => allow(agent)}>
                    {busyKey === agent.publicKey ? 'Waiting for your signature…' : 'Allow'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ErrorNote error={action.error} />
      {action.done && <p className="mt-4 text-sm text-muted">Allowed. The wallet now lets that agent pay this service.</p>}
      <p className="mt-5 text-xs leading-relaxed text-muted">
        To raise a per-payment limit, open the agent under Agents. Changes are signed by you and enforced by your wallet’s
        contract.
      </p>
    </Dialog>
  )
}

function ListingDialog({
  listing,
  categories,
  onClose,
  onSaved,
}: {
  listing: ServiceListing | 'new' | null
  categories: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const live = useLive()
  const save = useAction()
  const existing = listing && listing !== 'new' ? listing : null
  const [form, setForm] = useState({ name: '', url: '', category: 'Other', price: '', unit: 'call', payTo: '', description: '' })

  useEffect(() => {
    if (!listing) return
    save.setError(null)
    setForm(
      existing
        ? { name: existing.name, url: existing.url, category: existing.category, price: existing.price, unit: existing.unit, payTo: existing.payTo, description: existing.description }
        : { name: '', url: '', category: 'Other', price: '', unit: 'call', payTo: live.wallet?.id ?? '', description: '' },
    )
    // Reset only when the dialog opens for a listing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing])

  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save.run(async () => {
      await api(existing ? `/v1/services/${existing.id}` : '/v1/services', {
        method: existing ? 'PATCH' : 'POST',
        body: form,
        token: live.session!.token,
      })
      await onSaved()
    })
  }

  return (
    <Dialog
      open={!!listing}
      onClose={onClose}
      title={existing ? 'Edit listing' : 'List your service'}
      description="Charge agents per request with @oryne/merchant, then list the endpoint here so people can find it."
    >
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Name">{(id) => <input id={id} required maxLength={80} value={form.name} onChange={set('name')} className={`${inputClasses} py-2`} />}</Field>
        <Field label="Endpoint URL" hint="The paid URL agents call. It answers 402 Payment Required until paid.">
          {(id) => (
            <input id={id} required type="url" placeholder="https://api.example.com/search" value={form.url} onChange={set('url')} className={`${inputClasses} py-2 font-mono text-sm`} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price, USDC">
            {(id) => <input id={id} required inputMode="decimal" placeholder="0.01" value={form.price} onChange={set('price')} className={`${inputClasses} py-2`} />}
          </Field>
          <Field label="Per">
            {(id) => <input id={id} required maxLength={20} value={form.unit} onChange={set('unit')} className={`${inputClasses} py-2`} />}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} value={form.category} onChange={set('category')} className={`${inputClasses} py-2`}>
                {categories.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Paid to" hint="The Stellar address in your paywall's payTo. Your Oryne wallet works and needs no trustline.">
          {(id) => <input id={id} required value={form.payTo} onChange={set('payTo')} placeholder="G… or C…" className={`${inputClasses} py-2 font-mono text-xs`} />}
        </Field>
        <Field label="What it does">
          {(id) => (
            <textarea id={id} rows={3} maxLength={300} value={form.description} onChange={set('description')} className={`${inputClasses} py-2`} />
          )}
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex items-center justify-between gap-3 pt-2">
          <a href="/docs#merchant" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted underline underline-offset-4">
            How to charge agents <Icon icon={ExternalLink} size={13} />
          </a>
          <Button type="submit" size="sm" disabled={save.busy}>
            {save.busy ? 'Saving…' : existing ? 'Save' : 'List it'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
