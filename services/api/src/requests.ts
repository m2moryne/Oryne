import type { MiddlewareHandler } from 'hono'
import type { AgentRow } from './auth.ts'
import { newId, now, type Db } from './db.ts'

/**
 * Request logs: one row per authenticated API call, for the developer
 * console's Logs page, usage and the AI debugger. Bodies are never stored
 * (they can carry secrets); only who called what, the result and the error.
 */

const RETENTION = 30 * 86_400
/** Wallet contract IDs in a path, e.g. /v1/wallets/C…/agents. */
const WALLET_IN_PATH = /\/wallets\/(C[A-Z2-7]{55})/

export type RequestRow = {
  id: string
  owner: string
  wallet_id: string | null
  actor_kind: 'owner' | 'agent'
  actor: string | null
  method: string
  path: string
  status: number
  latency_ms: number
  error: string | null
  user_agent: string | null
  created_at: number
}

/**
 * Logs each request after it's handled. Mount after the auth middleware, so
 * the owner or agent is known. Gives every response an X-Request-Id.
 */
export function logRequests(db: Db, kind: 'owner' | 'agent'): MiddlewareHandler<any> {
  const ownerOfWallet = new Map<string, string>()

  return async (c, next) => {
    const id = newId('req')
    const started = performance.now()
    c.header('x-request-id', id)
    await next()

    try {
      let owner: string | undefined
      let walletId: string | null = null
      let actor: string | null = null
      if (kind === 'owner') {
        owner = c.get('owner') as string | undefined
        walletId = WALLET_IN_PATH.exec(c.req.path)?.[1] ?? null
      } else {
        const agent = c.get('agent') as AgentRow | undefined
        actor = agent?.public_key ?? null
        walletId = agent?.wallet_id ?? null
        if (walletId) {
          owner = ownerOfWallet.get(walletId)
          if (!owner) {
            owner = (await db.prepare('select owner from wallets where id = ?').get<{ owner: string }>(walletId))?.owner
            if (owner) ownerOfWallet.set(walletId, owner)
          }
        }
      }
      if (!owner) return

      let error: string | null = null
      if (c.res.status >= 400 && c.res.headers.get('content-type')?.includes('json')) {
        error = ((await c.res.clone().json().catch(() => ({}))) as { error?: string }).error ?? null
      }
      await db
        .prepare(
          `insert into requests (id, owner, wallet_id, actor_kind, actor, method, path, status, latency_ms, error, user_agent, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          owner,
          walletId,
          kind,
          actor,
          c.req.method,
          c.req.path,
          c.res.status,
          Math.round(performance.now() - started),
          error,
          c.req.header('user-agent')?.slice(0, 200) ?? null,
          now(),
        )
      // Now and then, drop rows past retention.
      if (Math.random() < 0.01) await db.prepare('delete from requests where created_at < ?').run(now() - RETENTION)
    } catch (error) {
      // Logging must never break the request it describes.
      console.error('request log', (error as Error).message)
    }
  }
}

/** An owner's logs, newest first. `before` is the last row seen (its created_at and id), for paging. */
export async function listRequests(
  db: Db,
  owner: string,
  options: { errorsOnly?: boolean; walletId?: string; before?: { createdAt: number; id: string }; limit?: number },
) {
  const where = ['owner = ?']
  const params: Array<string | number> = [owner]
  if (options.errorsOnly) where.push('status >= 400')
  if (options.walletId) {
    where.push('wallet_id = ?')
    params.push(options.walletId)
  }
  if (options.before) {
    where.push('(created_at < ? or (created_at = ? and id < ?))')
    params.push(options.before.createdAt, options.before.createdAt, options.before.id)
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  return db
    .prepare(`select * from requests where ${where.join(' and ')} order by created_at desc, id desc limit ${limit}`)
    .all<RequestRow>(...params)
}
