import { hexHash, ledgerAt, NETWORK, serviceByName, strkey, type Protocol } from '../lib/network'
import type { Agent, Purchase, User } from './types'

/**
 * The on-chain side of the dashboard preview, derived rather than stored:
 * every agent, wallet and purchase gets stable Stellar-shaped identifiers
 * from its own ID. Mock values: nothing here exists on a ledger.
 */

/** The owner's agent-wallet contract. */
export const walletAddress = (user: User | null) => strkey(`wallet-${user?.email ?? 'guest'}`, 'C')

/** The agent's ed25519 session key, registered on the wallet with add_agent. */
export const agentKey = (agent: Pick<Agent, 'id'>) => strkey(`agent-key-${agent.id}`)

/** Which contract error a declined purchase maps to. */
export const contractErrors: Record<string, string> = {
  'Over the per-purchase limit': 'Error::OverPerTxLimit',
  'Budget reached': 'Error::OverBudget',
  'Payee not on allowlist': 'Error::PayeeNotAllowed',
  'Not enough funds': 'balance too low (token transfer failed)',
  'Declined by you': 'approval declined, nothing signed',
}

export function onchain(purchase: Purchase) {
  const at = new Date(purchase.at).getTime()
  const service = serviceByName(purchase.merchant)
  const protocol: Protocol = service?.protocol ?? 'x402'
  return {
    protocol,
    hash: hexHash(purchase.id),
    ledger: ledgerAt(at),
    payee: service?.payee ?? strkey(`payee-${purchase.merchant}`),
    feeXlm: NETWORK.feeXlm,
    /** Declined payments are refused in __check_auth, so they never reach a ledger. */
    onLedger: purchase.status === 'settled',
  }
}

/** Seven-decimal base units, as the USDC contract counts them. */
export const baseUnits = (dollars: number) => Math.round(dollars * 10_000_000).toLocaleString('en-US')
