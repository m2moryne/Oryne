import {
  addressCredentialsOf,
  readAuthorization,
  StellarError,
  submitSigned,
  networkId,
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
} from '@oryne/core'
import { BASE_FEE, Operation, scValToNative, StrKey, TransactionBuilder } from '@stellar/stellar-sdk'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * The x402 facilitator. A service passes on what the agent sent; this checks
 * it matches what the service asked for, then submits the transfer with the
 * sponsor paying the fee. The agent wallet's __check_auth decides whether
 * the money moves.
 */

type Checked = ReturnType<typeof readAuthorization> & { agent?: string }

function check(chain: Chain, payload: PaymentPayload, requirements: PaymentRequirements): Checked {
  if (payload.network !== networkId(chain.network) || requirements.network !== networkId(chain.network)) {
    throw new Error(`This facilitator settles on ${networkId(chain.network)}`)
  }
  const auth = readAuthorization(payload.payload.authorization)
  if (auth.asset !== requirements.asset) throw new Error('Paid in the wrong asset')
  if (auth.to !== requirements.payTo) throw new Error('Paid to the wrong address')
  if (auth.amount !== BigInt(requirements.maxAmountRequired)) throw new Error('Paid the wrong amount')
  if (auth.from !== payload.payload.from) throw new Error('Payer does not match the authorization')

  // Which agent key signed it: the AgentSignature struct in the credentials.
  let agent: string | undefined
  const credentials = addressCredentialsOf(auth.entry)
  if (credentials) {
    try {
      // The contract's Signature enum: Agent(AgentSignature) decodes to ['Agent', { public_key, signature }].
      const decoded = scValToNative(credentials.signature) as unknown
      const signature = (Array.isArray(decoded) && decoded[0] === 'Agent' ? decoded[1] : decoded) as { public_key?: Uint8Array }
      if (signature?.public_key) agent = StrKey.encodeEd25519PublicKey(Buffer.from(signature.public_key))
    } catch {
      // Not an Oryne agent signature; the contract will decide.
    }
  }
  return { ...auth, agent }
}

async function buildSettlement(chain: Chain, auth: Checked) {
  const account = await chain.rpc.getAccount(chain.sponsor.publicKey())
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: chain.network.networkPassphrase })
    .addOperation(
      Operation.invokeContractFunction({
        contract: auth.asset,
        function: 'transfer',
        args: auth.entry.rootInvocation.function.type === 'sorobanAuthorizedFunctionTypeContractFn'
          ? auth.entry.rootInvocation.function.contractFn.args
          : [],
        auth: [auth.entry],
      }),
    )
    .setTimeout(60)
    .build()
  // Simulating with the signed auth runs the wallet's __check_auth: policy refusals surface here.
  return chain.rpc.prepareTransaction(tx)
}

export async function verify(chain: Chain, payload: PaymentPayload, requirements: PaymentRequirements) {
  try {
    const auth = check(chain, payload, requirements)
    await buildSettlement(chain, auth)
    return { isValid: true, payer: auth.from }
  } catch (error) {
    return { isValid: false, invalidReason: reasonOf(error) }
  }
}

export type RecordedPayment = {
  id: string
  owner: string
  wallet: string
  agent: string | null
  payee: string
  /** In the token's base units. */
  amount: bigint
  asset: string
  resource: string
  status: string
  reason: string | null
  txHash: string | null
  approvedByOwner: boolean
}

export async function settle(
  db: Db,
  chain: Chain,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  /** Called with each recorded payment, e.g. to send webhooks. */
  onRecorded?: (payment: RecordedPayment) => Promise<void>,
): Promise<SettleResponse> {
  let auth: Checked
  try {
    auth = check(chain, payload, requirements)
  } catch (error) {
    return { success: false, errorReason: reasonOf(error) }
  }

  const record = async (status: string, extra: { reason?: string; hash?: string; ledger?: number }) => {
    const wallet = await db.prepare('select id, owner from wallets where id = ?').get<{ id: string; owner: string }>(auth.from)
    if (!wallet) return
    const paymentId = newId('pay')
    const allowance = await db
      .prepare("select id from approvals where wallet_id = ? and agent = ? and payee = ? and status = 'approved' and amount = ? order by resolved_at desc limit 1")
      .get(auth.from, auth.agent ?? '', auth.to, auth.amount.toString()) as { id: string } | undefined
    await db.prepare(
      `insert into payments (id, wallet_id, agent, payee, amount, asset, resource, status, reason, tx_hash, ledger, approved_by_owner, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      paymentId,
      auth.from,
      auth.agent ?? null,
      auth.to,
      auth.amount.toString(),
      auth.asset,
      requirements.resource,
      status,
      extra.reason ?? null,
      extra.hash ?? null,
      extra.ledger ?? null,
      status === 'settled' && allowance ? 1 : 0,
      now(),
    )
    if (status === 'settled' && allowance) {
      await db.prepare("update approvals set status = 'used' where id = ?").run(allowance.id)
    }
    await onRecorded?.({
      id: paymentId,
      owner: wallet.owner,
      wallet: auth.from,
      agent: auth.agent ?? null,
      payee: auth.to,
      amount: auth.amount,
      asset: auth.asset,
      resource: requirements.resource,
      status,
      reason: extra.reason ?? null,
      txHash: extra.hash ?? null,
      approvedByOwner: status === 'settled' && !!allowance,
    })
  }

  return chain.serial(async () => {
    try {
      const prepared = await buildSettlement(chain, auth)
      prepared.sign(chain.sponsor)
      const result = await submitSigned(chain.rpc, prepared)
      await record('settled', { hash: result.hash, ledger: result.ledger })
      return { success: true, transaction: result.hash, ledger: result.ledger, payer: auth.from }
    } catch (error) {
      const reason = reasonOf(error)
      await record(error instanceof StellarError || String(error).includes('Error(Contract') ? 'refused' : 'failed', { reason })
      return { success: false, errorReason: reason, payer: auth.from }
    }
  })
}

function reasonOf(error: unknown) {
  if (error instanceof StellarError && error.contractError) return error.contractError
  const message = String((error as Error)?.message ?? error)
  const contract = /Error\(Contract, #(\d+)\)/.exec(message)
  if (contract) return new StellarError('', message).contractError ?? message
  return message.slice(0, 300)
}
