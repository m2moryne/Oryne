import {
  addressCredentialsOf,
  base64url,
  buildTx,
  compactSignature,
  passkeySignatureScVal,
  StellarError,
  submitSigned,
} from '@oryne/core'
import {
  Address,
  authorizeEntry,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * Owner actions that change the wallet on-chain (add an agent, approve a
 * payment, withdraw…) are "intents". The API prepares them; the owner signs;
 * the API submits and records the effect once it lands. Two ways to sign:
 *
 * - envelope: Freighter owners sign the whole transaction, as its source.
 * - passkey:  the sponsor is the transaction source and pays the fee; the
 *   owner's passkey signs only the wallet's authorization entry. The user
 *   needs no XLM and no extension.
 *
 * Either way the API never holds the owner's key.
 */

export type IntentKind = 'add_agent' | 'set_policy' | 'set_paused' | 'remove_agent' | 'approve_once' | 'withdraw'

export type Intent =
  | { id: string; kind: IntentKind; mode: 'envelope'; xdr: string; networkPassphrase: string }
  | { id: string; kind: IntentKind; mode: 'passkey'; challenge: string; credentialIds: string[] }

export type WalletOwnership = { id: string; owner_kind: string }

/** ~10 minutes to approve with the passkey. */
const PASSKEY_VALID_LEDGERS = 120

const stringify = (data: Record<string, unknown>) =>
  JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))

export async function createIntent(
  db: Db,
  chain: Chain,
  owner: string,
  wallet: WalletOwnership,
  kind: IntentKind,
  operation: xdr.Operation,
  data: Record<string, unknown>,
): Promise<Intent> {
  const id = newId('int')
  if (wallet.owner_kind === 'passkey') return createPasskeyIntent(db, chain, owner, wallet, id, kind, operation, data)

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
  const envelope = prepared.toXDR()
  await db.prepare('insert into intents (id, owner, kind, data, xdr, mode, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    owner,
    kind,
    stringify(data),
    envelope,
    'envelope',
    now(),
  )
  return { id, kind, mode: 'envelope', xdr: envelope, networkPassphrase: chain.network.networkPassphrase }
}

async function createPasskeyIntent(
  db: Db,
  chain: Chain,
  owner: string,
  wallet: WalletOwnership,
  id: string,
  kind: IntentKind,
  operation: xdr.Operation,
  data: Record<string, unknown>,
): Promise<Intent> {
  // Simulate with the sponsor as source to learn the auth entry the wallet must sign.
  let entry: xdr.SorobanAuthorizationEntry | undefined
  try {
    const sim = await chain.rpc.simulateTransaction(
      await buildTx(chain.rpc, chain.network, chain.sponsor.publicKey(), operation),
    )
    if ('error' in sim && sim.error) throw new Error(sim.error)
    entry = (sim as { result?: { auth: xdr.SorobanAuthorizationEntry[] } }).result?.auth.find((candidate) => {
      const credentials = addressCredentialsOf(candidate)
      return !!credentials && Address.fromScAddress(credentials.address).toString() === wallet.id
    })
  } catch (error) {
    throw new HTTPException(400, {
      message: new StellarError('Could not prepare the transaction', String((error as Error).message ?? error)).message,
    })
  }
  if (!entry) throw new HTTPException(500, { message: 'The wallet was not asked to authorize this call' })

  const validUntil = (await chain.rpc.getLatestLedger()).sequence + PASSKEY_VALID_LEDGERS
  // The payload the passkey must sign: computed by authorizeEntry, captured here.
  let payload: Uint8Array | undefined
  await authorizeEntry(
    entry,
    async (_preimage, hash) => {
      payload = hash
      return { signatureScVal: xdr.ScVal.scvVoid() }
    },
    validUntil,
    chain.network.networkPassphrase,
  )
  if (!payload) throw new HTTPException(500, { message: 'Could not compute the signature payload' })

  await db.prepare(
    'insert into intents (id, owner, kind, data, xdr, mode, auth_entry, valid_until, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, owner, kind, stringify(data), '', 'passkey', entry.toXdr('base64'), validUntil, now())

  const credentialIds = (
    await db.prepare('select credential_id from passkeys where wallet_id = ?').all(wallet.id) as Array<{ credential_id: string }>
  ).map((row) => row.credential_id)
  return { id, kind, mode: 'passkey', challenge: base64url.encode(payload), credentialIds }
}

type IntentRow = {
  id: string
  owner: string
  kind: IntentKind
  data: string
  xdr: string
  status: string
  mode: string
  auth_entry: string | null
  valid_until: number | null
}

export type PasskeyResponse = {
  /** base64url, as in the WebAuthn response */
  authenticatorData: string
  clientDataJSON: string
  /** DER or 64-byte r||s, base64url */
  signature: string
}

/** Submits a signed intent, then applies its effect to the database. */
export async function submitIntent(
  db: Db,
  chain: Chain,
  owner: string,
  id: string,
  signed: { signedXdr?: string; passkey?: PasskeyResponse },
  /** Called once the change has landed on chain and been applied here. */
  onApplied?: (kind: IntentKind, data: Record<string, any>) => Promise<void>,
) {
  const row = await db.prepare('select * from intents where id = ? and owner = ?').get(id, owner) as IntentRow | undefined
  if (!row) throw new HTTPException(404, { message: 'No such intent' })
  if (row.status !== 'pending') throw new HTTPException(409, { message: `Intent already ${row.status}` })

  const finish = async (result: { hash: string; ledger: number }) => {
    await db.prepare("update intents set status = 'submitted', tx_hash = ? where id = ?").run(result.hash, id)
    const data = JSON.parse(row.data)
    await applyEffect(db, row.kind, data, result.hash)
    await onApplied?.(row.kind, data)
    return result
  }
  const fail = async (error: unknown): Promise<never> => {
    const message = String((error as Error).message ?? error)
    await db.prepare("update intents set status = 'failed', error = ? where id = ?").run(message, id)
    throw new HTTPException(502, { message })
  }

  if (row.mode === 'passkey') {
    if (!signed.passkey) throw new HTTPException(400, { message: 'This intent is signed with a passkey' })
    const assertion = {
      authenticatorData: base64url.decode(signed.passkey.authenticatorData),
      clientDataJson: base64url.decode(signed.passkey.clientDataJSON),
      signature: compactSignature(base64url.decode(signed.passkey.signature)),
    }
    const entry = xdr.SorobanAuthorizationEntry.fromXdr(row.auth_entry!, 'base64')
    const signedEntry = await authorizeEntry(
      entry,
      async () => ({ signatureScVal: passkeySignatureScVal(assertion) }),
      row.valid_until!,
      chain.network.networkPassphrase,
    )
    const root = signedEntry.rootInvocation.function
    if (root.type !== 'sorobanAuthorizedFunctionTypeContractFn') throw new HTTPException(500, { message: 'Unexpected intent' })
    const call = root.contractFn
    return chain.serial(async () => {
      try {
        const account = await chain.rpc.getAccount(chain.sponsor.publicKey())
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: chain.network.networkPassphrase })
          .addOperation(
            Operation.invokeContractFunction({
              contract: Address.fromScAddress(call.contractAddress).toString(),
              function: call.functionName.toString(),
              args: call.args,
              auth: [signedEntry],
            }),
          )
          .setTimeout(60)
          .build()
        // Simulating with the signed entry runs the wallet's passkey check.
        const prepared = await chain.rpc.prepareTransaction(tx)
        prepared.sign(chain.sponsor)
        return await finish(await submitSigned(chain.rpc, prepared))
      } catch (error) {
        return fail(new StellarError('Passkey transaction failed', String((error as Error).message ?? error)))
      }
    })
  }

  if (!signed.signedXdr) throw new HTTPException(400, { message: 'Missing signedXdr' })
  const signedTx = TransactionBuilder.fromXDR(signed.signedXdr, chain.network.networkPassphrase) as Transaction
  const original = TransactionBuilder.fromXDR(row.xdr, chain.network.networkPassphrase) as Transaction
  // The owner may only add signatures, not change the transaction.
  if (Buffer.compare(signedTx.hash(), original.hash()) !== 0) {
    throw new HTTPException(400, { message: 'Signed transaction does not match the intent' })
  }
  try {
    return await finish(await submitSigned(chain.rpc, signedTx))
  } catch (error) {
    return fail(error)
  }
}

async function applyEffect(db: Db, kind: IntentKind, data: Record<string, any>, txHash: string) {
  switch (kind) {
    case 'add_agent':
      await db.prepare(
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
      await db.prepare(
        'update agents set per_tx = ?, budget = ?, window_secs = ?, expires_at = ?, payees = ? where public_key = ?',
      ).run(data.perTx, data.budget, data.windowSecs, data.expiresAt, JSON.stringify(data.payees), data.agent)
      break
    case 'set_paused':
      await db.prepare('update agents set status = ? where public_key = ?').run(data.paused ? 'paused' : 'active', data.agent)
      break
    case 'remove_agent':
      await db.prepare("update agents set status = 'removed' where public_key = ?").run(data.agent)
      break
    case 'approve_once':
      await db.prepare("update approvals set status = 'approved', tx_hash = ?, resolved_at = ? where id = ?").run(
        txHash,
        now(),
        data.approval,
      )
      break
    case 'withdraw':
      break
  }
}
