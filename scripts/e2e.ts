/**
 * The whole Oryne flow on Stellar testnet, without a browser:
 *
 *   owner signs in → deploys a wallet → funds it → connects an agent with a mandate
 *   → the agent pays the demo merchant (within limits)
 *   → the agent hits a price over its limit and the wallet contract refuses it
 *   → the agent asks for approval → the owner approves once → the agent pays.
 *
 * Two kinds of owner:
 *   npm run e2e             a Stellar account, as with Freighter: signs a SEP-53
 *                           message and whole transactions
 *   npm run e2e -- passkey  a passkey, as after "Continue with Google": the API
 *                           must run with DEV_LOGIN=1; this script signs exactly
 *                           what navigator.credentials.get() would
 *
 * Needs the API (npm run dev:api) and the demo merchant (npm run dev:merchant).
 * With WEBHOOK_URL set (e.g. a local receiver), it also registers that endpoint
 * and checks every payment and approval event was delivered to it.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { OryneAgent, PaymentRefusedError } from '@oryne/agent'
import { hash, Keypair, TransactionBuilder } from '@stellar/stellar-sdk'

const api = process.env.ORYNE_API_URL ?? 'http://localhost:8787'
const merchant = process.env.MERCHANT_URL ?? 'http://localhost:8788'
const mode = process.argv[2] === 'passkey' ? 'passkey' : 'account'
const webhookUrl = process.env.WEBHOOK_URL

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

type Intent =
  | { id: string; mode: 'envelope'; xdr: string; networkPassphrase: string }
  | { id: string; mode: 'passkey'; challenge: string; credentialIds: string[] }

/** The two ways an owner can sign in, create a wallet and sign an intent. */
type Owner = {
  label: string
  signIn(): Promise<string>
  walletBody(): Record<string, unknown>
  sign(intent: Intent): Record<string, unknown>
}

function accountOwner(): Owner {
  const keypair = Keypair.random()
  return {
    label: `Stellar account ${keypair.publicKey()} (as Freighter)`,
    async signIn() {
      await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`)
      const challenge = await call<{ nonce: string; message: string }>('/v1/auth/challenge', {
        body: { address: keypair.publicKey() },
      })
      const signature = Buffer.from(
        keypair.sign(Buffer.from(hash(Buffer.from(`Stellar Signed Message:\n${challenge.message}`)))),
      ).toString('base64')
      return (await call<{ token: string }>('/v1/auth/verify', { body: { nonce: challenge.nonce, signature } })).token
    },
    walletBody: () => ({ name: 'E2E wallet' }),
    sign(intent) {
      if (intent.mode !== 'envelope') throw new Error('Expected an envelope intent')
      const tx = TransactionBuilder.fromXDR(intent.xdr, intent.networkPassphrase)
      tx.sign(keypair)
      return { signedXdr: tx.toXDR() }
    },
  }
}

function passkeyOwner(): Owner {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const credentialId = randomBytes(16).toString('base64url')
  const sha256 = (data: Buffer) => createHash('sha256').update(data).digest()
  return {
    label: 'passkey owner (as after "Continue with Google")',
    async signIn() {
      return (await call<{ token: string }>('/v1/auth/dev', { body: { subject: `dev:${randomBytes(6).toString('hex')}` } })).token
    },
    walletBody: () => ({
      name: 'E2E passkey wallet',
      passkey: { publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), credentialId },
    }),
    sign(intent) {
      if (intent.mode !== 'passkey') throw new Error('Expected a passkey intent')
      if (!intent.credentialIds.includes(credentialId)) throw new Error('Intent is not for this passkey')
      // What an authenticator returns from navigator.credentials.get({ challenge }).
      const authenticatorData = Buffer.concat([sha256(Buffer.from('localhost')), Buffer.from([0x05, 0, 0, 0, 1])])
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: intent.challenge, origin: 'http://localhost:5173', crossOrigin: false }),
      )
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey)
      return {
        passkey: {
          authenticatorData: authenticatorData.toString('base64url'),
          clientDataJSON: clientDataJSON.toString('base64url'),
          signature: signature.toString('base64url'),
        },
      }
    },
  }
}

const owner = mode === 'passkey' ? passkeyOwner() : accountOwner()

async function signAndSubmit(intent: Intent, token: string) {
  return call<{ hash: string }>(`/v1/intents/${intent.id}/submit`, { body: owner.sign(intent), token })
}

step(`Sign in: ${owner.label}`)
const token = await owner.signIn()
ok('session issued')

if (webhookUrl) {
  step('Register a webhook endpoint')
  const endpoint = await call<{ id: string }>('/v1/webhooks', {
    token,
    body: { url: webhookUrl, events: ['payment.settled', 'payment.refused', 'approval.requested', 'approval.approved'] },
  })
  ok(`endpoint ${endpoint.id} → ${webhookUrl}`)
}

step('Deploy an agent wallet')
const wallet = await call<{ id: string; hash: string }>('/v1/wallets', { body: owner.walletBody(), token })
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
const added = await signAndSubmit(addIntent, token)
ok(`add_agent signed by the owner (${addIntent.mode}, tx ${added.hash})`)

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

step('Owner approves once (approve_once)')
const approveIntent = await call<Intent>(`/v1/approvals/${approval.id}/approve`, { method: 'POST', token })
const approved = await signAndSubmit(approveIntent, token)
ok(`approve_once landed (${approveIntent.mode}, tx ${approved.hash})`)
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

if (webhookUrl) {
  step('Webhooks delivered')
  // Deliveries go out within a few seconds of each event.
  const expected = ['payment.settled', 'payment.refused', 'approval.requested', 'approval.approved']
  let delivered: Array<{ event: string; status: string }> = []
  for (let attempt = 0; attempt < 15; attempt++) {
    delivered = (await call<{ deliveries: Array<{ event: string; status: string }> }>('/v1/webhooks', { token })).deliveries
    if (expected.every((type) => delivered.some((d) => d.event === type && d.status === 'delivered'))) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  for (const type of expected) {
    const found = delivered.filter((d) => d.event === type)
    if (!found.some((d) => d.status === 'delivered')) throw new Error(`webhook ${type} not delivered: ${JSON.stringify(found)}`)
    ok(`${type} × ${found.length}`)
  }
}

console.log(`\nEnd to end (${mode} owner): OK`)
