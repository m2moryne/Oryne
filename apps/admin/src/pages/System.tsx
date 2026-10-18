import type { ReactNode } from 'react'
import { Id, Notice, PageHeader, Panel, useAdminData } from '../components/ui'
import { API_URL } from '../lib/api'
import { cn, explorer, when } from '../lib/format'

type System = {
  network: string
  rpcUrl: string
  storage: 'postgres' | 'sqlite'
  sponsor: string
  token: string
  walletWasmHash: string
  publicUrl: string
  webUrl: string
  corsOrigins: string[]
  features: { googleSignIn: boolean; githubSignIn: boolean; devLogin: boolean; aiDebugger: boolean }
  startedAt: number
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-sm">{children}</dd>
    </div>
  )
}

function OnOff({ on }: { on: boolean }) {
  return <span className={cn('font-mono text-xs', on ? 'text-good' : 'text-muted')}>{on ? 'on' : 'off'}</span>
}

export default function System() {
  const { data, error } = useAdminData<System>('/system')

  return (
    <>
      <PageHeader title="System" note="How the API is configured. Secrets are never shown." />
      {error && <Notice>{error}</Notice>}
      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Network">
            <dl>
              <Row label="Network">{data.network}</Row>
              <Row label="RPC">{data.rpcUrl}</Row>
              <Row label="Fee sponsor">
                <Id value={data.sponsor} full href={explorer(data.network, 'account', data.sponsor)} />
              </Row>
              <Row label="USDC token">
                <Id value={data.token} full href={explorer(data.network, 'contract', data.token)} />
              </Row>
              <Row label="Wallet wasm">
                <Id value={data.walletWasmHash} full />
              </Row>
            </dl>
          </Panel>
          <Panel title="Service">
            <dl>
              <Row label="API">{data.publicUrl}</Row>
              <Row label="This site reads">{API_URL}</Row>
              <Row label="Dashboard">{data.webUrl}</Row>
              <Row label="Allowed origins">{data.corsOrigins.join(', ')}</Row>
              <Row label="Storage">{data.storage === 'postgres' ? 'Postgres' : 'SQLite file (lost on restart without a disk)'}</Row>
              <Row label="Running since">{when(data.startedAt)}</Row>
            </dl>
          </Panel>
          <Panel title="Features">
            <dl>
              <Row label="Google sign-in">
                <OnOff on={data.features.googleSignIn} />
              </Row>
              <Row label="GitHub sign-in">
                <OnOff on={data.features.githubSignIn} />
              </Row>
              <Row label="Test-user login">
                <OnOff on={data.features.devLogin} />
              </Row>
              <Row label="AI debugger">
                <OnOff on={data.features.aiDebugger} />
              </Row>
            </dl>
          </Panel>
        </div>
      )}
    </>
  )
}
