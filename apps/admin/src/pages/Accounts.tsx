import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cell, EmptyState, Id, Notice, PageHeader, Panel, Table, useAdminData } from '../components/ui'
import { when } from '../lib/format'

type Account = {
  subject: string
  provider: string
  email: string | null
  name: string | null
  wallets: number
  apiKeys: number
  firstSeen: number
  lastSeen: number | null
}

const providerLabel: Record<string, string> = { google: 'Google', github: 'GitHub', freighter: 'Freighter', dev: 'Test user' }

export default function Accounts() {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])
  const { data, error } = useAdminData<{ accounts: Account[] }>(`/accounts?limit=200&q=${encodeURIComponent(search)}`)

  return (
    <>
      <PageHeader title="Accounts" note="Everyone who signed in with Google or GitHub, and Freighter owners.">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search email, name or address"
          aria-label="Search accounts"
          className="h-9 w-72 max-w-full rounded-full border border-line bg-bg px-4 text-sm outline-none focus:border-text"
        />
      </PageHeader>
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.accounts.length === 0 ? (
          <EmptyState icon={Users} title={search ? 'No matching accounts' : 'No accounts yet'} />
        ) : (
          <Table columns={['Account', 'Sign-in', 'Wallets', 'API keys', 'First seen', { label: 'Last active', right: true }]}>
            {data?.accounts.map((account) => (
              <tr key={account.subject}>
                <td className={cell}>
                  <p>{account.email ?? account.name ?? (account.provider === 'freighter' ? 'Stellar account' : 'Test account')}</p>
                  <Id value={account.subject} />
                </td>
                <td className={cell}>{providerLabel[account.provider] ?? account.provider}</td>
                <td className={`${cell} tabular-nums`}>{account.wallets}</td>
                <td className={`${cell} tabular-nums`}>{account.apiKeys}</td>
                <td className={`${cell} whitespace-nowrap text-muted`}>{when(account.firstSeen)}</td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(account.lastSeen)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
