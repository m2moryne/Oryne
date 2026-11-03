import { randomBytes } from 'node:crypto'
import { base64url, buildTx, deployWalletOp, prepareSignSubmit, publicKeyFromSpki } from '@oryne/core'
import { hash, StrKey } from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * Creating agent wallets: who may, and deploying one. Deploying costs the
 * sponsor real XLM on mainnet, so this is where access, the one-wallet rule
 * and the daily fee cap are enforced.
 */

export const accountKinds = ['owner', 'developer'] as const
export type AccountKind = (typeof accountKinds)[number]

/** What the dashboard sends to create a wallet. Also stored with a pending activation. */
export type WalletRequest = { name?: string; kind?: string; passkey?: { publicKey: string; credentialId: string } }

type WalletOwner = { address: string } | { passkey: Uint8Array }

/** Checks a wallet request and works out who will own the wallet. Throws 400 on bad input. */
export function checkRequest(owner: string, input: WalletRequest): WalletOwner {
  if (input.kind !== undefined && !accountKinds.includes(input.kind as AccountKind)) {
    throw new HTTPException(400, { message: `kind must be one of: ${accountKinds.join(', ')}` })
  }
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 80)) {
    throw new HTTPException(400, { message: 'name must be text of at most 80 characters' })
  }
  // Freighter users own their wallet with their account; everyone else with a passkey.
  if (input.passkey) {
    let key: Uint8Array
    try {
      const raw = base64url.decode(input.passkey.publicKey)
      key = raw.length === 65 ? raw : publicKeyFromSpki(raw)
    } catch {
      throw new HTTPException(400, { message: 'passkey.publicKey must be a P-256 key (SPKI or 65-byte raw), base64url' })
    }
    if (!input.passkey.credentialId) throw new HTTPException(400, { message: 'passkey.credentialId is required' })
    return { passkey: key }
  }
  if (StrKey.isValidEd25519PublicKey(owner)) return { address: owner }
  throw new HTTPException(400, { message: 'Create a passkey to own your wallet' })
}

/** The account's email, lower-cased: from Google/GitHub, or the address an email sign-in used. */
export async function emailOf(db: Db, owner: string) {
  const user = await db.prepare('select email from users where subject = ?').get<{ email: string | null }>(owner)
  const email = user?.email ?? (owner.startsWith('email:') ? owner.slice(6) : null)
  return email ? email.toLowerCase() : null
}

export function createWallets(config: Config, db: Db, chain: Chain) {
  /** Whether this account may create a wallet on this server (LIVE_ACCESS). */
  async function hasAccess(owner: string) {
    if (config.access === 'open') return true
    const approved = await db
      .prepare(
        "select 1 as one from access where status = 'approved' and (subject = ? or (email is not null and email = ?))",
      )
      .get(owner, (await emailOf(db, owner)) ?? null)
    return !!approved
  }

  /** Whether an approval for this account waives the activation top-up. */
  async function depositWaived(owner: string) {
    const row = await db
      .prepare(
        "select 1 as one from access where status = 'approved' and no_deposit = 1 and (subject = ? or (email is not null and email = ?))",
      )
      .get(owner, (await emailOf(db, owner)) ?? null)
    return !!row
  }

  /**
   * Everything that must hold before a wallet is deployed for `owner`:
   * access, one wallet per account (unless MULTIPLE_WALLETS), and the
   * sponsor's fee allowance for today.
   */
  async function assertCanCreate(owner: string) {
    if (!(await hasAccess(owner))) {
      throw new HTTPException(403, { message: 'Live mode is invite-only for now. Ask for access from the dashboard.' })
    }
    if (!config.multipleWallets) {
      const existing = await db.prepare('select 1 as one from wallets where owner = ?').get(owner)
      if (existing) throw new HTTPException(409, { message: 'This account already has a wallet' })
    }
    await chain.budget.check()
  }

  /** Deploys a wallet contract for `owner`, paid by the sponsor, and records it. */
  async function deploy(owner: string, input: WalletRequest) {
    const walletOwner = checkRequest(owner, input)
    await chain.budget.check()
    const salt = hash(Buffer.concat([Buffer.from(owner), randomBytes(16)]))
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
    await chain.budget.spent(result.feeCharged)
    const id = String(result.returnValue)
    const ownerKind = 'passkey' in walletOwner ? 'passkey' : 'account'
    await db.prepare('insert into wallets (id, owner, owner_kind, name, tx_hash, created_at) values (?, ?, ?, ?, ?, ?)').run(
      id,
      owner,
      ownerKind,
      input.name?.trim() || 'My wallet',
      result.hash,
      now(),
    )
    if ('passkey' in walletOwner) {
      await db.prepare(
        'insert into passkeys (credential_id, subject, wallet_id, public_key, created_at) values (?, ?, ?, ?, ?)',
      ).run(input.passkey!.credentialId, owner, id, Buffer.from(walletOwner.passkey).toString('hex'), now())
    }
    if (input.kind) {
      await db
        .prepare(
          'insert into profiles (owner, kind, updated_at) values (?, ?, ?) on conflict (owner) do update set kind = excluded.kind, updated_at = excluded.updated_at',
        )
        .run(owner, input.kind, now())
    }
    return { id, hash: result.hash, ledger: result.ledger }
  }

  return { hasAccess, depositWaived, assertCanCreate, deploy }
}

export type Wallets = ReturnType<typeof createWallets>
