import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/Button'
import { useDashboard } from '../../DashboardLayout'
import { formatDate, timeAgo } from '../../format'
import { useStore } from '../../store'
import { Dialog, EmptyState, Panel } from '../../ui'
import { maskKey, scopes, type ApiKey } from '../devData'
import { Mono } from '../devUi'

export default function Keys() {
  const { state, dispatch } = useStore()
  const { openCreateKey } = useDashboard()
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  const { mode } = state.dev
  const keys = state.dev.keys.filter((key) => key.mode === mode)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">API keys</h1>

      <Panel
        title={`${mode === 'live' ? 'Live' : 'Test'} keys`}
        flush
        action={
          <Button size="sm" leadingIcon={Plus} onClick={openCreateKey}>
            Create key
          </Button>
        }
      >
        {keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title={`No ${mode} keys`}
            action={
              <Button size="sm" leadingIcon={Plus} onClick={openCreateKey}>
                Create key
              </Button>
            }
          >
            Create a key to authenticate requests in {mode} mode.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="type-label border-b border-taupe/40 text-muted">
                  <th scope="col" className="px-6 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Key</th>
                  <th scope="col" className="px-4 py-3 font-medium">Permissions</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last used</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-taupe/30">
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td className="px-6 py-4 font-medium">{key.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Mono>{maskKey(key)}</Mono>
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {key.scopes.length === scopes.length
                        ? 'Full access'
                        : `${key.scopes.length} of ${scopes.length} scopes`}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-muted">
                      {key.lastUsedAt ? timeAgo(key.lastUsedAt) : 'Never'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-muted">{formatDate(key.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setRevoking(key)}
                        className="text-sm font-medium text-burgundy underline-offset-4 hover:underline"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Keeping keys safe">
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>Secret keys belong on your server. Never ship one in a browser or mobile app.</li>
            <li>The full secret is shown once, when the key is created. After that only the last four characters are kept.</li>
            <li>Give each service its own key with the narrowest permissions it needs, so one can be revoked without touching the rest.</li>
            <li>Test keys can only move sandbox funds. Live keys spend real balance.</li>
          </ul>
        </Panel>

        <Panel title="Permissions" flush>
          <ul className="divide-y divide-taupe/30">
            {scopes.map((scope) => (
              <li key={scope.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3 md:px-6">
                <span className="w-36 shrink-0">
                  <Mono>{scope.id}</Mono>
                </span>
                <span className="text-sm text-muted">{scope.note}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name ?? 'key'}?`}
        description="Requests made with this key will start failing with 401 straight away. This cannot be undone."
      >
        <div className="flex justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => setRevoking(null)}>
            Keep key
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              if (revoking) dispatch({ type: 'revokeKey', id: revoking.id })
              setRevoking(null)
            }}
          >
            Revoke key
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
