import { buildTx, StellarError, submitSigned } from '@oryne/core'
import { TransactionBuilder, type Transaction, type xdr } from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * Owner actions that change the wallet on-chain (add an agent, approve a
 * payment, withdraw…) are "intents": the API builds and simulates the
 * transaction, the owner's wallet signs it, and the API submits it and
 * records the effect once it lands. The API never holds the owner's key.
 */

export type IntentKind = 'add_agent' | 'set_policy' | 'set_paused' | 'remove_agent' | 'approve_once' | 'withdraw'

export type Intent = {
  id: string
  kind: IntentKind
  /** Base64 transaction envelope for the owner to sign. */
  xdr: string
  networkPassphrase: string
}

export async function createIntent(
  db: Db,
  chain: Chain,
  owner: string,
  kind: IntentKind,
  operation: xdr.Operation,
  data: Record<string, unknown>,
): Promise<Intent> {
  let prepared: Transaction
  try {
    const tx = await buildTx(chain.rpc, chain.network, owner, operation, 600)
    prepared = await chain.rpc.prepareTransaction(tx)
  } catch (error) {
    const message = String((error as Error).message ?? error)
    if (message.includes('Account not found')) {
      throw new HTTPException(400, { message: 'Your account has no XLM yet. Fund it (testnet: friendbot) and try again.' })
    }
    throw new HTTPException(400, { message: new StellarError('Could not prepare the transaction', message).message })
  }
  const id = newId('int')
  const envelope = prepared.toXDR()
  db.prepare('insert into intents (id, owner, kind, data, xdr, created_at) values (?, ?, ?, ?, ?, ?)').run(
    id,
    owner,
    kind,
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    envelope,
    now(),
  )
  return { id, kind, xdr: envelope, networkPassphrase: chain.network.networkPassphrase }
}

type IntentRow = { id: string; owner: string; kind: IntentKind; data: string; xdr: string; status: string }

/** Submits the owner-signed transaction for an intent, then applies its effect to the database. */
export async function submitIntent(db: Db, chain: Chain, owner: string, id: string, signedXdr: string) {
  const row = db.prepare('select * from intents where id = ? and owner = ?').get(id, owner) as IntentRow | undefined
  if (!row) throw new HTTPException(404, { message: 'No such intent' })
  if (row.status !== 'pending') throw new HTTPException(409, { message: `Intent already ${row.status}` })

  const signed = TransactionBuilder.fromXDR(signedXdr, chain.network.networkPassphrase) as Transaction
  const original = TransactionBuilder.fromXDR(row.xdr, chain.network.networkPassphrase) as Transaction
  // The owner may only add signatures, not change the transaction.
  if (Buffer.compare(signed.hash(), original.hash()) !== 0) {
    throw new HTTPException(400, { message: 'Signed transaction does not match the intent' })
  }

  try {
    const result = await submitSigned(chain.rpc, signed)
    db.prepare("update intents set status = 'submitted', tx_hash = ? where id = ?").run(result.hash, id)
    applyEffect(db, row.kind, JSON.parse(row.data), result.hash)
    return { hash: result.hash, ledger: result.ledger }
  } catch (error) {
    const message = String((error as Error).message ?? error)
    db.prepare("update intents set status = 'failed', error = ? where id = ?").run(message, id)
    throw new HTTPException(502, { message })
  }
}

function applyEffect(db: Db, kind: IntentKind, data: Record<string, any>, txHash: string) {
  switch (kind) {
    case 'add_agent':
      db.prepare(
        `insert into agents (public_key, wallet_id, name, kind, per_tx, budget, window_secs, expires_at, payees, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        data.agent,
        data.wallet,
        data.name,
        data.kind,
        data.perTx,
        data.budget,
        data.windowSecs,
        data.expiresAt,
        JSON.stringify(data.payees),
        now(),
      )
      break
    case 'set_policy':
      db.prepare(
        'update agents set per_tx = ?, budget = ?, window_secs = ?, expires_at = ?, payees = ? where public_key = ?',
      ).run(data.perTx, data.budget, data.windowSecs, data.expiresAt, JSON.stringify(data.payees), data.agent)
      break
    case 'set_paused':
      db.prepare('update agents set status = ? where public_key = ?').run(data.paused ? 'paused' : 'active', data.agent)
      break
    case 'remove_agent':
      db.prepare("update agents set status = 'removed' where public_key = ?").run(data.agent)
      break
    case 'approve_once':
      db.prepare("update approvals set status = 'approved', tx_hash = ?, resolved_at = ? where id = ?").run(
        txHash,
        now(),
        data.approval,
      )
      break
    case 'withdraw':
      break
  }
}
