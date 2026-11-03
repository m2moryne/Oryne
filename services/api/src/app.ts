import {
  balanceOp,
  fromBaseUnits,
  isAddress,
  networkId,
  toBaseUnits,
  walletOps,
  walletReads,
  type PaymentPayload,
  type PaymentRequirements,
  type Policy,
} from '@oryne/core'
import { Asset, StrKey } from '@stellar/stellar-sdk'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { createKey, listKeys, revokeKey, scopes as keyScopes } from './api-keys.ts'
import { agentAuth, createChallenge, ownerAuth, verifyChallenge, type AgentRow, type OwnerVariables } from './auth.ts'
import { createEmailCodes } from './email-codes.ts'
import { createFunding } from './funding.ts'
import { createWallets, emailOf, type WalletRequest } from './wallets.ts'
import { createTeam } from './team.ts'
import { createSession, finish, providers, startUrl, type Provider } from './oauth.ts'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import { adminApi } from './admin.ts'
import { createDebugger } from './debugger.ts'
import { settle, verify } from './facilitator.ts'
import { listRequests, logRequests } from './requests.ts'
import { usage, usageRanges } from './usage.ts'
import { billing } from './pricing.ts'
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

type ServiceRow = {
  id: string
  name: string
  description: string
  category: string
  url: string
  pay_to: string
  price: string
  unit: string
  owner: string | null
  created_at: number
}

/** Directory categories, in the order the dashboard shows them. */
const serviceCategories = ['Search', 'Data', 'AI models', 'Media', 'Finance', 'Developer tools', 'Other']

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
  const aiDebugger = createDebugger(config.deepseekApiKey, config.deepseekModel)
  const emailCodes = createEmailCodes(config, db)
  const wallets = createWallets(config, db, chain)
  const funding = createFunding(config, db, chain, wallets)
  const team = createTeam(config, db)
  /** API keys belong to one network: test keys on testnet, live keys on mainnet. */
  const keyMode = config.network.name === 'mainnet' ? 'live' : 'test'
  const money = (units: string | bigint) => fromBaseUnits(BigInt(units), decimals)

  /** Listings as the API returns them, with how often agents have paid each one through Oryne. */
  const serviceViews = async (rows: ServiceRow[]) => {
    if (rows.length === 0) return []
    const payees = [...new Set(rows.map((row) => row.pay_to))]
    const stats = await db
      .prepare(
        `select payee, count(*) as calls, max(created_at) as last_at from payments
         where status = 'settled' and payee in (${payees.map(() => '?').join(', ')}) group by payee`,
      )
      .all(...payees) as Array<{ payee: string; calls: number; last_at: number }>
    const byPayee = new Map(stats.map((stat) => [stat.payee, stat]))
    return rows.map((row) => {
      const stat = byPayee.get(row.pay_to)
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        url: row.url,
        payTo: row.pay_to,
        price: row.price,
        unit: row.unit,
        createdAt: Number(row.created_at),
        /** Payments settled to this payee through Oryne: a sign the service really charges agents. */
        paidCalls: Number(stat?.calls ?? 0),
        lastPaidAt: stat ? Number(stat.last_at) : null,
      }
    })
  }

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

  /** XLM as a token contract: what a wallet holds when someone sends it XLM instead of USDC. */
  const xlmToken = Asset.native().contractId(chain.network.networkPassphrase)

  const balanceOf = async (address: string, token = chain.network.token) => {
    try {
      return BigInt(await readContract<bigint>(chain, balanceOp(token, address)))
    } catch {
      return 0n
    }
  }

  app.use(
    '*',
    cors({
      origin: config.corsOrigins,
      allowHeaders: ['content-type', 'authorization', 'x-oryne-agent', 'x-oryne-account'],
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
      /** test on testnet, live on mainnet: which side of the dashboard's Test/Live switch this API is. */
      mode: keyMode,
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
        email: emailCodes.enabled,
        dev: config.devLogin,
      },
      features: { aiDebugger: aiDebugger.enabled },
      /** Card top-ups with Paystack: the currency and how much one USDC costs in it. Null when off. */
      card: funding.card,
      /** Who may create a wallet: anyone (open) or approved accounts (invite). */
      access: config.access,
      /** A first wallet must be paid for by card before it's deployed: the USDC that goes into it. Null when not. */
      activation: funding.activation,
      /** One wallet per account unless true. */
      multipleWallets: config.multipleWallets,
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

  app.get('/v1/auth/oauth/:provider/start', async (c) => c.redirect(await startUrl(config, db, providerOf(c.req.param('provider')), c.req.query('next'))))

  app.get('/v1/auth/oauth/:provider/callback', async (c) =>
    c.redirect(await finish(config, db, providerOf(c.req.param('provider')), c.req.query('code'), c.req.query('state'))),
  )

  app.post('/v1/auth/email/start', async (c) => {
    const { email } = await body<{ email?: unknown }>(c)
    return c.json(await emailCodes.start(email, c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'))
  })

  app.post('/v1/auth/email/verify', async (c) => {
    const { email, code } = await body<{ email?: unknown; code?: unknown }>(c)
    return c.json(await emailCodes.verify(email, code))
  })

  /** Testnet scripts only (DEV_LOGIN=1): a session without OAuth. */
  app.post('/v1/auth/dev', async (c) => {
    if (!config.devLogin) throw new HTTPException(404, { message: 'Not found' })
    const { subject } = await body<{ subject: string }>(c)
    if (!/^dev:[\w-]{1,64}$/.test(subject ?? '')) throw new HTTPException(400, { message: 'subject must look like dev:name' })
    return c.json(await createSession(db, subject, 'dev'))
  })

  /** The service directory: paid APIs agents can use. Public, so agents and the MCP server can search it. */
  app.get('/v1/services', async (c) => {
    const q = `%${(c.req.query('q') ?? '').toLowerCase().slice(0, 100)}%`
    const category = c.req.query('category') ?? ''
    const rows = await db
      .prepare(
        `select * from services where lower(name || ' ' || description || ' ' || category) like ?
         and (? = '' or category = ?) order by created_at desc limit 200`,
      )
      .all(q, category, category) as ServiceRow[]
    return c.json({ services: await serviceViews(rows), categories: serviceCategories })
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
    const txHash = await funding.send(target, units)
    const wallet = await db.prepare('select * from wallets where id = ?').get<WalletRow>(target)
    if (wallet) await funding.record({ wallet: wallet.id, owner: wallet.owner, kind: 'test', units, txHash })
    return c.json({ hash: txHash, amount: money(units) })
  })

  /** Paystack calls this when a card payment succeeds. Signed with the Paystack secret key. */
  app.post('/v1/paystack/webhook', async (c) => {
    await funding.webhook(await c.req.text(), c.req.header('x-paystack-signature'))
    return c.json({ ok: true })
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

  // ---------------------------------------------------------------- team
  owner.get('/members', async (c) => {
    sessionOnly(c)
    return c.json({ ...(await team.list(c.var.owner)), you: c.var.member?.role ?? 'owner' })
  })
  owner.post('/members', async (c) => {
    sessionOnly(c)
    return c.json(await team.invite(c.var.owner, c.var.actor, await body<{ email?: unknown; role?: unknown }>(c)), 201)
  })
  owner.patch('/members/:id', async (c) => {
    sessionOnly(c)
    return c.json(await team.setRole(c.var.owner, c.req.param('id'), (await body<{ role?: unknown }>(c)).role))
  })
  owner.delete('/members/:id', async (c) => {
    sessionOnly(c)
    await team.remove(c.var.owner, c.req.param('id'))
    return c.json({ ok: true })
  })
  /** The signed-in person's invitations and teams, whichever account they're looking at. */
  owner.get('/memberships', async (c) => {
    sessionOnly(c)
    return c.json(await team.memberships(c.var.actor))
  })
  owner.post('/memberships/:id/accept', async (c) => {
    sessionOnly(c)
    await team.accept(c.var.actor, c.req.param('id'))
    return c.json({ ok: true })
  })
  owner.post('/memberships/:id/leave', async (c) => {
    sessionOnly(c)
    await team.leave(c.var.actor, c.req.param('id'))
    return c.json({ ok: true })
  })

  // ---------------------------------------------------------------- account
  owner.get('/sessions', async (c) => {
    sessionOnly(c)
    const row = await db
      .prepare('select count(*) as n from sessions where address = ? and expires_at >= ?')
      .get<{ n: number }>(c.var.owner, now())
    return c.json({ active: Number(row?.n ?? 0) })
  })
  // Signs this account out on every device, this one included.
  owner.post('/sessions/revoke', async (c) => {
    sessionOnly(c)
    await db.prepare('delete from sessions where address = ?').run(c.var.owner)
    return c.json({ ok: true })
  })

  owner.get('/usage', async (c) => {
    const requested = Number(c.req.query('days'))
    const days = usageRanges.find((range) => range === requested) ?? 14
    return c.json(await usage(db, c.var.owner, days, money, now()))
  })

  const accountKinds = ['owner', 'developer'] as const
  type AccountKind = (typeof accountKinds)[number]
  /** The account's kind. Accounts from before kinds existed: developer if they made keys or webhooks. */
  async function accountKind(owner: string): Promise<AccountKind> {
    const profile = await db.prepare('select kind from profiles where owner = ?').get<{ kind: AccountKind }>(owner)
    if (profile) return profile.kind
    const built = await db
      .prepare('select (select count(*) from api_keys where owner = ?) + (select count(*) from webhooks where owner = ?) as n')
      .get<{ n: number }>(owner, owner)
    return Number(built?.n ?? 0) > 0 ? 'developer' : 'owner'
  }
  async function setAccountKind(owner: string, kind: unknown) {
    if (!accountKinds.includes(kind as AccountKind)) {
      throw new HTTPException(400, { message: `kind must be one of: ${accountKinds.join(', ')}` })
    }
    await db
      .prepare('insert into profiles (owner, kind, updated_at) values (?, ?, ?) on conflict (owner) do update set kind = excluded.kind, updated_at = excluded.updated_at')
      .run(owner, kind as AccountKind, now())
    return kind as AccountKind
  }

  owner.get('/me', async (c) => {
    const wallets = await db.prepare('select * from wallets where owner = ? order by created_at').all(c.var.owner)
    const user = await db.prepare('select provider, email, name, avatar from users where subject = ?').get(c.var.owner)
    // A teammate sees the account's wallets, and who they are in it.
    const member = c.var.member ? { ...c.var.member, actor: c.var.actor } : null
    return c.json({
      address: c.var.owner,
      user: user ?? { provider: 'freighter' },
      wallets,
      member,
      kind: await accountKind(c.var.owner),
      /** False until the owner picks a kind, so the dashboard can take it from where they arrived. */
      kindChosen: !!(await db.prepare('select 1 as one from profiles where owner = ?').get(c.var.owner)),
    })
  })

  /** Switches between the owner dashboard and the developer console. Owner only. */
  owner.put('/account', async (c) => {
    sessionOnly(c)
    const input = await body<{ kind?: unknown }>(c)
    return c.json({ kind: await setAccountKind(c.var.owner, input.kind) })
  })

  /** This month's agent payments and the fee they'd carry (charged on mainnet only). */
  owner.get('/billing', async (c) =>
    c.json(await billing(db, c.var.owner, now(), money, config.network.name === 'mainnet')),
  )

  /** Only the account owner, signed in: never a teammate or an API key. */
  const accountOwnerOnly = (c: Context<{ Variables: OwnerVariables }>) => {
    sessionOnly(c)
    if (c.var.member) throw new HTTPException(403, { message: 'Only the account owner can do this' })
  }

  owner.post('/wallets', async (c) => {
    accountOwnerOnly(c)
    const input = await body<WalletRequest>(c).catch(() => ({}) as WalletRequest)
    await wallets.assertCanCreate(c.var.owner)
    // On mainnet the first wallet is paid for by card first (see /v1/activation),
    // unless the admin approved this account without a deposit.
    if (funding.activation && !(await wallets.depositWaived(c.var.owner))) {
      throw new HTTPException(402, {
        message: `Activate your wallet with a ${funding.activation.usdc} USDC card top-up first. It goes into your wallet.`,
      })
    }
    return c.json(await wallets.deploy(c.var.owner, input), 201)
  })

  // ------------------------------------------------------------ live access
  // While LIVE_ACCESS is invite, accounts ask here and an admin approves them.

  /** Whether this account must pay the activation top-up before its wallet is created. */
  const depositRequired = async (owner: string) => !!funding.activation && !(await wallets.depositWaived(owner))

  owner.get('/access', async (c) => {
    const deposit = await depositRequired(c.var.owner)
    if (await wallets.hasAccess(c.var.owner)) return c.json({ mode: config.access, status: 'approved', deposit })
    const row = await db
      .prepare('select status, created_at from access where subject = ? order by created_at desc limit 1')
      .get<{ status: string; created_at: number }>(c.var.owner)
    return c.json({ mode: config.access, status: row?.status ?? 'none', requestedAt: row?.created_at ?? null, deposit })
  })

  owner.post('/access', async (c) => {
    accountOwnerOnly(c)
    if (await wallets.hasAccess(c.var.owner)) return c.json({ mode: config.access, status: 'approved' })
    const input = await body<{ note?: unknown; email?: unknown }>(c).catch(() => ({}) as { note?: unknown; email?: unknown })
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : ''
    const given = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    const email = (await emailOf(db, c.var.owner)) ?? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(given) ? given : null)
    const existing = await db
      .prepare("select id from access where subject = ? and status = 'requested'")
      .get<{ id: string }>(c.var.owner)
    if (existing) {
      await db.prepare('update access set note = ?, email = coalesce(?, email) where id = ?').run(note, email, existing.id)
    } else {
      await db
        .prepare("insert into access (id, subject, email, note, status, created_at) values (?, ?, ?, ?, 'requested', ?)")
        .run(newId('acc'), c.var.owner, email, note, now())
    }
    return c.json({ mode: config.access, status: 'requested' }, 201)
  })

  // ------------------------------------------------------------- activation

  owner.get('/activation', async (c) => c.json({ activation: await funding.latestActivation(c.var.owner) }))

  /** Starts the card checkout that pays for, and funds, the first wallet. */
  owner.post('/activation', async (c) => {
    accountOwnerOnly(c)
    const input = await body<{ wallet?: WalletRequest; email?: string }>(c)
    const email = (input.email ?? (await emailOf(db, c.var.owner)) ?? '').trim()
    return c.json(await funding.startActivation({ owner: c.var.owner, email, request: input.wallet ?? {} }), 201)
  })

  /** Called when the owner returns from checkout: confirms with Paystack, then deploys and funds the wallet once. */
  owner.post('/activation/:reference/confirm', async (c) => {
    const row = await db
      .prepare('select owner from activations where reference = ?')
      .get<{ owner: string }>(c.req.param('reference'))
    if (!row || row.owner !== c.var.owner) throw new HTTPException(404, { message: 'No such activation' })
    return c.json(await funding.confirmActivation(c.req.param('reference')))
  })

  owner.get('/wallets/:id', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const agents = await db
      .prepare("select * from agents where wallet_id = ? and status != 'removed' order by created_at")
      .all(wallet.id) as AgentDbRow[]
    const [balance, xlm, remaining] = await Promise.all([
      balanceOf(wallet.id),
      balanceOf(wallet.id, xlmToken),
      Promise.all(agents.map(remainingOf)),
    ])
    return c.json({
      ...wallet,
      token: chain.network.token,
      balance: money(balance),
      // XLM sent by mistake: agents can't spend it, the owner can withdraw it. Both have 7 decimals.
      xlmBalance: fromBaseUnits(xlm, 7),
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
    const input = await body<{ to?: string; amount: string; asset?: 'usdc' | 'xlm' }>(c)
    const fallback = StrKey.isValidEd25519PublicKey(c.var.owner) ? c.var.owner : undefined
    const to = addressOf(input.to ?? fallback, 'to')
    const xlm = input.asset === 'xlm'
    const units = amountOf(input.amount, 'amount', xlm ? 7 : decimals)
    return c.json(
      await createIntent(
        db,
        chain,
        c.var.owner,
        wallet,
        'withdraw',
        walletOps.withdraw(wallet.id, xlm ? xlmToken : chain.network.token, to, units),
        // Funds history is in USDC, so an XLM withdrawal isn't listed there (no wallet on the intent).
        xlm ? { to, amount: units, asset: 'xlm' } : { to, amount: units, wallet: wallet.id, owner: wallet.owner },
      ),
    )
  })

  // ---------------------------------------------------------------- funds

  owner.get('/wallets/:id/funds', async (c) => {
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    return c.json({ funds: await funding.list(wallet.id), card: funding.card })
  })

  /** Starts a card top-up: returns Paystack's checkout URL. */
  owner.post('/wallets/:id/topups', async (c) => {
    sessionOnly(c)
    const wallet = await ownedWallet(c.var.owner, c.req.param('id'))
    const input = await body<{ amount?: string; email?: string }>(c)
    const user = await db.prepare('select email from users where subject = ?').get<{ email: string | null }>(c.var.owner)
    const fromSubject = c.var.owner.startsWith('email:') ? c.var.owner.slice(6) : undefined
    const email = (input.email ?? user?.email ?? fromSubject ?? '').trim()
    return c.json(await funding.startCard({ wallet: wallet.id, owner: wallet.owner, units: amountOf(input.amount, 'amount', decimals), email }))
  })

  /** Called when the owner returns from checkout: confirms with Paystack and credits the wallet once. */
  owner.post('/topups/:reference/confirm', async (c) => {
    const row = await db.prepare('select wallet_id from funds where reference = ?').get<{ wallet_id: string }>(c.req.param('reference'))
    if (!row) throw new HTTPException(404, { message: 'No such top-up' })
    await ownedWallet(c.var.owner, row.wallet_id)
    return c.json(await funding.confirm(c.req.param('reference')))
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

  // ---------------------------------------------------------------- services

  /** Checks a listing and returns what to store. With `existing`, fields left out keep their value (an edit). */
  const serviceInput = (input: Record<string, unknown>, existing?: ServiceRow) => {
    const text = (field: string, max: number, fallback?: string) => {
      const value = input[field] === undefined ? fallback : String(input[field]).trim()
      if (!value) throw new HTTPException(400, { message: `${field} is required` })
      if (value.length > max) throw new HTTPException(400, { message: `${field} can be at most ${max} characters` })
      return value
    }
    let parsed: URL
    try {
      parsed = new URL(text('url', 300, existing?.url))
    } catch (error) {
      if (error instanceof HTTPException) throw error
      throw new HTTPException(400, { message: 'url must be a full address, like https://api.example.com/search' })
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && config.network.name === 'testnet')) {
      throw new HTTPException(400, { message: 'url must use https' })
    }
    const category = text('category', 40, existing?.category ?? 'Other')
    if (!serviceCategories.includes(category)) {
      throw new HTTPException(400, { message: `category must be one of: ${serviceCategories.join(', ')}` })
    }
    return {
      name: text('name', 80, existing?.name),
      description: input.description === undefined ? (existing?.description ?? '') : String(input.description).trim().slice(0, 300),
      category,
      url: parsed.toString(),
      payTo: addressOf(input.payTo ?? existing?.pay_to, 'payTo'),
      price: fromBaseUnits(amountOf(input.price ?? existing?.price, 'price', decimals), decimals),
      unit: text('unit', 20, existing?.unit ?? 'call'),
    }
  }

  const ownedService = async (ownerAddress: string, id: string) => {
    const row = await db.prepare('select * from services where id = ? and owner = ?').get<ServiceRow>(id, ownerAddress)
    if (!row) throw new HTTPException(404, { message: 'No such listing' })
    return row
  }

  const serviceById = async (id: string) => (await serviceViews([(await db.prepare('select * from services where id = ?').get<ServiceRow>(id))!]))[0]

  owner.get('/services/mine', async (c) => {
    const rows = await db.prepare('select * from services where owner = ? order by created_at desc').all(c.var.owner) as ServiceRow[]
    return c.json({ services: await serviceViews(rows), categories: serviceCategories })
  })

  owner.post('/services', async (c) => {
    sessionOnly(c)
    const count = await db.prepare('select count(*) as n from services where owner = ?').get<{ n: number }>(c.var.owner)
    if (Number(count?.n ?? 0) >= 20) throw new HTTPException(429, { message: 'At most 20 listings per account' })
    const service = serviceInput(await body<Record<string, unknown>>(c))
    const id = newId('svc')
    await db.prepare(
      'insert into services (id, name, description, category, url, pay_to, price, unit, owner, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, service.name, service.description, service.category, service.url, service.payTo, service.price, service.unit, c.var.owner, now())
    return c.json(await serviceById(id), 201)
  })

  owner.patch('/services/:id', async (c) => {
    sessionOnly(c)
    const existing = await ownedService(c.var.owner, c.req.param('id'))
    const service = serviceInput(await body<Record<string, unknown>>(c), existing)
    await db.prepare(
      'update services set name = ?, description = ?, category = ?, url = ?, pay_to = ?, price = ?, unit = ? where id = ?',
    ).run(service.name, service.description, service.category, service.url, service.payTo, service.price, service.unit, existing.id)
    return c.json(await serviceById(existing.id))
  })

  owner.delete('/services/:id', async (c) => {
    sessionOnly(c)
    const existing = await ownedService(c.var.owner, c.req.param('id'))
    await db.prepare('delete from services where id = ?').run(existing.id)
    return c.json({ ok: true })
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
