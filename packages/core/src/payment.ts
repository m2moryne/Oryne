import {
  Address,
  authorizeEntry,
  Keypair,
  scValToNative,
  StrKey,
  xdr,
  type rpc,
} from '@stellar/stellar-sdk'
import type { NetworkConfig } from './config.ts'
import { buildTx, simulate } from './rpc.ts'
import { agentSignatureScVal, transferOp } from './wallet.ts'

/**
 * The payment format Oryne speaks, modelled on x402:
 *
 *   1. A service answers `402 Payment Required` with PaymentRequirements.
 *   2. The agent signs a Soroban authorization entry for
 *      token.transfer(from = its wallet, to = payTo, amount) with its own key,
 *      and retries with the X-PAYMENT header.
 *   3. The service hands the payload to a facilitator, which submits the
 *      transfer. The wallet contract's __check_auth enforces the mandate.
 *
 * The agent's key never leaves the agent, and the facilitator can't change
 * the payee or amount: they are inside what the agent signed.
 */

export const X402_VERSION = 1
export const SCHEME = 'exact'
export const PAYMENT_HEADER = 'X-PAYMENT'
export const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE'

export type PaymentRequirements = {
  scheme: typeof SCHEME
  /** "stellar-testnet" or "stellar-mainnet" */
  network: string
  /** Token contract ID. */
  asset: string
  /** Base units, as a decimal string. */
  maxAmountRequired: string
  payTo: string
  resource: string
  description?: string
  /** Where the service settles payments. */
  facilitator: string
  maxTimeoutSeconds: number
}

export type PaymentRequired = { x402Version: number; error?: string; accepts: PaymentRequirements[] }

export type PaymentPayload = {
  x402Version: number
  scheme: typeof SCHEME
  network: string
  payload: {
    /** The agent wallet paying. */
    from: string
    /** Base64 XDR of the signed SorobanAuthorizationEntry. */
    authorization: string
  }
}

export type SettleResponse = {
  success: boolean
  /** Transaction hash when settled. */
  transaction?: string
  ledger?: number
  payer?: string
  /** Contract error name or another reason when not. */
  errorReason?: string
}

export const networkId = (network: NetworkConfig) => `stellar-${network.name}`

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64')
export const decodeHeader = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T

/**
 * Agent side: builds the transfer, simulates it to get the authorization
 * entry the wallet must sign, and signs it with the agent key.
 * `simulationSource` is any funded account; it only pays for nothing.
 */
export async function signPayment(options: {
  rpcServer: rpc.Server
  network: NetworkConfig
  agent: Keypair
  wallet: string
  requirements: PaymentRequirements
  simulationSource: string
  /** How many ledgers the signature stays valid (~5 s each). */
  validForLedgers?: number
}): Promise<PaymentPayload> {
  const { rpcServer, network, agent, wallet, requirements } = options
  const amount = BigInt(requirements.maxAmountRequired)
  const tx = await buildTx(
    rpcServer,
    network,
    options.simulationSource,
    transferOp(requirements.asset, wallet, requirements.payTo, amount),
  )
  const sim = await simulate(rpcServer, tx)
  // Newer protocols use AddressV2 credentials; getAddressCredentials reads every variant.
  const entry = sim.result?.auth.find((candidate) => {
    const credentials = getAddressCredentials(candidate.credentials)
    return !!credentials && Address.fromScAddress(credentials.address).toString() === wallet
  })
  if (!entry) throw new Error('The transfer did not ask the wallet for authorization')

  const latest = await rpcServer.getLatestLedger()
  const signed = await authorizeEntry(
    entry,
    async (_preimage, payload) => ({
      signatureScVal: agentSignatureScVal(agent.rawPublicKey(), agent.sign(Buffer.from(payload))),
    }),
    latest.sequence + (options.validForLedgers ?? 24),
    network.networkPassphrase,
  )

  return {
    x402Version: X402_VERSION,
    scheme: SCHEME,
    network: requirements.network,
    payload: { from: wallet, authorization: signed.toXdr('base64') },
  }
}

/** What a signed authorization entry would pay, if it is a plain token transfer. */
export function readAuthorization(authorization: string) {
  const entry = xdr.SorobanAuthorizationEntry.fromXdr(authorization, 'base64')
  const root = entry.rootInvocation
  const fn = root.function
  if (fn.type !== 'sorobanAuthorizedFunctionTypeContractFn') throw new Error('Authorization is not a contract call')
  const call = fn.contractFn
  const args = call.args
  const name = call.functionName.toString()
  if (name !== 'transfer' || args.length !== 3) throw new Error(`Authorization is for ${name}, not transfer`)
  if (root.subInvocations.length > 0) throw new Error('Authorization has nested calls')
  return {
    entry,
    asset: Address.fromScAddress(call.contractAddress).toString(),
    from: scValToNative(args[0]) as string,
    to: scValToNative(args[1]) as string,
    amount: BigInt(scValToNative(args[2]) as bigint),
  }
}

export const isAddress = (value: string) =>
  StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value)

/** The address credentials of an entry, for both the original and the V2 credential variants. */
export function addressCredentialsOf(entry: xdr.SorobanAuthorizationEntry) {
  return getAddressCredentials(entry.credentials)
}

function getAddressCredentials(credentials: xdr.SorobanCredentials) {
  if (credentials.type === 'sorobanCredentialsAddress') return credentials.address
  if (credentials.type === 'sorobanCredentialsAddressV2') return credentials.addressV2
  return null
}

export { Keypair }
