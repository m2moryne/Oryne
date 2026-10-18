import { Bot } from 'lucide-react'
import { cell, EmptyState, Id, Notice, PageHeader, Panel, StatusText, Table, useAdmin, useAdminData } from '../components/ui'
import { explorer, usdc, when } from '../lib/format'

type Agent = {
  publicKey: string
  name: string
  kind: string
  status: string
  wallet: string
  owner: string
  perTx: string
  budget: string
  windowDays: number
  createdAt: number
}

export default function Agents() {
  const { network } = useAdmin()
  const { data, error } = useAdminData<{ agents: Agent[] }>('/agents?limit=200')

  return (
    <>
      <PageHeader title="Agents" note="Agent keys and the mandates their wallets enforce." />
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.agents.length === 0 ? (
          <EmptyState icon={Bot} title="No agents yet" />
        ) : (
          <Table columns={['Agent', 'Status', 'Per payment', 'Budget', 'Wallet', { label: 'Created', right: true }]}>
            {data?.agents.map((agent) => (
              <tr key={agent.publicKey}>
                <td className={cell}>
                  <p>
                    {agent.name} <span className="text-xs text-muted">· {agent.kind}</span>
                  </p>
                  <Id value={agent.publicKey} />
                </td>
                <td className={cell}>
                  <StatusText status={agent.status} />
                </td>
                <td className={`${cell} tabular-nums`}>{usdc(agent.perTx)}</td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>
                  {usdc(agent.budget)} <span className="text-xs text-muted">/ {agent.windowDays} d</span>
                </td>
                <td className={cell}>
                  <Id value={agent.wallet} href={explorer(network, 'contract', agent.wallet)} />
                </td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(agent.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
