import { randomBytes } from 'node:crypto'
import { hash, Keypair, StrKey } from '@stellar/stellar-sdk'
import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { now, type Db } from './db.ts'

/**
 * Two kinds of caller:
 *
 * - Owners sign in by signing a one-time message with their Stellar wallet
 *   (SEP-53, which Freighter's signMessage implements) and get a session token.
 * - Agents sign each request with their own session key. Their secret never
 *   reaches the API; the API only knows public keys registered on a wallet.
 */

const CHALLENGE_TTL = 5 * 60
const SESSION_TTL = 7 * 24 * 3600
const AGENT_CLOCK_SKEW = 5 * 60

/** SEP-53: sha256("Stellar Signed Message:\n" + message) */
export const sep53Hash = (message: string) => hash(Buffer.from(`Stellar Signed Message:\n${message}`, 'utf8'))

export function createChallenge(db: Db, address: string, domain: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new HTTPException(400, { message: 'Sign-in with a message needs a G… account address' })
  }
  const nonce = randomBytes(16).toString('hex')
  const message = `${domain} wants you to sign in with your Stellar account:\n${address}\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`
  db.prepare('insert into challenges (nonce, address, message, expires_at) values (?, ?, ?, ?)').run(
    nonce,
    address,
    message,
    now() + CHALLENGE_TTL,
  )
  return { nonce, message }
}

export function verifyChallenge(db: Db, nonce: string, signature: string) {
  const row = db.prepare('select address, message, expires_at from challenges where nonce = ?').get(nonce) as
    | { address: string; message: string; expires_at: number }
    | undefined
  db.prepare('delete from challenges where nonce = ? or expires_at < ?').run(nonce, now())
  if (!row || row.expires_at < now()) throw new HTTPException(401, { message: 'Challenge expired, try again' })

  // Freighter returns base64; accept hex too.
  const raw = /^[0-9a-f]+$/i.test(signature) && signature.length === 128 ? Buffer.from(signature, 'hex') : Buffer.from(signature, 'base64')
  if (!Keypair.fromPublicKey(row.address).verify(sep53Hash(row.message), raw)) {
    throw new HTTPException(401, { message: 'Signature does not match the account' })
  }

  const token = randomBytes(32).toString('base64url')
  db.prepare('insert into sessions (token, address, expires_at) values (?, ?, ?)').run(token, row.address, now() + SESSION_TTL)
  return { token, address: row.address, expiresAt: now() + SESSION_TTL }
}

/** Requires an owner session. Sets c.var.owner. */
export const ownerAuth =
  (db: Db): MiddlewareHandler<{ Variables: { owner: string } }> =>
  async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const row = token
      ? (db.prepare('select address, expires_at from sessions where token = ?').get(token) as
          | { address: string; expires_at: number }
          | undefined)
      : undefined
    if (!row || row.expires_at < now()) throw new HTTPException(401, { message: 'Sign in first' })
    c.set('owner', row.address)
    await next()
  }

/** The message an agent signs to authenticate one request. */
export const agentMessage = (method: string, path: string, timestamp: number) =>
  `oryne-agent\n${method.toUpperCase()}\n${path}\n${timestamp}`

/**
 * Requires a registered agent. Header:
 *   X-Oryne-Agent: <public key>.<unix seconds>.<base64 ed25519 signature of agentMessage>
 */
export const agentAuth =
  (db: Db): MiddlewareHandler<{ Variables: { agent: AgentRow } }> =>
  async (c, next) => {
    c.set('agent', authenticateAgent(db, c))
    await next()
  }

export type AgentRow = { public_key: string; wallet_id: string; name: string; status: string }

export function authenticateAgent(db: Db, c: Context): AgentRow {
  const header = c.req.header('x-oryne-agent')
  const [publicKey, ts, signature] = header?.split('.') ?? []
  const timestamp = Number(ts)
  if (!publicKey || !signature || !Number.isFinite(timestamp)) {
    throw new HTTPException(401, { message: 'Missing X-Oryne-Agent header' })
  }
  if (Math.abs(now() - timestamp) > AGENT_CLOCK_SKEW) throw new HTTPException(401, { message: 'Agent clock is off' })
  if (!StrKey.isValidEd25519PublicKey(publicKey)) throw new HTTPException(401, { message: 'Bad agent key' })
  const path = new URL(c.req.url).pathname
  const valid = Keypair.fromPublicKey(publicKey).verify(
    Buffer.from(agentMessage(c.req.method, path, timestamp)),
    Buffer.from(signature, 'base64'),
  )
  if (!valid) throw new HTTPException(401, { message: 'Agent signature does not match' })
  const agent = db
    .prepare("select public_key, wallet_id, name, status from agents where public_key = ? and status != 'removed'")
    .get(publicKey) as AgentRow | undefined
  if (!agent) throw new HTTPException(401, { message: 'This agent key is not registered on any wallet' })
  return agent
}
