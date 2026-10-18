import { KeyRound, Plus, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CopyButton } from '../../app/dev/devUi'
import { Dialog, EmptyState, Field, inputClasses, Panel, Toggle } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { api } from '../api'
import { useLive } from '../LiveContext'
import { when } from '../shared'
import { useDevMode } from './LiveDevShell'

type Scope = 'wallets:read' | 'payments:read' | 'approvals:read' | 'logs:read'
type ApiKey = {
  id: string
  name: string
  mode: 'test' | 'live'
  masked: string
  scopes: Scope[]
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}

const scopeInfo: Record<Scope, { label: string; note: string }> = {
  'wallets:read': { label: 'Wallets and agents', note: 'Balances, agents and their mandates' },
  'payments:read': { label: 'Payments', note: 'Settled and refused payments' },
  'approvals:read': { label: 'Approvals', note: 'Requests waiting for you' },
  'logs:read': { label: 'Logs', note: 'API requests and their results' },
}
const allScopes = Object.keys(scopeInfo) as Scope[]

/** Real API keys: read-only secret keys for the owner's own servers. */
export default function Keys() {
  const live = useLive()
  const mode = useDevMode()
  const token = live.session?.token
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      setKeys((await api<{ keys: ApiKey[] }>('/v1/keys', { token })).keys)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (id: string) => {
    if (!token) return
    setError(null)
    try {
      await api(`/v1/keys/${id}/revoke`, { token, body: {} })
      setRevoking(null)
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  // This server is on testnet, so every key is a test key; live keys come with mainnet.
  const shown = keys.filter((key) => key.mode === mode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl tracking-[-0.02em]">API keys</h1>
        {mode === 'test' && (
          <Button size="sm" leadingIcon={Plus} onClick={() => setCreating(true)}>
            Create key
          </Button>
        )}
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel flush>
        {mode === 'live' ? (
          <EmptyState icon={KeyRound} title="Live keys arrive with mainnet" />
        ) : shown.length === 0 && !loading ? (
          <EmptyState icon={KeyRound} title="No keys yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-5 py-3 font-medium md:px-6">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Key</th>
                  <th scope="col" className="px-4 py-3 font-medium">Permissions</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last used</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {shown.map((key) => (
                  <tr key={key.id} className={cn(key.revokedAt !== null && 'text-muted')}>
                    <td className="px-5 py-3 md:px-6">
                      {key.name}
                      <span className="block text-xs text-muted">Created {when(key.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{key.masked}</td>
                    <td className="px-4 py-3 text-xs">{key.scopes.map((scope) => scopeInfo[scope]?.label ?? scope).join(', ')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{key.lastUsedAt ? when(key.lastUsedAt) : 'Never'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right md:px-6">
                      {key.revokedAt ? (
                        <span className="text-xs">Revoked {when(key.revokedAt)}</span>
                      ) : revoking === key.id ? (
                        <span className="inline-flex items-center gap-3 text-xs">
                          Revoke now?
                          <button type="button" onClick={() => revoke(key.id)} className="font-medium text-burgundy underline underline-offset-4">
                            Revoke
                          </button>
                          <button type="button" onClick={() => setRevoking(null)} className="text-muted underline underline-offset-4">
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setRevoking(key.id)} className="text-xs text-burgundy hover:underline">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CreateKey open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  )
}

function CreateKey({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const live = useLive()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['wallets:read', 'payments:read'])
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setName('')
    setScopes(['wallets:read', 'payments:read'])
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
      const created = await api<{ secret: string }>('/v1/keys', { token: live.session.token, body: { name, scopes } })
      setSecret(created.secret)
      onCreated()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={secret ? 'Your new key' : 'Create an API key'}
      description={secret ? undefined : 'Read-only.'}
    >
      {secret ? (
        <div className="space-y-4">
          <p className="flex gap-3 border border-burgundy/40 px-4 py-3 text-sm">
            <Icon icon={TriangleAlert} size={18} className="shrink-0 text-burgundy" />
            Copy it now. It isn’t stored and won’t be shown again; if you lose it, revoke it and create another.
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
          <Field label="Name" hint="Where it will run, e.g. “Production server”">
            {(id) => (
              <input id={id} value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} className={inputClasses} />
            )}
          </Field>
          <div className="space-y-3">
            <p className="text-sm font-medium">Permissions</p>
            {allScopes.map((scope) => (
              <Toggle
                key={scope}
                label={scopeInfo[scope].label}
                note={scopeInfo[scope].note}
                checked={scopes.includes(scope)}
                onChange={(on) => setScopes((current) => (on ? [...current, scope] : current.filter((item) => item !== scope)))}
              />
            ))}
          </div>
          {error && <p className="text-sm text-burgundy">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !name.trim() || scopes.length === 0}>
            {busy ? 'Creating…' : 'Create key'}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
