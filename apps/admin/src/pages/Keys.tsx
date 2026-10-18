import { KeyRound } from 'lucide-react'
import { cell, EmptyState, Id, Notice, PageHeader, Panel, StatusText, Table, useAdminData } from '../components/ui'
import { when } from '../lib/format'

type ApiKey = {
  id: string
  owner: string
  name: string
  mode: 'test' | 'live'
  masked: string
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}

export default function Keys() {
  const { data, error } = useAdminData<{ keys: ApiKey[] }>('/keys?limit=200')

  return (
    <>
      <PageHeader title="API keys" note="Read-only keys owners created. Only their last four characters are ever stored in the clear." />
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys yet" />
        ) : (
          <Table columns={['Key', 'Permissions', 'Owner', 'Last used', { label: 'Status', right: true }]} minWidth="56rem">
            {data?.keys.map((key) => (
              <tr key={key.id}>
                <td className={cell}>
                  <p>{key.name}</p>
                  <p className="font-mono text-xs text-muted">{key.masked}</p>
                </td>
                <td className={`${cell} text-xs`}>{key.scopes.join(', ')}</td>
                <td className={cell}>
                  <Id value={key.owner} />
                </td>
                <td className={`${cell} whitespace-nowrap text-muted`}>{when(key.lastUsedAt)}</td>
                <td className={`${cell} text-right`}>
                  {key.revokedAt ? <StatusText status="revoked" /> : <span className="font-mono text-xs text-good">active</span>}
                  <p className="text-xs text-muted">Created {when(key.createdAt)}</p>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
