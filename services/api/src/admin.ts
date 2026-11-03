import { createHash, timingSafeEqual } from 'node:crypto'
import { fromBaseUnits, networkId } from '@oryne/core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * The admin API behind the separate admin site: read-only views across every
 * account, plus deciding who may create a wallet while LIVE_ACCESS is invite.
 * It exists only when ADMIN_TOKEN is set; callers send it as a bearer token.
 * Failed attempts are limited per address so the token can't be guessed.
 */

const MIN_TOKEN = 32
const FAILURE_LIMIT = 10
const FAILURE_WINDOW = 15 * 60_000
const DAY = 86_400

const digest = (value: string) => createHash('sha256').update(value).digest()

export function adminApi(config: Config, db: Db, chain: Chain) {
  const token = config.adminToken
  if (!token) return null
  if (token.length < MIN_TOKEN) throw new Error(`ADMIN_TOKEN must be at least ${MIN_TOKEN} characters`)
  const expected = digest(token)
  const failures = new Map<string, number[]>()
  const money = (units: string | number | bigint) => fromBaseUnits(BigInt(units), chain.network.decimals)
  const limitOf = (value: string | undefined, fallback = 100) => Math.min(Math.max(Number(value) || fallback, 1), 500)

  const admin = new Hono()

  admin.use('*', async (c, next) => {
    const address = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const recent = (failures.get(address) ?? []).filter((at) => at > Date.now() - FAILURE_WINDOW)
    if (recent.length >= FAILURE_LIMIT) throw new HTTPException(429, { message: 'Too many failed attempts. Try again later.' })
    const given = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    // Compare digests, so the check takes the same time whatever was sent.
    if (!timingSafeEqual(digest(given), expected)) {
      failures.set(address, [...recent, Date.now()])
      throw new HTTPException(401, { message: 'Wrong admin token' })
    }
    failures.delete(address)
    await next()
  })

  admin.get('/overview', async (c) => {
    const count = async (sql: string, ...params: Array<string | number>) =>
      Number((await db.prepare(sql).get<{ n: number }>(...params))?.n ?? 0)
    const since = now() - DAY
    const settled = await db
      .prepare("select amount from payments where status = 'settled'")
      .all<{ amount: string }>()
    const volume = settled.reduce((total, row) => total + BigInt(row.amount), 0n)
    return c.json({
      accounts: await count(
        'select count(*) as n from (select owner as subject from wallets union select subject from users) as everyone',
      ),
      wallets: await count('select count(*) as n from wallets'),
      agents: await count("select count(*) as n from agents where status != 'removed'"),
      payments: {
        settled: settled.length,
        refused: await count("select count(*) as n from payments where status = 'refused'"),
        failed: await count("select count(*) as n from payments where status = 'failed'"),
        volume: money(volume),
      },
      approvalsPending: await count("select count(*) as n from approvals where status = 'pending'"),
      apiKeysActive: await count('select count(*) as n from api_keys where revoked_at is null'),
      requests24h: await count('select count(*) as n from requests where created_at >= ?', since),
      errors24h: await count('select count(*) as n from requests where created_at >= ? and status >= 400', since),
      newAccounts24h: await count('select count(*) as n from users where created_at >= ?', since),
    })
  })

  admin.get('/accounts', async (c) => {
    const q = `%${(c.req.query('q') ?? '').toLowerCase()}%`
    // Everyone who has signed in with Google/GitHub, plus Freighter owners (known by their wallets).
    const rows = await db
      .prepare(
        `select everyone.subject, u.provider, u.email, u.name, everyone.first_seen,
           (select count(*) from wallets w where w.owner = everyone.subject) as wallets,
           (select count(*) from api_keys k where k.owner = everyone.subject and k.revoked_at is null) as api_keys,
           (select max(r.created_at) from requests r where r.owner = everyone.subject) as last_seen
         from (
           select subject, min(created_at) as first_seen from (
             select subject, created_at from users
             union all
             select owner as subject, created_at from wallets
           ) as seen group by subject
         ) as everyone
         left join users u on u.subject = everyone.subject
         where lower(everyone.subject || ' ' || coalesce(u.email, '') || ' ' || coalesce(u.name, '')) like ?
         order by everyone.first_seen desc limit ${limitOf(c.req.query('limit'))}`,
      )
      .all(q)
    return c.json({
      accounts: rows.map((row) => ({
        subject: row.subject,
        provider: row.provider ?? (String(row.subject).startsWith('G') ? 'freighter' : 'unknown'),
        email: row.email,
        name: row.name,
        wallets: Number(row.wallets),
        apiKeys: Number(row.api_keys),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      })),
    })
  })

  admin.get('/wallets', async (c) => {
    const rows = await db
      .prepare(
        `select w.*, (select count(*) from agents a where a.wallet_id = w.id and a.status != 'removed') as agents,
           (select count(*) from payments p where p.wallet_id = w.id) as payments
         from wallets w order by w.created_at desc limit ${limitOf(c.req.query('limit'))}`,
      )
      .all()
    return c.json({
      wallets: rows.map((row) => ({
        id: row.id,
        name: row.name,
        owner: row.owner,
        ownerKind: row.owner_kind,
        agents: Number(row.agents),
        payments: Number(row.payments),
        txHash: row.tx_hash,
        createdAt: row.created_at,
      })),
    })
  })

  admin.get('/agents', async (c) => {
    const rows = await db
      .prepare(
        `select a.*, w.owner from agents a join wallets w on w.id = a.wallet_id
         order by a.created_at desc limit ${limitOf(c.req.query('limit'))}`,
      )
      .all()
    return c.json({
      agents: rows.map((row) => ({
        publicKey: row.public_key,
        name: row.name,
        kind: row.kind,
        status: row.status,
        wallet: row.wallet_id,
        owner: row.owner,
        perTx: money(row.per_tx),
        budget: money(row.budget),
        windowDays: Number(row.window_secs) / DAY,
        createdAt: row.created_at,
      })),
    })
  })

  admin.get('/payments', async (c) => {
    const status = c.req.query('status')
    const where = status && ['settled', 'refused', 'failed'].includes(status) ? 'where status = ?' : ''
    const rows = await db
      .prepare(`select * from payments ${where} order by created_at desc limit ${limitOf(c.req.query('limit'))}`)
      .all(...(where ? [status!] : []))
    return c.json({
      payments: rows.map((row) => ({
        id: row.id,
        wallet: row.wallet_id,
        agent: row.agent,
        payee: row.payee,
        amount: money(row.amount),
        resource: row.resource,
        status: row.status,
        reason: row.reason,
        txHash: row.tx_hash,
        createdAt: row.created_at,
      })),
    })
  })

  admin.get('/requests', async (c) => {
    const errorsOnly = c.req.query('status') === 'error'
    const rows = await db
      .prepare(
        `select * from requests ${errorsOnly ? 'where status >= 400' : ''}
         order by created_at desc, id desc limit ${limitOf(c.req.query('limit'))}`,
      )
      .all()
    return c.json({
      requests: rows.map((row) => ({
        id: row.id,
        owner: row.owner,
        actorKind: row.actor_kind,
        method: row.method,
        path: row.path,
        status: row.status,
        latencyMs: row.latency_ms,
        error: row.error,
        createdAt: row.created_at,
      })),
    })
  })

  admin.get('/keys', async (c) => {
    const rows = await db
      .prepare(`select * from api_keys order by created_at desc limit ${limitOf(c.req.query('limit'))}`)
      .all()
    // Metadata only: key hashes never leave the API.
    return c.json({
      keys: rows.map((row) => ({
        id: row.id,
        owner: row.owner,
        name: row.name,
        mode: row.mode,
        masked: `oryne_${row.mode}_sk_••••••••${row.last4}`,
        scopes: JSON.parse(row.scopes),
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
      })),
    })
  })

  // ---------------------------------------------------------------- access

  admin.get('/access', async (c) => {
    const status = c.req.query('status')
    const rows = await db
      .prepare(
        `select a.*, u.name, u.provider,
           (select count(*) from wallets w where w.owner = a.subject) as wallets
         from access a left join users u on u.subject = a.subject
         ${status ? 'where a.status = ?' : ''}
         order by case a.status when 'requested' then 0 else 1 end, a.created_at desc
         limit ${limitOf(c.req.query('limit'), 200)}`,
      )
      .all(...(status ? [status] : []))
    return c.json({
      mode: config.access,
      entries: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        email: row.email,
        name: row.name ?? null,
        provider: row.provider ?? (row.subject && String(row.subject).startsWith('G') ? 'freighter' : null),
        note: row.note,
        status: row.status,
        noDeposit: Number(row.no_deposit ?? 0) === 1,
        wallets: Number(row.wallets ?? 0),
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      })),
    })
  })

  /** Lets an email in before they ask: any sign-in with that email may create a wallet. */
  admin.post('/access', async (c) => {
    const input = (await c.req.json().catch(() => ({}))) as { email?: unknown; noDeposit?: unknown }
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    const noDeposit = input.noDeposit === true ? 1 : 0
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HTTPException(400, { message: 'A valid email is needed' })
    const existing = await db.prepare('select id from access where email = ? and subject is null').get<{ id: string }>(email)
    if (existing) {
      await db
        .prepare("update access set status = 'approved', no_deposit = ?, decided_at = ? where id = ?")
        .run(noDeposit, now(), existing.id)
    } else {
      await db
        .prepare("insert into access (id, email, status, no_deposit, created_at, decided_at) values (?, ?, 'approved', ?, ?, ?)")
        .run(newId('acc'), email, noDeposit, now(), now())
    }
    return c.json({ ok: true }, 201)
  })

  /**
   * approve, decline, or deposit. Approving with { noDeposit: true } lets them
   * create a wallet without the activation top-up; `deposit` with
   * { required: boolean } changes that later.
   */
  admin.post('/access/:id/:decision', async (c) => {
    const decision = c.req.param('decision')
    const input = (await c.req.json().catch(() => ({}))) as { noDeposit?: unknown; required?: unknown }
    const row = await db.prepare('select id from access where id = ?').get(c.req.param('id'))
    if (!row) throw new HTTPException(404, { message: 'No such entry' })
    if (decision === 'deposit') {
      if (typeof input.required !== 'boolean') throw new HTTPException(400, { message: 'required must be true or false' })
      await db.prepare('update access set no_deposit = ? where id = ?').run(input.required ? 0 : 1, c.req.param('id'))
      return c.json({ ok: true, noDeposit: !input.required })
    }
    const status = decision === 'approve' ? 'approved' : decision === 'decline' ? 'declined' : null
    if (!status) throw new HTTPException(404, { message: 'Not found' })
    if (status === 'approved') {
      await db
        .prepare('update access set status = ?, no_deposit = ?, decided_at = ? where id = ?')
        .run(status, input.noDeposit === true ? 1 : 0, now(), c.req.param('id'))
    } else {
      await db.prepare('update access set status = ?, decided_at = ? where id = ?').run(status, now(), c.req.param('id'))
    }
    return c.json({ ok: true, status })
  })

  /** Paid first wallets, newest first; `review` ones need a person. */
  admin.get('/activations', async (c) => {
    const rows = await db
      .prepare(`select * from activations order by created_at desc limit ${limitOf(c.req.query('limit'), 200)}`)
      .all()
    return c.json({
      activations: rows.map((row) => ({
        reference: row.reference,
        owner: row.owner,
        email: row.email,
        amount: money(row.amount),
        charge: { amount: (Number(row.charge_amount) / 100).toFixed(2), currency: row.charge_currency },
        status: row.status,
        walletId: row.wallet_id,
        error: row.error,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
    })
  })

  admin.get('/system', async (c) =>
    c.json({
      network: networkId(chain.network),
      rpcUrl: chain.network.rpcUrl,
      storage: config.databaseUrl ? 'postgres' : 'sqlite',
      sponsor: chain.sponsor.publicKey(),
      token: chain.network.token,
      walletWasmHash: chain.walletWasmHash.toString('hex'),
      publicUrl: config.publicUrl,
      webUrl: config.webUrl,
      corsOrigins: config.corsOrigins,
      features: {
        googleSignIn: !!config.oauth.google,
        githubSignIn: !!config.oauth.github,
        devLogin: config.devLogin,
        aiDebugger: !!config.deepseekApiKey,
      },
      access: config.access,
      activationUsdc: config.activationUsdc === '0' ? null : config.activationUsdc,
      multipleWallets: config.multipleWallets,
      /** Network fees the sponsor has paid today (UTC) and the daily cap, in XLM. */
      sponsorFees: await chain.budget.today(),
      startedAt,
    }),
  )

  return admin
}

const startedAt = Math.floor(Date.now() / 1000)
