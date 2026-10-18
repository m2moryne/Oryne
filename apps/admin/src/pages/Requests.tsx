import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { cell, EmptyState, Filter, Id, Notice, PageHeader, Panel, StatusText, Table, useAdminData } from '../components/ui'
import { short, when } from '../lib/format'

type Request = {
  id: string
  owner: string
  actorKind: 'owner' | 'agent' | 'key'
  method: string
  path: string
  status: number
  latencyMs: number
  error: string | null
  createdAt: number
}

const by = { owner: 'Dashboard', agent: 'Agent', key: 'API key' }

export default function Requests() {
  const [filter, setFilter] = useState<'all' | 'error'>('all')
  const { data, error } = useAdminData<{ requests: Request[] }>(`/requests?limit=200${filter === 'error' ? '&status=error' : ''}`)

  return (
    <>
      <PageHeader title="Requests" note="Authenticated API calls from every account. Kept for 30 days.">
        <Filter
          value={filter}
          onChange={setFilter}
          options={[
            ['all', 'All'],
            ['error', 'Errors'],
          ]}
        />
      </PageHeader>
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.requests.length === 0 ? (
          <EmptyState icon={ScrollText} title={filter === 'error' ? 'No failed requests' : 'No requests yet'} />
        ) : (
          <Table columns={['Request', 'Status', 'By', 'Error', 'Account', { label: 'Time', right: true }, { label: 'When', right: true }]} minWidth="60rem">
            {data?.requests.map((row) => (
              <tr key={row.id}>
                <td className={`${cell} max-w-72 truncate`}>
                  <span className="font-mono text-xs text-muted">{row.method}</span> {row.path.replace(/C[A-Z2-7]{55}/g, (id) => short(id))}
                  <span className="block">
                    <Id value={row.id} full />
                  </span>
                </td>
                <td className={cell}>
                  <StatusText status={row.status} />
                </td>
                <td className={cell}>{by[row.actorKind]}</td>
                <td className={`${cell} max-w-56 truncate text-muted`}>{row.error ?? '—'}</td>
                <td className={`${cell} font-mono text-xs`}>{short(row.owner, 6, 4)}</td>
                <td className={`${cell} text-right tabular-nums text-muted`}>{row.latencyMs} ms</td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(row.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
