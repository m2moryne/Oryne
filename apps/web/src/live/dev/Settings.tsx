import { useEffect, useState } from 'react'
import { Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { api, isAccount } from '../api'
import { useLive } from '../LiveContext'
import { Value } from './shared'

const providerLabel: Record<string, string> = { google: 'Google', github: 'GitHub', freighter: 'Freighter', dev: 'Test user' }

/** The signed-in account and its sessions. */
export default function Settings() {
  const live = useLive()
  const token = live.session?.token
  const [active, setActive] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api<{ active: number }>('/v1/sessions', { token })
      .then((data) => setActive(data.active))
      .catch((reason: Error) => setError(reason.message))
  }, [token])

  const signOutEverywhere = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await api('/v1/sessions/revoke', { token, body: {} })
      live.signOut()
    } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }

  const [switching, setSwitching] = useState(false)
  const other = live.kind === 'developer' ? 'owner' : 'developer'
  const switchKind = async () => {
    setSwitching(true)
    setError(null)
    try {
      await live.setKind(other)
      window.location.assign(other === 'developer' ? '/app/developers' : '/app')
    } catch (reason) {
      setError((reason as Error).message)
      setSwitching(false)
    }
  }

  const address = live.session?.address ?? ''
  const provider = live.user?.provider ?? (isAccount(address) ? 'freighter' : address.split(':')[0])

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Settings</h1>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel title="Account">
        <dl className="grid gap-5 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted">Signed in with</dt>
            <dd className="mt-1">{providerLabel[provider] ?? provider}</dd>
          </div>
          {live.user?.email && (
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="mt-1">{live.user.email}</dd>
            </div>
          )}
          {live.user?.name && (
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="mt-1">{live.user.name}</dd>
            </div>
          )}
          <div className="min-w-0 md:col-span-2">
            <Value label="Account ID" value={address} />
          </div>
        </dl>
      </Panel>

      {!live.member && live.kind && (
        <Panel title="Account type">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted">
              {live.kind === 'developer'
                ? 'Developer: the console with API keys, SDKs, logs and webhooks. If you only want to give your agents a wallet, the agent dashboard is simpler.'
                : 'Agent wallet: set your agents’ limits, approve payments and see what they spend. Building agents or a paid API? Switch to a developer account for API keys, SDKs and logs.'}
            </p>
            <Button variant="outline" size="sm" onClick={switchKind} disabled={switching}>
              {switching ? 'Switching…' : other === 'developer' ? 'Switch to developer' : 'Switch to agent dashboard'}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title="Sessions">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            {active === null ? '—' : `${active} active ${active === 1 ? 'session' : 'sessions'}`}
          </p>
          <Button variant="outline" size="sm" onClick={signOutEverywhere} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        </div>
      </Panel>
    </div>
  )
}
