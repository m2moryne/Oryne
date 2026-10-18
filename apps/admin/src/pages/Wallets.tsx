import { Wallet } from 'lucide-react'
import { cell, EmptyState, Id, Notice, PageHeader, Panel, Table, useAdmin, useAdminData } from '../components/ui'
import { explorer, when } from '../lib/format'

type WalletRow = {
  id: string
  name: string
  owner: string
  ownerKind: 'account' | 'passkey'
  agents: number
  payments: number
  txHash: string | null
  createdAt: number
}

export default function Wallets() {
  const { network } = useAdmin()
  const { data, error } = useAdminData<{ wallets: WalletRow[] }>('/wallets?limit=200')

  return (
    <>
      <PageHeader title="Wallets" note="Agent-wallet contracts deployed through this API." />
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.wallets.length === 0 ? (
          <EmptyState icon={Wallet} title="No wallets yet" />
        ) : (
          <Table columns={['Wallet', 'Contract', 'Owner', 'Agents', 'Payments', { label: 'Created', right: true }]}>
            {data?.wallets.map((wallet) => (
              <tr key={wallet.id}>
                <td className={cell}>{wallet.name}</td>
                <td className={cell}>
                  <Id value={wallet.id} href={explorer(network, 'contract', wallet.id)} />
                </td>
                <td className={cell}>
                  <p className="text-xs text-muted">{wallet.ownerKind === 'passkey' ? 'Passkey' : 'Stellar account'}</p>
                  <Id value={wallet.owner} />
                </td>
                <td className={`${cell} tabular-nums`}>{wallet.agents}</td>
                <td className={`${cell} tabular-nums`}>{wallet.payments}</td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(wallet.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
