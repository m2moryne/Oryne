import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { cell, EmptyState, Filter, Id, Notice, PageHeader, Panel, StatusText, Table, useAdmin, useAdminData } from '../components/ui'
import { explorer, usdc, when } from '../lib/format'

type Payment = {
  id: string
  wallet: string
  agent: string | null
  payee: string
  amount: string
  resource: string | null
  status: 'settled' | 'refused' | 'failed'
  reason: string | null
  txHash: string | null
  createdAt: number
}

type Status = 'all' | 'settled' | 'refused' | 'failed'

export default function Payments() {
  const { network } = useAdmin()
  const [status, setStatus] = useState<Status>('all')
  const { data, error } = useAdminData<{ payments: Payment[] }>(`/payments?limit=200${status === 'all' ? '' : `&status=${status}`}`)

  return (
    <>
      <PageHeader title="Payments" note="Agent payments settled or refused through the facilitator.">
        <Filter
          value={status}
          onChange={setStatus}
          options={[
            ['all', 'All'],
            ['settled', 'Settled'],
            ['refused', 'Refused'],
            ['failed', 'Failed'],
          ]}
        />
      </PageHeader>
      {error && <Notice>{error}</Notice>}
      <Panel flush>
        {data?.payments.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments" />
        ) : (
          <Table columns={['What', 'Amount', 'Result', 'Wallet', 'Paid to', { label: 'When', right: true }]} minWidth="56rem">
            {data?.payments.map((payment) => (
              <tr key={payment.id}>
                <td className={`${cell} max-w-64 truncate`}>{payment.resource ?? '—'}</td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>{usdc(payment.amount)}</td>
                <td className={cell}>
                  {payment.txHash ? (
                    <a href={explorer(network, 'tx', payment.txHash)} target="_blank" rel="noreferrer" className="hover:underline">
                      <StatusText status={payment.status} />
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-accent">{payment.reason ?? payment.status}</span>
                  )}
                </td>
                <td className={cell}>
                  <Id value={payment.wallet} href={explorer(network, 'contract', payment.wallet)} />
                </td>
                <td className={cell}>
                  <Id value={payment.payee} />
                </td>
                <td className={`${cell} whitespace-nowrap text-right text-muted`}>{when(payment.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
