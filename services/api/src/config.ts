import { fileURLToPath } from 'node:url'
import { StrKey } from '@stellar/stellar-sdk'
import { networks, type NetworkConfig } from '@oryne/core'

/** Everything the API reads from the environment. See .env.example. */
export type Config = {
  port: number
  network: NetworkConfig
  /** Directory for the SQLite database, used when there's no databaseUrl. */
  dataDir: string
  /** Postgres connection string (e.g. Supabase). Records survive restarts on hosts with no disk. */
  databaseUrl?: string
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
  /** Sign-in codes by email, sent with Resend. Without a key, codes are only printed to the log, and only when devLogin is on. */
  email: { resendApiKey?: string; from: string }
  /** Testnet only: POST /v1/auth/dev signs in without OAuth, for scripts/e2e. */
  devLogin: boolean
  /** DeepSeek API key for the AI debugger. The debugger is off without it. */
  deepseekApiKey?: string
  /** DeepSeek model for the debugger. Defaults to deepseek-chat. */
  deepseekModel?: string
  /** Bearer token for the admin API (32+ characters). The admin API is off without it. */
  adminToken?: string
  /**
   * Card top-ups with Paystack. Off without a secret key. `rate` is how many
   * units of `currency` one USDC costs, e.g. 130 for KES.
   */
  paystack?: { secretKey: string; currency: string; rate: number }
  /**
   * Account that sends the USDC for card top-ups where it can't be minted
   * (mainnet). On testnet, test USDC is minted instead and this isn't needed.
   */
  treasurySecret?: string
  /**
   * Who may create a wallet. `invite`: only accounts approved in the admin
   * site (they can ask from the dashboard). `open`: anyone who signs in.
   * Defaults to invite on mainnet and open on testnet.
   */
  access: 'invite' | 'open'
  /**
   * USDC a new mainnet wallet must be topped up with by card before it is
   * deployed, so every wallet Oryne pays to deploy belongs to someone who paid.
   * The money goes into their wallet. 0 turns it off. Mainnet only; default 5.
   */
  activationUsdc: string
  /**
   * Most XLM the sponsor may spend on fees in one UTC day. Past it, sponsored
   * actions are refused until midnight. 0 means no cap. Default 5 on mainnet,
   * no cap on testnet.
   */
  sponsorDailyXlm: number
  /** More than one wallet per account. Default: allowed on testnet only. */
  multipleWallets: boolean
}

const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : undefined)

const env = (name: string) => process.env[name]?.trim() || undefined

/** A Stellar secret key from the environment; catches the common mix-up with a public G… address. */
function secret(name: string) {
  const value = env(name)
  if (value && !StrKey.isValidEd25519SecretSeed(value)) {
    throw new Error(
      value.startsWith('G')
        ? `${name} is a public address (G…). It needs the secret key, which starts with S: run \`npm run keys -w @oryne/api\` where the API ran before.`
        : `${name} is not a Stellar secret key (S…, 56 characters).`,
    )
  }
  return value
}

/**
 * Browser origins as the browser sends them: scheme and host, no path or
 * trailing slash. Accepts commas, spaces or new lines between entries, quotes,
 * and hosts without a scheme (https is assumed). The dashboard (WEB_URL) and
 * the admin site (ADMIN_URL) are always allowed.
 */
function corsOrigins(list: string, ...alwaysAllowed: Array<string | undefined>) {
  const origins = [...list.split(/[\s,]+/), ...alwaysAllowed.map((url) => url ?? '')]
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
    databaseUrl: env('DATABASE_URL'),
    // CORS_ORIGIN (singular) is accepted too: it's an easy slip, and silently ignoring it is worse.
    corsOrigins: corsOrigins(
      [env('CORS_ORIGINS'), env('CORS_ORIGIN')].filter(Boolean).join(',') || 'http://localhost:5173',
      env('WEB_URL'),
      env('ADMIN_URL'),
    ),
    // Render sets RENDER_EXTERNAL_URL to the service's https URL.
    publicUrl: env('PUBLIC_URL') ?? env('RENDER_EXTERNAL_URL') ?? `http://localhost:${port}`,
    sponsorSecret: secret('SPONSOR_SECRET'),
    tokenId: env('TOKEN_ID'),
    tokenIssuerSecret: secret('TOKEN_ISSUER_SECRET'),
    walletWasmHash: env('WALLET_WASM_HASH'),
    walletWasm:
      env('WALLET_WASM') ??
      'https://github.com/m2moryne/Oryne/releases/download/contracts-latest/agent_wallet.wasm',
    webUrl: (env('WEB_URL') ?? 'http://localhost:5173').replace(/\/$/, ''),
    oauth: {
      google: pair(env('GOOGLE_CLIENT_ID'), env('GOOGLE_CLIENT_SECRET')),
      github: pair(env('GITHUB_CLIENT_ID'), env('GITHUB_CLIENT_SECRET')),
    },
    email: { resendApiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM') ?? 'Oryne <noreply@oryne.org>' },
    devLogin: env('DEV_LOGIN') === '1' && networkName === 'testnet',
    deepseekApiKey: env('DEEPSEEK_API_KEY'),
    deepseekModel: env('DEEPSEEK_MODEL'),
    adminToken: env('ADMIN_TOKEN'),
    paystack: paystackConfig(),
    treasurySecret: secret('TREASURY_SECRET'),
    access: accessMode(env('LIVE_ACCESS') ?? (networkName === 'mainnet' ? 'invite' : 'open')),
    activationUsdc: amount('ACTIVATION_USDC', networkName === 'mainnet' ? '5' : '0'),
    sponsorDailyXlm: Number(amount('SPONSOR_DAILY_XLM', networkName === 'mainnet' ? '5' : '0')),
    multipleWallets: (env('MULTIPLE_WALLETS') ?? (networkName === 'mainnet' ? '0' : '1')) === '1',
  }
}

function accessMode(value: string): Config['access'] {
  if (value !== 'invite' && value !== 'open') throw new Error('LIVE_ACCESS must be invite or open')
  return value
}

/** A non-negative decimal from the environment, e.g. "5" or "2.5". */
function amount(name: string, fallback: string) {
  const value = env(name) ?? fallback
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw new Error(`${name} must be a number like 5 or 2.5`)
  return value
}

function paystackConfig(): Config['paystack'] {
  const secretKey = env('PAYSTACK_SECRET_KEY')
  if (!secretKey) return undefined
  if (!/^sk_(test|live)_/.test(secretKey)) throw new Error('PAYSTACK_SECRET_KEY must be a Paystack secret key (sk_test_… or sk_live_…)')
  const currency = (env('PAYSTACK_CURRENCY') ?? 'KES').toUpperCase()
  const rate = Number(env('PAYSTACK_RATE') ?? (currency === 'USD' ? '1' : '130'))
  if (!(rate > 0)) throw new Error('PAYSTACK_RATE must be a positive number: how much one USDC costs in PAYSTACK_CURRENCY')
  return { secretKey, currency, rate }
}
