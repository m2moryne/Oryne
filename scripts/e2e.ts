/**
 * The whole Oryne flow on Stellar testnet, without a browser:
 *
 *   owner signs in → deploys a wallet → funds it → connects an agent with a mandate
 *   → the agent pays the demo merchant (within limits)
 *   → the agent hits a price over its limit and the wallet contract refuses it
 *   → the agent asks for approval → the owner approves once → the agent pays.
 *
 * The owner here is a plain keypair standing in for Freighter: it signs the
 * same SEP-53 message and the same transactions the dashboard asks Freighter for.
 *
 * Needs the API (npm run dev:api) and the demo merchant (npm run dev:merchant).
 * Usage: npm run e2e
 */
import { OryneAgent, PaymentRefusedError } from '@oryne/agent'
import { hash, Keypair, TransactionBuilder } from '@stellar/stellar-sdk'

const api = process.env.ORYNE_API_URL ?? 'http://localhost:8787'
const merchant = process.env.MERCHANT_URL ?? 'http://localhost:8788'

const step = (text: string) => console.log(`\n▸ ${text}`)
const ok = (text: string) => console.log(`  ✓ ${text}`)

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`)
  return data
}

type Intent = { id: string; xdr: string; networkPassphrase: string }

/** What the dashboard does with Freighter: sign the prepared transaction, hand it back. */
async function signAndSubmit(intent: Intent, owner: Keypair, token: string) {
  const tx = TransactionBuilder.fromXDR(intent.xdr, intent.networkPassphrase)
  tx.sign(owner)
  return call<{ hash: string }>(`/v1/intents/${intent.id}/submit`, { body: { signedXdr: tx.toXDR() }, token })
}

const owner = Keypair.random()
step(`Owner ${owner.publicKey()}`)
await fetch(`https://friendbot.stellar.org/?addr=${owner.publicKey()}`)
ok('funded with testnet XLM')

step('Sign in (SEP-53 message, as Freighter signMessage does)')
const challenge = await call<{ nonce: string; message: string }>('/v1/auth/challenge', {
  body: { address: owner.publicKey() },
})
const signature = Buffer.from(
  owner.sign(Buffer.from(hash(Buffer.from(`Stellar Signed Message:\n${challenge.message}`)))),
).toString('base64')
const { token } = await call<{ token: string }>('/v1/auth/verify', { body: { nonce: challenge.nonce, signature } })
ok('session issued')

step('Deploy an agent wallet')
const wallet = await call<{ id: string; hash: string }>('/v1/wallets', { body: { name: 'E2E wallet' }, token })
ok(`wallet ${wallet.id} (tx ${wallet.hash})`)

step('Fund it with 50 test USDC')
await call('/v1/faucet', { body: { to: wallet.id, amount: '50' } })
ok('funded')

step('Connect an agent: 1 USDC per payment, 5 USDC per 30 days')
const agentKey = Keypair.random()
const addIntent = await call<Intent>(`/v1/wallets/${wallet.id}/agents`, {
  body: { publicKey: agentKey.publicKey(), name: 'E2E agent', kind: 'Research', perTx: '1', budget: '5', windowDays: 30 },
  token,
})
const added = await signAndSubmit(addIntent, owner, token)
ok(`add_agent signed by the owner (tx ${added.hash})`)

const agent = new OryneAgent({
  secret: agentKey.secret(),
  apiUrl: api,
  onPayment: (event) => {
    if (event.type === 'paid') ok(`paid ${event.amount} USDC, tx ${event.settlement.transaction}`)
    if (event.type === 'refused') ok(`refused: ${event.reason}`)
  },
})

step('Agent buys a quote (0.01 USDC)')
const quote = await agent.fetch(`${merchant}/quote`)
ok(`HTTP ${quote.status}: ${JSON.stringify(await quote.json())}`)

step('Agent tries a 30 USDC report (over its 1 USDC limit)')
let refusal: PaymentRefusedError | undefined
try {
  await agent.fetch(`${merchant}/report`)
  throw new Error('Expected the wallet to refuse this payment')
} catch (error) {
  if (!(error instanceof PaymentRefusedError)) throw error
  refusal = error
}
if (refusal.reason !== 'OverPerTxLimit') throw new Error(`Expected OverPerTxLimit, got ${refusal.reason}`)

step('Agent asks the owner to approve it')
const approval = await agent.requestApproval({
  payTo: refusal.requirements.payTo,
  amount: '30',
  description: 'Research report on agent payments',
  resource: refusal.requirements.resource,
  reason: refusal.reason,
})
ok(`approval ${approval.id} pending`)

step('Owner approves once (approve_once, signed by the owner)')
const approveIntent = await call<Intent>(`/v1/approvals/${approval.id}/approve`, { method: 'POST', token })
const approved = await signAndSubmit(approveIntent, owner, token)
ok(`approve_once landed (tx ${approved.hash})`)
ok(`agent sees: ${(await agent.approval(approval.id)).status}`)

step('Agent retries the report')
const report = await agent.fetch(`${merchant}/report`)
ok(`HTTP ${report.status}: ${JSON.stringify(await report.json())}`)

step('Wallet afterwards')
const after = await call<{ balance: string; agents: Array<{ remaining?: string }> }>(`/v1/wallets/${wallet.id}`, { token })
ok(`balance ${after.balance} USDC, agent budget left ${after.agents[0]?.remaining} USDC`)
const payments = await call<{ payments: Array<{ status: string; amount: string; reason: string | null }> }>(
  `/v1/wallets/${wallet.id}/payments`,
  { token },
)
for (const payment of payments.payments) ok(`${payment.status} ${payment.amount}${payment.reason ? ` (${payment.reason})` : ''}`)

console.log('\nEnd to end: OK')
