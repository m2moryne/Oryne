import { fileURLToPath } from 'node:url'
import { networks, type NetworkConfig } from '@oryne/core'

/** Everything the API reads from the environment. See .env.example. */
export type Config = {
  port: number
  network: NetworkConfig
  /** Directory for the SQLite database and generated testnet keys. */
  dataDir: string
  /** Origins allowed to call the API from a browser. */
  corsOrigins: string[]
  /** Public URL of this API, put in 402 responses as the facilitator. */
  publicUrl: string
  /** Secret of the account that pays fees and deploys wallets. Generated on testnet if unset. */
  sponsorSecret?: string
  /** Token contract agents spend. On testnet, a test USDC is created if unset. */
  tokenId?: string
  /** Hash of the uploaded agent-wallet wasm. Uploaded from walletWasm if unset. */
  walletWasmHash?: string
  /** Path or URL of agent_wallet.wasm to upload when walletWasmHash is unset. */
  walletWasm: string
}

const env = (name: string) => process.env[name]?.trim() || undefined

export function loadConfig(): Config {
  const networkName = (env('ORYNE_NETWORK') ?? 'testnet') as keyof typeof networks
  const base = networks[networkName]
  if (!base) throw new Error(`ORYNE_NETWORK must be one of ${Object.keys(networks).join(', ')}`)
  const port = Number(env('PORT') ?? 8787)
  return {
    port,
    network: { ...base, rpcUrl: env('STELLAR_RPC_URL') ?? base.rpcUrl, token: env('TOKEN_ID') ?? base.token },
    dataDir: env('ORYNE_DATA_DIR') ?? fileURLToPath(new URL('../data/', import.meta.url)),
    corsOrigins: (env('CORS_ORIGINS') ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()),
    publicUrl: env('PUBLIC_URL') ?? `http://localhost:${port}`,
    sponsorSecret: env('SPONSOR_SECRET'),
    tokenId: env('TOKEN_ID'),
    walletWasmHash: env('WALLET_WASM_HASH'),
    walletWasm:
      env('WALLET_WASM') ??
      'https://github.com/m2moryne/Oryne/releases/download/contracts-latest/agent_wallet.wasm',
  }
}
