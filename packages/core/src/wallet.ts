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

/** The signature the agent attaches to an authorization entry; see AgentSignature in the contract. */
export function agentSignatureScVal(publicKey: Uint8Array, signature: Uint8Array): xdr.ScVal {
  return struct({ public_key: bytes(publicKey), signature: bytes(signature) })
}

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
}

/** Read-only calls, run through simulation. */
export const walletReads = {
  owner: (wallet: string) => call(wallet, 'owner', []),
  agent: (wallet: string, agent: string) => call(wallet, 'agent', [bytes(agentKeyBytes(agent))]),
  remaining: (wallet: string, agent: string) => call(wallet, 'remaining', [bytes(agentKeyBytes(agent))]),
}

/** Deploys a new wallet for `owner` from the uploaded agent-wallet wasm. */
export function deployWalletOp(deployer: string, wasmHash: Uint8Array, owner: string, salt: Uint8Array) {
  return Operation.createCustomContract({
    address: new Address(deployer),
    wasmHash: Buffer.from(wasmHash),
    constructorArgs: [address(owner)],
    salt: Buffer.from(salt),
  })
}

/** token.transfer(from, to, amount) */
export const transferOp = (token: string, from: string, to: string, amount: bigint) =>
  call(token, 'transfer', [address(from), address(to), i128(amount)])

export const balanceOp = (token: string, of: string) => call(token, 'balance', [address(of)])
