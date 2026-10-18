import { ScrollText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cell, EmptyState, Notice, PageHeader, Panel, Stat, StatusText, Table, useAdminData } from '../components/ui'
import { count, short, usdc, when } from '../lib/format'

type Overview = {
  accounts: number
  wallets: number
  agents: number
  payments: { settled: number; refused: number; failed: number; volume: string }
  approvalsPending: number
  apiKeysActive: number
  requests24h: number
  errors24h: number
  newAccounts24h: number
}
type Failure = { id: string; owner: string; method: string; path: string; status: number; error: string | null; createdAt: number }

export default function Overview() {
  const { data, error } = useAdminData<Overview>('/overview')
  const failures = useAdminData<{ requests: Failure[] }>('/requests?status=error&limit=8')

  const refusalRate = data
    ? Math.round((data.payments.refused / Math.max(data.payments.settled + data.payments.refused, 1)) * 100)
    : 0

  return (
    <>
      <PageHeader title="Overview" note="Across every account on this API." />
      {error && <Notice>{error}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Accounts" value={data ? count(data.accounts) : '—'} note={data && `${count(data.newAccounts24h)} new in 24 h`} />
        <Stat label="Wallets" value={data ? count(data.wallets) : '—'} note={data && `${count(data.agents)} active agents`} />
        <Stat label="Volume settled" value={data ? usdc(data.payments.volume) : '—'} note={data && `${count(data.payments.settled)} payments`} />
        <Stat
          label="Refused"
          value={data ? count(data.payments.refused) : '—'}
          note={data && `${refusalRate}% of attempts · ${count(data.payments.failed)} failed`}
        />
        <Stat label="Requests, 24 h" value={data ? count(data.requests24h) : '—'} note={data && `${count(data.errors24h)} errors`} />
        <Stat label="Approvals waiting" value={data ? count(data.approvalsPending) : '—'} />
        <Stat label="Active API keys" value={data ? count(data.apiKeysActive) : '—'} />
      </div>

      <Panel
        title="Latest failed requests"
        flush
        action={
          <Link to="/requests" className="text-xs text-muted underline-offset-4 hover:text-text hover:underline">
            All requests
          </Link>
        }
      >
        {failures.data?.requests.length === 0 ? (
          <EmptyState icon={ScrollText} title="No failed requests" />
        ) : (
          <Table columns={['Request', 'Status', 'Error', 'Account', { label: 'When', right: true }]}>
            {failures.data?.requests.map((row) => (
              <tr key={row.id}>
                <td className={`${cell} max-w-72 truncate`}>
                  <span className="font-mono text-xs text-muted">{row.method}</span> {row.path.replace(/C[A-Z2-7]{55}/g, (id) => short(id))}
                </td>
                <td className={cell}>
                  <StatusText status={row.status} />
                </td>
                <td className={`${cell} max-w-72 truncate text-muted`}>{row.error ?? '—'}</td>
                <td className={`${cell} font-mono text-xs`}>{short(row.owner, 6, 4)}</td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(row.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
