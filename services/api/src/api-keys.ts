import { createHash, randomBytes } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { newId, now, type Db } from './db.ts'

/**
 * API keys: secret keys an owner's own servers use to read their account.
 *
 * Keys are read-only by design. Anything that changes money or mandates is
 * signed by the owner's passkey or Freighter account, so a leaked key can
 * read data but never move funds or loosen a limit. Only a SHA-256 hash of
 * each key is stored; the full key is shown once, when it's created.
 */

export const scopes = ['wallets:read', 'payments:read', 'approvals:read', 'logs:read'] as const
export type Scope = (typeof scopes)[number]

export type KeyMode = 'test' | 'live'
export type ApiKeyRow = {
  id: string
  owner: string
  name: string
  mode: KeyMode
  last4: string
  key_hash: string
  scopes: string
  created_at: number
  last_used_at: number | null
  revoked_at: number | null
}

/** What a request authenticated with a key may do. */
export type KeyAccess = { id: string; scopes: Scope[] }

const MAX_ACTIVE = 20
const PREFIX = /^oryne_(test|live)_sk_[A-Za-z0-9]{32}$/

export const isApiKey = (token: string) => token.startsWith('oryne_')
const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex')

export const keyView = (row: ApiKeyRow) => ({
  id: row.id,
  name: row.name,
  mode: row.mode,
  /** For display only: oryne_test_sk_••••••••abcd */
  masked: `oryne_${row.mode}_sk_••••••••${row.last4}`,
  scopes: JSON.parse(row.scopes) as Scope[],
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
})

/** Base62, so keys are easy to copy and safe in headers and shells. */
function randomToken(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      // Rejection sampling keeps every character equally likely.
      if (byte < 248 && out.length < length) out += alphabet[byte % 62]
    }
  }
  return out
}

export async function createKey(db: Db, owner: string, mode: KeyMode, input: { name?: unknown; scopes?: unknown }) {
  const name = String(input.name ?? '').trim().slice(0, 60)
  if (!name) throw new HTTPException(400, { message: 'Give the key a name, e.g. "Production server"' })
  const requested = Array.isArray(input.scopes) ? input.scopes : []
  const chosen = scopes.filter((scope) => requested.includes(scope))
  if (chosen.length === 0) throw new HTTPException(400, { message: `Pick at least one permission: ${scopes.join(', ')}` })

  const active = await db
    .prepare('select count(*) as n from api_keys where owner = ? and revoked_at is null')
    .get<{ n: number }>(owner)
  if (Number(active?.n ?? 0) >= MAX_ACTIVE) {
    throw new HTTPException(409, { message: `You have ${MAX_ACTIVE} active keys. Revoke one first.` })
  }

  const secret = `oryne_${mode}_sk_${randomToken(32)}`
  const id = newId('key')
  await db
    .prepare(
      'insert into api_keys (id, owner, name, mode, last4, key_hash, scopes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, owner, name, mode, secret.slice(-4), hashOf(secret), JSON.stringify(chosen), now())
  const row = await db.prepare('select * from api_keys where id = ?').get<ApiKeyRow>(id)
  return { ...keyView(row!), secret }
}

export async function listKeys(db: Db, owner: string) {
  const rows = await db
    .prepare('select * from api_keys where owner = ? order by revoked_at is not null, created_at desc')
    .all<ApiKeyRow>(owner)
  return rows.map(keyView)
}

export async function revokeKey(db: Db, owner: string, id: string) {
  const row = await db.prepare('select * from api_keys where id = ? and owner = ?').get<ApiKeyRow>(id, owner)
  if (!row) throw new HTTPException(404, { message: 'No such key' })
  if (!row.revoked_at) await db.prepare('update api_keys set revoked_at = ? where id = ?').run(now(), id)
  return keyView({ ...row, revoked_at: row.revoked_at ?? now() })
}

/**
 * Resolves a bearer key to its owner, or throws. Keys of the other mode than
 * this server's network are refused, so a test key can't reach mainnet data.
 */
export async function authenticateKey(db: Db, secret: string, mode: KeyMode) {
  if (!PREFIX.test(secret)) throw new HTTPException(401, { message: 'That API key is malformed' })
  const row = await db.prepare('select * from api_keys where key_hash = ?').get<ApiKeyRow>(hashOf(secret))
  if (!row || row.revoked_at) throw new HTTPException(401, { message: 'That API key is unknown or revoked' })
  if (row.mode !== mode) {
    throw new HTTPException(401, { message: `This is a ${row.mode} key; this server runs in ${mode} mode` })
  }
  // Touch last_used_at at most once a minute, not on every call.
  if (!row.last_used_at || now() - row.last_used_at > 60) {
    await db.prepare('update api_keys set last_used_at = ? where id = ?').run(now(), row.id)
  }
  return { owner: row.owner, access: { id: row.id, scopes: JSON.parse(row.scopes) as Scope[] } satisfies KeyAccess }
}

/** The permission a key needs for a GET under /v1, or null if keys can't use it at all. */
export function scopeFor(path: string): Scope | null {
  const route = path.replace(/^\/v1/, '')
  if (route === '/me' || /^\/wallets\/[^/]+$/.test(route)) return 'wallets:read'
  if (/^\/wallets\/[^/]+\/payments$/.test(route)) return 'payments:read'
  if (route === '/approvals') return 'approvals:read'
  if (route === '/logs') return 'logs:read'
  return null
}

/** Throws unless a key may make this request. Keys only ever read. */
export function checkKeyAccess(access: KeyAccess, method: string, path: string) {
  if (method !== 'GET') {
    throw new HTTPException(403, {
      message: 'API keys are read-only. Changes to wallets and agents are signed by the owner in the dashboard.',
    })
  }
  const needed = scopeFor(path)
  if (!needed) throw new HTTPException(403, { message: 'API keys cannot use this endpoint' })
  if (!access.scopes.includes(needed)) throw new HTTPException(403, { message: `This key needs the ${needed} permission` })
}
