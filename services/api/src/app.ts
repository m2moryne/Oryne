import { randomBytes } from 'node:crypto'
import {
  balanceOp,
  base64url,
  buildTx,
  deployWalletOp,
  fromBaseUnits,
  i128,
  isAddress,
  publicKeyFromSpki,
  networkId,
  prepareSignSubmit,
  toBaseUnits,
  walletOps,
  walletReads,
  type PaymentPayload,
  type PaymentRequirements,
  type Policy,
} from '@oryne/core'
import { hash, Operation, StrKey, Address } from '@stellar/stellar-sdk'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { createKey, listKeys, revokeKey, scopes as keyScopes } from './api-keys.ts'
import { agentAuth, createChallenge, ownerAuth, verifyChallenge, type AgentRow, type OwnerVariables } from './auth.ts'
import { createSession, finish, providers, startUrl, type Provider } from './oauth.ts'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import { adminApi } from './admin.ts'
import { createDebugger } from './debugger.ts'
import { settle, verify } from './facilitator.ts'
import { listRequests, logRequests } from './requests.ts'
import type { Webhooks } from './webhooks.ts'
import { createIntent, submitIntent, type PasskeyResponse } from './intents.ts'
import { readContract, type Chain } from './stellar.ts'

type WalletRow = {
  id: string
  owner: string
  owner_kind: 'account' | 'passkey'
  name: string
  tx_hash: string | null
  created_at: number
}
type AgentDbRow = {
  public_key: string
  wallet_id: string
  name: string
  kind: string
  per_tx: string
  budget: string
  window_secs: number
  expires_at: number
  payees: string
  status: string
  created_at: number
}
type ApprovalRow = {
  id: string
  wallet_id: string
  agent: string
  payee: string
  amount: string
  description: string
  resource: string | null
  reason: string | null
  status: string
  tx_hash: string | null
  created_at: number
  resolved_at: number | null
}

const DAY = 86_400

async function body<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HTTPException(400, { message: 'Expected a JSON body' })
  }
}

function amountOf(value: unknown, field: string, decimals: number) {
  try {
    const units = toBaseUnits(String(value), decimals)
    if (units <= 0n) throw new Error()
    return units
  } catch {
    throw new HTTPException(400, { message: `${field} must be a positive amount like "25" or "0.008"` })
  }
}

function addressOf(value: unknown, field: string) {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new HTTPException(400, { message: `${field} must be a Stellar address (G… or C…)` })
  }
  return value
}

export function createApp(config: Config, db: Db, chain: Chain, webhooks: Webhooks) {
  const app = new Hono()
  const decimals = chain.network.decimals
  const aiDebugger = createDebugger(config.anthropicApiKey)
  /** API keys belong to one network: test keys on testnet, live keys on mainnet. */
  const keyMode = config.network.name === 'mainnet' ? 'live' : 'test'
  const money = (units: string | bigint) => fromBaseUnits(BigInt(units), decimals)

  const agentView = (row: AgentDbRow, remaining?: bigint) => ({
    publicKey: row.public_key,
    wallet: row.wallet_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    perTx: money(row.per_tx),
    budget: money(row.budget),
    windowDays: row.window_secs / DAY,
    expiresAt: row.expires_at || null,
    payees: JSON.parse(row.payees) as string[],
    remaining: remaining === undefined ? undefined : money(remaining),
    createdAt: row.created_at,
  })

  const approvalView = (row: ApprovalRow) => ({
    id: row.id,
    wallet: row.wallet_id,
    agent: row.agent,
    payee: row.payee,
    amount: money(row.amount),
    description: row.description,
    resource: row.resource,
    reason: row.reason,
    status: row.status,
    txHash: row.tx_hash,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  })

  const ownedWallet = async (owner: string, id: string) => {
    const wallet = await db.prepare('select * from wallets where id = ? and owner = ?').get(id, owner) as WalletRow | undefined
    if (!wallet) throw new HTTPException(404, { message: 'No such wallet' })
    return wallet
  }

  const walletAgent = async (walletId: string, key: string) => {
    const agent = await db
      .prepare("select * from agents where wallet_id = ? and public_key = ? and status != 'removed'")
      .get(walletId, key) as AgentDbRow | undefined
    if (!agent) throw new HTTPException(404, { message: 'No such agent on this wallet' })
    return agent
  }

  const policyFrom = (input: Record<string, unknown>, fallback?: AgentDbRow): Policy => {
    const payees = (input.payees ?? (fallback ? JSON.parse(fallback.payees) : [])) as unknown[]
    if (!Array.isArray(payees)) throw new HTTPException(400, { message: 'payees must be a list of addresses' })
    const windowDays = Number(input.windowDays ?? (fallback ? fallback.window_secs / DAY : 30))
    if (!(windowDays > 0)) throw new HTTPException(400, { message: 'windowDays must be positive' })
    const policy: Policy = {
      token: chain.network.token,
      perTx: input.perTx !== undefined ? amountOf(input.perTx, 'perTx', decimals) : BigInt(fallback!.per_tx),
      budget: input.budget !== undefined ? amountOf(input.budget, 'budget', decimals) : BigInt(fallback!.budget),
      windowSecs: Math.round(windowDays * DAY),
      expiresAt: Number(input.expiresAt ?? fallback?.expires_at ?? 0) || 0,
      payees: payees.map((payee, i) => addressOf(payee, `payees[${i}]`)),
    }
    if (policy.perTx > policy.budget) throw new HTTPException(400, { message: 'perTx cannot exceed budget' })
    return policy
  }

  const remainingOf = async (agent: AgentDbRow) => {
    try {
      return BigInt(await readContract<bigint>(chain, walletReads.remaining(agent.wallet_id, agent.public_key)))
    } catch {
      return undefined
    }
  }

  const balanceOf = async (address: string) => {
    try {
      return BigInt(await readContract<bigint>(chain, balanceOp(chain.network.token, address)))
    } catch {
      return 0n
    }
  }

  app.use(
    '*',
    cors({
      origin: config.corsOrigins,
      allowHeaders: ['content-type', 'authorization', 'x-oryne-agent'],
      exposeHeaders: ['x-request-id'],
    }),
  )

  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: 'Something went wrong on our side' }, 500)
  })

  // ---------------------------------------------------------------- public

  app.get('/v1/info', (c) =>
    c.json({
      network: networkId(chain.network),
      networkPassphrase: chain.network.networkPassphrase,
      rpcUrl: chain.network.rpcUrl,
      token: chain.network.token,
      tokenDecimals: decimals,
      sponsor: chain.sponsor.publicKey(),
      walletWasmHash: chain.walletWasmHash.toString('hex'),
      facilitator: `${config.publicUrl}/v1/x402`,
      faucet: chain.issuer ? `${config.publicUrl}/v1/faucet` : null,
      auth: {
        freighter: true,
        google: !!config.oauth.google,
        github: !!config.oauth.github,
        dev: config.devLogin,
      },
      features: { aiDebugger: aiDebugger.enabled },
      /** Where records live: postgres (survives restarts) or sqlite (a local file). */
      storage: config.databaseUrl ? 'postgres' : 'sqlite',
      /** Classic asset behind the token, so G… accounts can add a trustline. */
      tokenAsset: chain.issuer ? { code: 'USDC', issuer: chain.issuer.publicKey() } : config.network.name === 'mainnet'
        ? { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' }
        : null,
    }),
  )

  app.post('/v1/auth/challenge', async (c) => {
    const { address } = await body<{ address: string }>(c)
    return c.json(await createChallenge(db, address, new URL(config.publicUrl).host))
  })

  app.post('/v1/auth/verify', async (c) => {
    const { nonce, signature } = await body<{ nonce: string; signature: string }>(c)
    return c.json(await verifyChallenge(db, nonce, signature))
  })

  const providerOf = (value: string): Provider => {
    if (!providers.includes(value as Provider)) throw new HTTPException(404, { message: 'Unknown sign-in provider' })
    return value as Provider
  }

  app.get('/v1/auth/oauth/:provider/start', async (c) => c.redirect(await startUrl(config, db, providerOf(c.req.param('provider')))))

  app.get('/v1/auth/oauth/:provider/callback', async (c) =>
    c.redirect(await finish(config, db, providerOf(c.req.param('provider')), c.req.query('code'), c.req.query('state'))),
  )

  /** Testnet scripts only (DEV_LOGIN=1): a session without OAuth. */
  app.post('/v1/auth/dev', async (c) => {
    if (!config.devLogin) throw new HTTPException(404, { message: 'Not found' })
    const { subject } = await body<{ subject: string }>(c)
    if (!/^dev:[\w-]{1,64}$/.test(subject ?? '')) throw new HTTPException(400, { message: 'subject must look like dev:name' })
    return c.json(await createSession(db, subject, 'dev'))
  })

  app.get('/v1/services', async (c) => {
    const q = `%${(c.req.query('q') ?? '').toLowerCase()}%`
    const rows = await db
      .prepare('select * from services where lower(name || description || category) like ? order by created_at desc')
      .all(q) as Array<Record<string, unknown>>
    return c.json({ services: rows.map((row) => ({ ...row, price: row.price })) })
  })

  app.post('/v1/x402/verify', async (c) => {
    const { paymentPayload, paymentRequirements } = await body<{
      paymentPayload: PaymentPayload
      paymentRequirements: PaymentRequirements
    }>(c)
    return c.json(await verify(chain, paymentPayload, paymentRequirements))
  })

  app.post('/v1/x402/settle', async (c) => {
    const { paymentPayload, paymentRequirements } = await body<{
      paymentPayload: PaymentPayload
      paymentRequirements: PaymentRequirements
    }>(c)
    return c.json(
      await settle(db, chain, paymentPayload, paymentRequirements, async (payment) => {
        if (payment.status !== 'settled' && payment.status !== 'refused') return
        await webhooks.emit(payment.owner, payment.status === 'settled' ? 'payment.settled' : 'payment.refused', {
          id: payment.id,
          wallet: payment.wallet,
          agent: payment.agent,
          payee: payment.payee,
          amount: money(payment.amount),
          asset: payment.asset,
          resource: payment.resource,
          status: payment.status,
          reason: payment.reason,
          txHash: payment.txHash,
          approvedByOwner: payment.approvedByOwner,
        })
      }),
    )
  })

  /** Testnet only: test USDC into a wallet, and XLM into an owner account. */
  app.post('/v1/faucet', async (c) => {
    if (!chain.issuer) throw new HTTPException(404, { message: 'No faucet on this network' })
    const { to, amount } = await body<{ to: string; amount?: string }>(c)
    const target = addressOf(to, 'to')
    const units = amountOf(amount ?? '100', 'amount', decimals)
    if (units > toBaseUnits('1000', decimals)) throw new HTTPException(400, { message: 'At most 1000 per request' })
    if (StrKey.isValidEd25519PublicKey(target) && chain.network.friendbotUrl) {
      await fetch(`${chain.network.friendbotUrl}/?addr=${target}`).catch(() => undefined)
    }
    const issuer = chain.issuer
    const result = await prepareSignSubmit(
      chain.rpc,
      await buildTx(
        chain.rpc,
        chain.network,
        issuer.publicKey(),
        Operation.invokeContractFunction({
          contract: chain.network.token,
          function: 'mint',
          args: [new Address(target).toScVal(), i128(units)],
        }),
      ),
      issuer,
    )
    return c.json({ hash: result.hash, amount: money(units) })
  })

  // ---------------------------------------------------------------- owners

  const owner = new Hono<{ Variables: OwnerVariables }>()
  // Requests are logged even when a key is refused for lack of a permission.
  owner.use('*', logRequests(db, 'owner'))
  owner.use('*', ownerAuth(db, keyMode))

  // ---------------------------------------------------------------- API keys
  // Keys and webhooks are managed only when signed in, never with an API key.
  const sessionOnly = (c: Context<{ Variables: OwnerVariables }>) => {
    if (c.var.apiKey) throw new HTTPException(403, { message: 'Sign in to the dashboard to manage this; API keys can only read' })
  }
  owner.get('/keys', async (c) => {
    sessionOnly(c)
    return c.json({ mode: keyMode, scopes: keyScopes, keys: await listKeys(db, c.var.owner) })
  })
  owner.post('/keys', async (c) => {
    sessionOnly(c)
    return c.json(await createKey(db, c.var.owner, keyMode, await body<{ name?: unknown; scopes?: unknown }>(c)), 201)
  })
  owner.post('/keys/:id/revoke', async (c) => {
    sessionOnly(c)
    return c.json(await revokeKey(db, c.var.owner, c.req.param('id')))
  })

  // ---------------------------------------------------------------- webhooks
  owner.get('/webhooks', async (c) => {
    sessionOnly(c)
    return c.json(await webhooks.list(c.var.owner))
  })
  owner.post('/webhooks', async (c) => {
    sessionOnly(c)
    return c.json(await webhooks.add(c.var.owner, await body<{ url?: unknown; events?: unknown }>(c)), 201)
  })
  owner.post('/webhooks/:id/remove', async (c) => {
    sessionOnly(c)
    await webhooks.remove(c.var.owner, c.req.param('id'))
    return c.json({ ok: true })
  })
  owner.post('/webhooks/:id/test', async (c) => {
    sessionOnly(c)
    await webhooks.test(c.var.owner, c.req.param('id'))
    return c.json({ ok: true })
  })
  owner.post('/webhooks/deliveries/:id/retry', async (c) => {
    sessionOnly(c)
    await webhooks.retry(c.var.owner, c.req.param('id'))
    return c.json({ ok: true })
  })

  owner.get('/me', async (c) => {
    const wallets = await db.prepare('select * from wallets where owner = ? order by created_at').all(c.var.owner)
    const user = await db.prepare('select provider, email, name, avatar from users where subject = ?').get(c.var.owner)
    return c.json({ address: c.var.owner, user: user ?? { provider: 'freighter' }, wallets })
  })

  owner.post('/wallets', async (c) => {
    const input = await body<{ name?: string; passkey?: { publicKey: string; credentialId: string } }>(c).catch(
      () => ({}) as { name?: string; passkey?: { publicKey: string; credentialId: string } },
    )
    const { name } = input
    // Freighter users own their wallet with their account; everyone else with a passkey.
    let walletOwner: { address: string } | { passkey: Uint8Array }
    if (input.passkey) {
      let key: Uint8Array
      try {
        const raw = base64url.decode(input.passkey.publicKey)
        key = raw.length === 65 ? raw : publicKeyFromSpki(raw)
      } catch {
        throw new HTTPException(400, { message: 'passkey.publicKey must be a P-256 key (SPKI or 65-byte raw), base64url' })
      }
      if (!input.passkey.credentialId) throw new HTTPException(400, { message: 'passkey.credentialId is required' })
      walletOwner = { passkey: key }
    } else if (StrKey.isValidEd25519PublicKey(c.var.owner)) {
      walletOwner = { address: c.var.owner }
    } else {
      throw new HTTPException(400, { message: 'Create a passkey to own your wallet' })
    }
    const salt = hash(Buffer.concat([Buffer.from(c.var.owner), randomBytes(16)]))
    const result = await chain.serial(async () =>
      prepareSignSubmit(
        chain.rpc,
        await buildTx(
          chain.rpc,
          chain.network,
          chain.sponsor.publicKey(),
          deployWalletOp(chain.sponsor.publicKey(), chain.walletWasmHash, walletOwner, salt),
        ),
        chain.sponsor,
      ),
    )
    const id = String(result.returnValue)
    const ownerKind = 'passkey' in walletOwner ? 'passkey' : 'account'
    await db.prepare('insert into wallets (id, owner, owner_kind, name, tx_hash, created_at) values (?, ?, ?, ?, ?, ?)').run(
      id,
      c.var.owner,
      ownerKind,
      name?.trim() || 'My wallet',
      result.hash,
      now(),
    )
    if ('passkey' in walletOwner) {
      await db.prepare(
        'insert into passkeys (credential_id, subject, wallet_id, public_key, created_at) values (?, ?, ?, ?, ?)',
      ).run(input.passkey!.credentialId, c.var.owner, id, Buffer.from(walletOwner.passkey).toString('hex'), now())
    }
    return c.json({ id, hash: result.hash, ledger: result.ledger }, 201)
  })

  owner.get('/wallets/:id', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const agents = await db
      .prepare("select * from agents where wallet_id = ? and status != 'removed' order by created_at")
      .all(wallet.id) as AgentDbRow[]
    const [balance, remaining] = await Promise.all([balanceOf(wallet.id), Promise.all(agents.map(remainingOf))])
    return c.json({
      ...wallet,
      token: chain.network.token,
      balance: money(balance),
      agents: agents.map((agent, i) => agentView(agent, remaining[i])),
    })
  })

  owner.get('/wallets/:id/payments', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const rows = await db
      .prepare('select * from payments where wallet_id = ? order by created_at desc limit 200')
      .all(wallet.id) as Array<Record<string, any>>
    return c.json({ payments: rows.map((row) => ({ ...row, amount: money(row.amount) })) })
  })

  // Request logs for the developer console, newest first.
  owner.get('/logs', async (c) => {
    // ?before=<created_at>.<id> of the last row the client has.
    const [beforeAt, beforeId] = (c.req.query('before') ?? '').split('.')
    const rows = await listRequests(db, c.var.owner, {
      errorsOnly: c.req.query('status') === 'error',
      walletId: c.req.query('wallet') || undefined,
      before: Number(beforeAt) > 0 && beforeId ? { createdAt: Number(beforeAt), id: beforeId } : undefined,
      limit: Number(c.req.query('limit')) || undefined,
    })
    return c.json({
      requests: rows.map((row) => ({
        id: row.id,
        wallet: row.wallet_id,
        actorKind: row.actor_kind,
        actor: row.actor,
        actorName: row.key_name ?? null,
        method: row.method,
        path: row.path,
        status: row.status,
        latencyMs: row.latency_ms,
        error: row.error,
        userAgent: row.user_agent,
        createdAt: row.created_at,
      })),
    })
  })

  // The AI debugger, over a snapshot of this wallet: agents and mandates, recent payments, approvals.
  owner.post('/wallets/:id/debug', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const { messages } = await body<{ messages: unknown }>(c)
    const agents = await db
      .prepare('select * from agents where wallet_id = ? order by created_at')
      .all(wallet.id) as AgentDbRow[]
    const [balance, remaining] = await Promise.all([balanceOf(wallet.id), Promise.all(agents.map(remainingOf))])
    const payments = await db
      .prepare('select * from payments where wallet_id = ? order by created_at desc limit 60')
      .all(wallet.id) as Array<Record<string, any>>
    const approvals = await db
      .prepare('select * from approvals where wallet_id = ? order by created_at desc limit 30')
      .all(wallet.id) as ApprovalRow[]
    const named = (key: string | null) => agents.find((agent) => agent.public_key === key)?.name ?? null
    const failedRequests = await listRequests(db, c.var.owner, { errorsOnly: true, walletId: wallet.id, limit: 30 })
    return aiDebugger.answer(c, c.var.owner, messages, {
      network: networkId(chain.network),
      wallet: { id: wallet.id, name: wallet.name, ownerKind: wallet.owner_kind, balance: money(balance), token: chain.network.token },
      agents: agents.map((agent, i) => agentView(agent, remaining[i])),
      payments: payments.map((row) => ({
        id: row.id,
        agent: row.agent,
        agentName: named(row.agent),
        payee: row.payee,
        amount: money(row.amount),
        resource: row.resource,
        status: row.status,
        reason: row.reason,
        approvedByOwner: !!row.approved_by_owner,
        txHash: row.tx_hash,
        at: new Date(row.created_at * 1000).toISOString(),
      })),
      approvals: approvals.map((row) => ({ ...approvalView(row), agentName: named(row.agent) })),
      failedRequests: failedRequests.map((row) => ({
        id: row.id,
        by:
          row.actor_kind === 'agent'
            ? (named(row.actor) ?? row.actor)
            : row.actor_kind === 'key'
              ? `API key "${row.key_name ?? row.actor}"`
              : 'owner (dashboard)',
        request: `${row.method} ${row.path}`,
        status: row.status,
        error: row.error,
        at: new Date(row.created_at * 1000).toISOString(),
      })),
    })
  })

  owner.post('/wallets/:id/agents', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const input = await body<Record<string, unknown>>(c)
    const agent = String(input.publicKey ?? '')
    if (!StrKey.isValidEd25519PublicKey(agent)) throw new HTTPException(400, { message: 'publicKey must be a G… key' })
    if (await db.prepare("select 1 from agents where public_key = ? and status != 'removed'").get(agent)) {
      throw new HTTPException(409, { message: 'This agent key is already registered' })
    }
    const policy = policyFrom(input)
    return c.json(
      await createIntent(db, chain, c.var.owner, wallet, 'add_agent', walletOps.addAgent(wallet.id, agent, policy), {
        wallet: wallet.id,
        agent,
        name: String(input.name ?? 'Agent').slice(0, 80),
        kind: String(input.kind ?? 'Other').slice(0, 40),
        ...policy,
      }),
    )
  })

  owner.patch('/wallets/:id/agents/:key', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const current = await walletAgent(wallet.id, c.req.param('key'))
    const policy = policyFrom(await body<Record<string, unknown>>(c), current)
    return c.json(
      await createIntent(db, chain, c.var.owner, wallet, 'set_policy', walletOps.setPolicy(wallet.id, current.public_key, policy), {
        agent: current.public_key,
        ...policy,
      }),
    )
  })

  owner.post('/wallets/:id/agents/:key/pause', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const agent = await walletAgent(wallet.id, c.req.param('key'))
    const { paused } = await body<{ paused: boolean }>(c)
    return c.json(
      await createIntent(db, chain, c.var.owner, wallet, 'set_paused', walletOps.setPaused(wallet.id, agent.public_key, !!paused), {
        agent: agent.public_key,
        paused: !!paused,
      }),
    )
  })

  owner.delete('/wallets/:id/agents/:key', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const agent = await walletAgent(wallet.id, c.req.param('key'))
    return c.json(
      await createIntent(db, chain, c.var.owner, wallet, 'remove_agent', walletOps.removeAgent(wallet.id, agent.public_key), {
        agent: agent.public_key,
      }),
    )
  })

  owner.post('/wallets/:id/withdraw', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const input = await body<{ to?: string; amount: string }>(c)
    const fallback = StrKey.isValidEd25519PublicKey(c.var.owner) ? c.var.owner : undefined
    const to = addressOf(input.to ?? fallback, 'to')
    const units = amountOf(input.amount, 'amount', decimals)
    return c.json(
      await createIntent(db, chain, c.var.owner, wallet, 'withdraw', walletOps.withdraw(wallet.id, chain.network.token, to, units), {
        to,
        amount: units,
      }),
    )
  })

  owner.get('/approvals', async (c) => {
    const status = c.req.query('status') ?? 'pending'
    const rows = await db
      .prepare(
        `select a.* from approvals a join wallets w on w.id = a.wallet_id
         where w.owner = ? and (? = 'all' or a.status = ?) order by a.created_at desc limit 200`,
      )
      .all(c.var.owner, status, status) as ApprovalRow[]
    return c.json({ approvals: rows.map(approvalView) })
  })

  const ownedApproval = async (ownerAddress: string, id: string) => {
    const row = await db
      .prepare('select a.* from approvals a join wallets w on w.id = a.wallet_id where a.id = ? and w.owner = ?')
      .get(id, ownerAddress) as ApprovalRow | undefined
    if (!row) throw new HTTPException(404, { message: 'No such approval' })
    if (row.status !== 'pending') throw new HTTPException(409, { message: `Already ${row.status}` })
    return row
  }

  owner.post('/approvals/:id/approve', async (c) => {
    const approval = await ownedApproval(c.var.owner, c.req.param('id'))
    const wallet = await ownedWallet(c.var.owner, approval.wallet_id)
    const expiresAt = now() + 3600
    return c.json(
      await createIntent(
        db,
        chain,
        c.var.owner,
        wallet,
        'approve_once',
        walletOps.approveOnce(approval.wallet_id, approval.agent, approval.payee, BigInt(approval.amount), expiresAt),
        { approval: approval.id },
      ),
    )
  })

  owner.post('/approvals/:id/decline', async (c) => {
    const approval = await ownedApproval(c.var.owner, c.req.param('id'))
    await db.prepare("update approvals set status = 'declined', resolved_at = ? where id = ?").run(now(), approval.id)
    const declined = await db.prepare('select * from approvals where id = ?').get<ApprovalRow>(approval.id)
    await webhooks.emit(c.var.owner, 'approval.declined', approvalView(declined!))
    return c.json({ ok: true })
  })

  owner.post('/intents/:id/submit', async (c) => {
    const signed = await body<{ signedXdr?: string; passkey?: PasskeyResponse }>(c)
    return c.json(
      await submitIntent(db, chain, c.var.owner, c.req.param('id'), signed, async (kind, data) => {
        if (kind !== 'approve_once') return
        const approved = await db.prepare('select * from approvals where id = ?').get<ApprovalRow>(data.approval)
        if (approved) await webhooks.emit(c.var.owner, 'approval.approved', approvalView(approved))
      }),
    )
  })

  owner.post('/services', async (c) => {
    const input = await body<Record<string, string>>(c)
    if (!input.name || !input.url) throw new HTTPException(400, { message: 'name and url are required' })
    const id = newId('svc')
    await db.prepare(
      'insert into services (id, name, description, category, url, pay_to, price, unit, owner, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      input.name.slice(0, 80),
      (input.description ?? '').slice(0, 300),
      (input.category ?? 'Other').slice(0, 40),
      input.url,
      addressOf(input.payTo, 'payTo'),
      fromBaseUnits(amountOf(input.price, 'price', decimals), decimals),
      (input.unit ?? 'call').slice(0, 20),
      c.var.owner,
      now(),
    )
    return c.json({ id }, 201)
  })


  // ---------------------------------------------------------------- agents

  const agentApi = new Hono<{ Variables: { agent: AgentRow } }>()
  agentApi.use('*', agentAuth(db))
  agentApi.use('*', logRequests(db, 'agent'))

  agentApi.get('/', async (c) => {
    const row = await db.prepare('select * from agents where public_key = ?').get(c.var.agent.public_key) as AgentDbRow
    return c.json({
      agent: agentView(row, await remainingOf(row)),
      network: networkId(chain.network),
      rpcUrl: chain.network.rpcUrl,
      networkPassphrase: chain.network.networkPassphrase,
      token: chain.network.token,
      simulationSource: chain.sponsor.publicKey(),
      walletBalance: money(await balanceOf(row.wallet_id)),
    })
  })

  agentApi.post('/approvals', async (c) => {
    const input = await body<Record<string, unknown>>(c)
    const id = newId('apr')
    await db.prepare(
      'insert into approvals (id, wallet_id, agent, payee, amount, description, resource, reason, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      c.var.agent.wallet_id,
      c.var.agent.public_key,
      addressOf(input.payTo, 'payTo'),
      amountOf(input.amount, 'amount', decimals).toString(),
      String(input.description ?? '').slice(0, 300),
      input.resource ? String(input.resource).slice(0, 500) : null,
      input.reason ? String(input.reason).slice(0, 100) : null,
      now(),
    )
    const requested = approvalView((await db.prepare('select * from approvals where id = ?').get(id)) as ApprovalRow)
    const walletOwner = await db.prepare('select owner from wallets where id = ?').get<{ owner: string }>(c.var.agent.wallet_id)
    if (walletOwner) await webhooks.emit(walletOwner.owner, 'approval.requested', requested)
    return c.json(requested, 201)
  })

  agentApi.get('/approvals/:id', async (c) => {
    const row = await db
      .prepare('select * from approvals where id = ? and agent = ?')
      .get(c.req.param('id'), c.var.agent.public_key) as ApprovalRow | undefined
    if (!row) throw new HTTPException(404, { message: 'No such approval' })
    return c.json(approvalView(row))
  })

  // Agent routes first: the owner sign-in middleware is mounted on all of /v1.
  app.route('/v1/agent', agentApi)
  // Before the owner routes, whose sign-in check would otherwise run on /v1/admin too.
  const admin = adminApi(config, db, chain)
  if (admin) app.route('/v1/admin', admin)
  app.route('/v1', owner)

  return app
}
