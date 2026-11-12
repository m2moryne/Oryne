import {
  BASE_FEE,
  Keypair,
  rpc,
  scValToNative,
  StrKey,
  TransactionBuilder,
  type Transaction,
  type xdr,
} from '@stellar/stellar-sdk'
import type { NetworkConfig } from './config.ts'
import { contractErrorName } from './wallet.ts'

/** A failure from Stellar, with the contract error named when there is one. */
export class StellarError extends Error {
  readonly contractError?: string
  readonly detail: string
  constructor(message: string, detail: string) {
    const contractError = contractErrorName(detail)
    super(contractError ? `${message}: ${contractError}` : `${message}: ${detail.slice(0, 300)}`)
    this.contractError = contractError
    this.detail = detail
  }
}

export const server = (network: NetworkConfig) =>
  new rpc.Server(network.rpcUrl, { allowHttp: network.rpcUrl.startsWith('http://') })

/** Most we bid per transaction to get into a ledger: 0.01 XLM. */
const MAX_INCLUSION_FEE = 100_000
const feeCache = new WeakMap<rpc.Server, { fee: string; at: number }>()

/**
 * The inclusion fee to bid, in stroops: what recent ledgers needed for smart
 * contract calls (the 90th percentile), never below the network minimum. A
 * busy mainnet drops transactions that bid the minimum, so they never land.
 */
export async function inclusionFee(rpcServer: rpc.Server): Promise<string> {
  const cached = feeCache.get(rpcServer)
  if (cached && Date.now() - cached.at < 30_000) return cached.fee
  let fee = Number(BASE_FEE)
  try {
    const stats = await rpcServer.getFeeStats()
    fee = Math.max(fee, Number(stats.sorobanInclusionFee.p90) || 0, Number(stats.inclusionFee.p90) || 0)
  } catch {
    // Fee stats are a nicety: fall back to the minimum.
  }
  const result = String(Math.min(fee, MAX_INCLUSION_FEE))
  feeCache.set(rpcServer, { fee: result, at: Date.now() })
  return result
}

/** One operation in a fresh transaction from `source`. */
export async function buildTx(
  rpcServer: rpc.Server,
  network: NetworkConfig,
  source: string,
  operation: xdr.Operation,
  timeoutSecs = 120,
): Promise<Transaction> {
  const [account, fee] = await Promise.all([rpcServer.getAccount(source), inclusionFee(rpcServer)])
  return new TransactionBuilder(account, { fee, networkPassphrase: network.networkPassphrase })
    .addOperation(operation)
    .setTimeout(timeoutSecs)
    .build()
}

const plain = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)))

/**
 * A failed simulation's error with its diagnostic events written out the way
 * the host logs them ("contract:C…, topics:[error, Error(Contract, #7)]").
 *
 * Since protocol 30 a refusal in a wallet's __check_auth comes back as
 * Error(Auth, InvalidAction); the wallet's own error code is only in the
 * events, so `contractErrorName` needs them to name it.
 */
export function simulationDetail(sim: rpc.Api.SimulateTransactionErrorResponse): string {
  const lines = [sim.error]
  for (const diagnostic of sim.events ?? []) {
    try {
      const event = plain(diagnostic).event
      const topics: Record<string, unknown>[] = event?.body?.v0?.topics ?? []
      const contract = event?.contract_id ? String(event.contract_id) : undefined
      const code = (topics[1]?.error as { contract?: number } | undefined)?.contract
      if (topics[0]?.symbol === 'error' && contract && code !== undefined) {
        lines.push(`contract:${contract}, topics:[error, Error(Contract, #${code})]`)
      } else if (topics[0]?.symbol === 'fn_call' && typeof topics[1]?.bytes === 'string') {
        const callee = StrKey.encodeContract(Buffer.from(topics[1].bytes, 'hex'))
        lines.push(`topics:[fn_call, ${callee}, ${String(topics[2]?.symbol)}]`)
      }
    } catch {
      // An event we can't read doesn't change the error itself.
    }
  }
  return lines.join('\n')
}

/** Simulates and throws a StellarError if the contract would fail. */
export async function simulate(rpcServer: rpc.Server, tx: Transaction) {
  const sim = await rpcServer.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new StellarError('Simulation failed', simulationDetail(sim))
  return sim
}

/**
 * Like `rpcServer.prepareTransaction` (simulate, then add footprint, auth and
 * fees), but a failure is a StellarError that names the contract's error.
 */
export async function prepare(rpcServer: rpc.Server, tx: Transaction): Promise<Transaction> {
  return rpc.assembleTransaction(tx, await simulate(rpcServer, tx)).build()
}

/** Runs a read-only contract call and returns its value as a JS value. */
export async function read<T = unknown>(
  rpcServer: rpc.Server,
  network: NetworkConfig,
  source: string,
  operation: xdr.Operation,
): Promise<T> {
  const sim = await simulate(rpcServer, await buildTx(rpcServer, network, source, operation))
  return (sim.result ? scValToNative(sim.result.retval) : undefined) as T
}

/** Prepares (simulate + footprint + fees), signs with `signer`, submits and waits for the result. */
export async function prepareSignSubmit(rpcServer: rpc.Server, tx: Transaction, signer: Keypair) {
  let prepared: Transaction
  try {
    prepared = await prepare(rpcServer, tx)
  } catch (error) {
    if (error instanceof StellarError) throw error
    throw new StellarError('Simulation failed', String((error as Error).message ?? error))
  }
  prepared.sign(signer)
  return submitSigned(rpcServer, prepared)
}

/** Submits an already-signed transaction and waits for it to land. */
export async function submitSigned(rpcServer: rpc.Server, tx: Transaction) {
  const sent = await rpcServer.sendTransaction(tx)
  if (sent.status === 'ERROR' || sent.status === 'DUPLICATE' || sent.status === 'TRY_AGAIN_LATER') {
    throw new StellarError(`Submission ${sent.status}`, sent.errorResult?.toXdr('base64') ?? sent.status)
  }
  const result = await rpcServer.pollTransaction(sent.hash, { attempts: 30 })
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    const detail =
      'diagnosticEventsXdr' in result && result.diagnosticEventsXdr
        ? result.diagnosticEventsXdr.map((event) => event.toXdr('base64')).join(',')
        : result.status
    throw new StellarError('Transaction failed', `${result.status} ${detail}`)
  }
  return {
    hash: sent.hash,
    ledger: result.ledger,
    returnValue: result.returnValue ? scValToNative(result.returnValue) : undefined,
    /** What the source account paid in fees, in stroops. */
    feeCharged: BigInt(result.resultXdr?.feeCharged ?? 0n),
  }
}

/** Testnet: give an account XLM so it exists and can pay fees. Safe to call twice. */
export async function fundWithFriendbot(network: NetworkConfig, publicKey: string) {
  if (!network.friendbotUrl) throw new Error(`No friendbot on ${network.name}`)
  const response = await fetch(`${network.friendbotUrl}/?addr=${encodeURIComponent(publicKey)}`)
  if (!response.ok && response.status !== 400) throw new Error(`Friendbot failed: ${response.status}`)
}

export { Keypair }
