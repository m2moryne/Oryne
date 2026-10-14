import { Address, Keypair, nativeToScVal, Operation, xdr } from '@stellar/stellar-sdk'

/**
 * Encoders for the agent-wallet contract (contracts/agent-wallet). Each owner
 * call becomes an invokeContractFunction operation; the caller adds it to a
 * transaction that the owner signs.
 */

export type Policy = {
  /** Contract ID of the token the agent may spend. */
  token: string
  /** Base units (7 decimals). */
  perTx: bigint
  budget: bigint
  windowSecs: number
  /** Unix seconds; 0 = never. */
  expiresAt: number
  /** Addresses the agent may pay. Empty = any. */
  payees: string[]
}

/** The contract's error enum, by number. */
export const contractErrors: Record<number, string> = {
  1: 'UnknownAgent',
  2: 'AgentPaused',
  3: 'AgentExpired',
  4: 'NotATransfer',
  5: 'WrongToken',
  6: 'PayeeNotAllowed',
  7: 'OverPerTxLimit',
  8: 'OverBudget',
  9: 'InvalidAmount',
  10: 'AgentExists',
  11: 'InvalidPolicy',
  12: 'NoPasskey',
  13: 'InvalidPasskeySignature',
}

/** Finds "Error(Contract, #8)" in a simulation or submission error and names it. */
export function contractErrorName(message: string): string | undefined {
  const match = /Error\(Contract, #(\d+)\)/.exec(message)
  return match ? (contractErrors[Number(match[1])] ?? `ContractError${match[1]}`) : undefined
}

const sym = (name: string) => xdr.ScVal.scvSymbol(name)

/** A #[contracttype] struct is a map with symbol keys, sorted by key. */
export function struct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((key) => new xdr.ScMapEntry({ key: sym(key), val: fields[key] })),
  )
}

export const i128 = (value: bigint) => nativeToScVal(value, { type: 'i128' })
export const u64 = (value: number | bigint) => nativeToScVal(BigInt(value), { type: 'u64' })
export const address = (value: string) => new Address(value).toScVal()
export const bytes = (value: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(value))

/** The 32-byte ed25519 key the contract identifies an agent by. */
export const agentKeyBytes = (agentPublicKey: string) => Keypair.fromPublicKey(agentPublicKey).rawPublicKey()

export function policyScVal(policy: Policy): xdr.ScVal {
  return struct({
    token: address(policy.token),
    per_tx: i128(policy.perTx),
    budget: i128(policy.budget),
    window_secs: u64(policy.windowSecs),
    expires_at: u64(policy.expiresAt),
    payees: xdr.ScVal.scvVec(policy.payees.map(address)),
  })
}

/** A #[contracttype] enum variant with one value: vec[symbol, value]. */
const variant = (name: string, value: xdr.ScVal) => xdr.ScVal.scvVec([sym(name), value])

/** Signature::Agent: what an agent attaches to an authorization entry. */
export function agentSignatureScVal(publicKey: Uint8Array, signature: Uint8Array): xdr.ScVal {
  return variant('Agent', struct({ public_key: bytes(publicKey), signature: bytes(signature) }))
}

/** A WebAuthn assertion, with the signature as 64-byte r||s (low S). */
export type PasskeyAssertion = {
  authenticatorData: Uint8Array
  clientDataJson: Uint8Array
  signature: Uint8Array
}

/** Signature::Passkey: the owner's passkey signing for the wallet. */
export function passkeySignatureScVal(assertion: PasskeyAssertion): xdr.ScVal {
  if (assertion.signature.length !== 64) throw new Error('Passkey signature must be 64 bytes (r||s)')
  return variant(
    'Passkey',
    struct({
      authenticator_data: bytes(assertion.authenticatorData),
      client_data_json: bytes(assertion.clientDataJson),
      signature: bytes(assertion.signature),
    }),
  )
}

/** Who owns a new wallet: an address (e.g. Freighter), or a passkey public key (65 bytes, uncompressed). */
export type WalletOwner = { address: string } | { passkey: Uint8Array }

const call = (wallet: string, fn: string, args: xdr.ScVal[]) =>
  Operation.invokeContractFunction({ contract: wallet, function: fn, args })

/** Owner calls. The owner must authorize each one (as the transaction source, or via an auth entry). */
export const walletOps = {
  addAgent: (wallet: string, agent: string, policy: Policy) =>
    call(wallet, 'add_agent', [bytes(agentKeyBytes(agent)), policyScVal(policy)]),
  setPolicy: (wallet: string, agent: string, policy: Policy) =>
    call(wallet, 'set_policy', [bytes(agentKeyBytes(agent)), policyScVal(policy)]),
  setPaused: (wallet: string, agent: string, paused: boolean) =>
    call(wallet, 'set_paused', [bytes(agentKeyBytes(agent)), xdr.ScVal.scvBool(paused)]),
  removeAgent: (wallet: string, agent: string) => call(wallet, 'remove_agent', [bytes(agentKeyBytes(agent))]),
  approveOnce: (wallet: string, agent: string, payee: string, amount: bigint, expiresAt: number) =>
    call(wallet, 'approve_once', [bytes(agentKeyBytes(agent)), address(payee), i128(amount), u64(expiresAt)]),
  withdraw: (wallet: string, token: string, to: string, amount: bigint) =>
    call(wallet, 'withdraw', [address(token), address(to), i128(amount)]),
  setOwner: (wallet: string, owner: string) => call(wallet, 'set_owner', [address(owner)]),
  setPasskey: (wallet: string, passkey: Uint8Array) => call(wallet, 'set_passkey', [bytes(validPasskey(passkey))]),
}

/** Read-only calls, run through simulation. */
export const walletReads = {
  owner: (wallet: string) => call(wallet, 'owner', []),
  passkey: (wallet: string) => call(wallet, 'passkey', []),
  agent: (wallet: string, agent: string) => call(wallet, 'agent', [bytes(agentKeyBytes(agent))]),
  remaining: (wallet: string, agent: string) => call(wallet, 'remaining', [bytes(agentKeyBytes(agent))]),
}

/** Deploys a new wallet for `owner` from the uploaded agent-wallet wasm. */
export function deployWalletOp(deployer: string, wasmHash: Uint8Array, owner: WalletOwner, salt: Uint8Array) {
  const none = xdr.ScVal.scvVoid()
  const constructorArgs =
    'address' in owner ? [address(owner.address), none] : [none, bytes(validPasskey(owner.passkey))]
  return Operation.createCustomContract({
    address: new Address(deployer),
    wasmHash: Buffer.from(wasmHash),
    constructorArgs,
    salt: Buffer.from(salt),
  })
}

function validPasskey(key: Uint8Array) {
  if (key.length !== 65 || key[0] !== 0x04) throw new Error('Passkey public key must be 65 bytes, uncompressed (0x04…)')
  return key
}

/** token.transfer(from, to, amount) */
export const transferOp = (token: string, from: string, to: string, amount: bigint) =>
  call(token, 'transfer', [address(from), address(to), i128(amount)])

export const balanceOp = (token: string, of: string) => call(token, 'balance', [address(of)])
