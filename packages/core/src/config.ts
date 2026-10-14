import { Asset, Networks } from '@stellar/stellar-sdk'

/** Where Oryne talks to Stellar, and which token agents spend. */
export type NetworkConfig = {
  name: 'testnet' | 'mainnet'
  rpcUrl: string
  networkPassphrase: string
  /** Testnet only: funds new accounts with XLM. */
  friendbotUrl?: string
  /** Contract ID of the token agents spend (the USDC Stellar Asset Contract on mainnet). */
  token?: string
  /** Decimals of that token. Stellar classic assets always have 7. */
  decimals: number
}

export const TESTNET: NetworkConfig = {
  name: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  friendbotUrl: 'https://friendbot.stellar.org',
  decimals: 7,
}

export const MAINNET: NetworkConfig = {
  name: 'mainnet',
  rpcUrl: 'https://mainnet.sorobanrpc.com',
  networkPassphrase: Networks.PUBLIC,
  // Circle's USDC on Stellar, as a Stellar Asset Contract.
  token: new Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN').contractId(Networks.PUBLIC),
  decimals: 7,
}

export const networks = { testnet: TESTNET, mainnet: MAINNET }

/** "0.008" → 80_000n (7 decimals). Rejects anything that isn't a plain positive decimal. */
export function toBaseUnits(amount: string | number, decimals = 7): bigint {
  const text = typeof amount === 'number' ? amount.toFixed(decimals) : amount.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid amount: ${amount}`)
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > decimals) throw new Error(`Too many decimals in ${amount}`)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

/** 80_000n → "0.008" */
export function fromBaseUnits(units: bigint, decimals = 7): string {
  const negative = units < 0n
  const abs = negative ? -units : units
  const base = 10n ** BigInt(decimals)
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${abs / base}${fraction ? `.${fraction}` : ''}`
}
