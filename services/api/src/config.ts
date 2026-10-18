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
  /** Testnet only: secret of the test-USDC issuer. Generated if unset. */
  tokenIssuerSecret?: string
  /** Hash of the uploaded agent-wallet wasm. Uploaded from walletWasm if unset. */
  walletWasmHash?: string
  /** Path or URL of agent_wallet.wasm to upload when walletWasmHash is unset. */
  walletWasm: string
  /** The dashboard, where OAuth sign-in returns to. */
  webUrl: string
  /** OAuth apps. A provider is offered only when its ID and secret are set. */
  oauth: {
    google?: { clientId: string; clientSecret: string }
    github?: { clientId: string; clientSecret: string }
  }
  /** Testnet only: POST /v1/auth/dev signs in without OAuth, for scripts/e2e. */
  devLogin: boolean
}

const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : undefined)

const env = (name: string) => process.env[name]?.trim() || undefined

/**
 * Browser origins as the browser sends them: scheme and host, no path or
 * trailing slash. Accepts commas, spaces or new lines between entries, quotes,
 * and hosts without a scheme (https is assumed). The dashboard (WEB_URL) is
 * always allowed.
 */
function corsOrigins(list: string, webUrl?: string) {
  const origins = [...list.split(/[\s,]+/), webUrl ?? '']
    .map((entry) => entry.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(/^https?:\/\//.test(entry) ? entry : `https://${entry}`).origin
      } catch {
        throw new Error(`CORS_ORIGINS has an entry that isn't a URL: ${entry}`)
      }
    })
  return [...new Set(origins)]
}

export function loadConfig(): Config {
  const networkName = (env('ORYNE_NETWORK') ?? 'testnet') as keyof typeof networks
  const base = networks[networkName]
  if (!base) throw new Error(`ORYNE_NETWORK must be one of ${Object.keys(networks).join(', ')}`)
  const port = Number(env('PORT') ?? 8787)
  return {
    port,
    network: { ...base, rpcUrl: env('STELLAR_RPC_URL') ?? base.rpcUrl, token: env('TOKEN_ID') ?? base.token },
    dataDir: env('ORYNE_DATA_DIR') ?? fileURLToPath(new URL('../data/', import.meta.url)),
    corsOrigins: corsOrigins(env('CORS_ORIGINS') ?? 'http://localhost:5173', env('WEB_URL')),
    // Render sets RENDER_EXTERNAL_URL to the service's https URL.
    publicUrl: env('PUBLIC_URL') ?? env('RENDER_EXTERNAL_URL') ?? `http://localhost:${port}`,
    sponsorSecret: env('SPONSOR_SECRET'),
    tokenId: env('TOKEN_ID'),
    tokenIssuerSecret: env('TOKEN_ISSUER_SECRET'),
    walletWasmHash: env('WALLET_WASM_HASH'),
    walletWasm:
      env('WALLET_WASM') ??
      'https://github.com/m2moryne/Oryne/releases/download/contracts-latest/agent_wallet.wasm',
    webUrl: (env('WEB_URL') ?? 'http://localhost:5173').replace(/\/$/, ''),
    oauth: {
      google: pair(env('GOOGLE_CLIENT_ID'), env('GOOGLE_CLIENT_SECRET')),
      github: pair(env('GITHUB_CLIENT_ID'), env('GITHUB_CLIENT_SECRET')),
    },
    devLogin: env('DEV_LOGIN') === '1' && networkName === 'testnet',
  }
}
