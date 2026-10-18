/**
 * Client for the Oryne API (services/api). The session token from signing
 * in with Freighter is kept in localStorage so a reload stays signed in.
 */

/** VITE_ORYNE_API_URL wins; otherwise deployed builds use the hosted testnet API and `npm run dev:web` a local one. */
export const API_URL =
  (import.meta.env.VITE_ORYNE_API_URL as string | undefined) ??
  (import.meta.env.PROD ? 'https://oryne.onrender.com' : 'http://localhost:8787')

const TOKEN_KEY = 'oryne.live.session'

export type Session = { token: string; address: string; expiresAt: number }

export function loadSession(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Session | null
    return session && session.expiresAt * 1000 > Date.now() ? session : null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the session lasts until reload.
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(
      import.meta.env.PROD
        ? `Can't reach the Oryne API right now. It may be waking up; try again in a minute.`
        : `Can't reach the Oryne API at ${API_URL}. Is it running (npm run dev:api)?`,
      0,
    )
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new ApiError(data.error ?? `API error ${response.status}`, response.status)
  return data
}

export type Info = {
  network: string
  networkPassphrase: string
  token: string
  sponsor: string
  /** Hash of the agent-wallet code new wallets are deployed from. */
  walletWasmHash: string
  facilitator: string
  faucet: string | null
  auth: { freighter: boolean; google: boolean; github: boolean; dev: boolean }
}

export type User = { provider: string; email?: string | null; name?: string | null; avatar?: string | null }

/** Freighter users are their G… address; others are "google:…" / "github:…". */
export const isAccount = (subject: string) => /^G[A-Z2-7]{55}$/.test(subject)

export const oauthStart = (provider: 'google' | 'github') => `${API_URL}/v1/auth/oauth/${provider}/start`

export type WalletSummary = {
  id: string
  owner: string
  owner_kind: 'account' | 'passkey'
  name: string
  tx_hash: string | null
  created_at: number
}

export type LiveAgent = {
  publicKey: string
  wallet: string
  name: string
  kind: string
  status: 'active' | 'paused' | 'removed'
  perTx: string
  budget: string
  windowDays: number
  expiresAt: number | null
  payees: string[]
  remaining?: string
  createdAt: number
}

export type WalletDetail = WalletSummary & { token: string; balance: string; agents: LiveAgent[] }

export type LivePayment = {
  id: string
  wallet_id: string
  agent: string | null
  payee: string
  amount: string
  resource: string | null
  status: 'settled' | 'refused' | 'failed'
  reason: string | null
  tx_hash: string | null
  ledger: number | null
  approved_by_owner: number
  created_at: number
}

export type LiveApproval = {
  id: string
  wallet: string
  agent: string
  payee: string
  amount: string
  description: string
  resource: string | null
  reason: string | null
  status: string
  txHash: string | null
  createdAt: number
}

export type Intent =
  | { id: string; kind: string; mode: 'envelope'; xdr: string; networkPassphrase: string }
  | { id: string; kind: string; mode: 'passkey'; challenge: string; credentialIds: string[] }

export const explorerTx = (network: string, hash: string) =>
  `https://stellar.expert/explorer/${network === 'stellar-mainnet' ? 'public' : 'testnet'}/tx/${hash}`

export const explorerAccount = (network: string, address: string) =>
  `https://stellar.expert/explorer/${network === 'stellar-mainnet' ? 'public' : 'testnet'}/${address.startsWith('C') ? 'contract' : 'account'}/${address}`
