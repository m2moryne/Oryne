import { useEffect, useState } from 'react'

/**
 * Mock data for the Oryne network on Stellar: the services agents can pay,
 * on-chain identifiers, and a live payment feed. None of it is real. The
 * addresses and hashes are generated to look like Stellar's, but they are not
 * on any ledger, so nothing here links out to an explorer.
 */

export type Protocol = 'x402' | 'MPP'

export type Service = {
  id: string
  name: string
  category: string
  description: string
  /** Price in USD (paid in USDC) per unit. */
  price: number
  unit: string
  protocol: Protocol
  /** The Stellar address payments go to. */
  payee: string
  calls24h: number
  agents: number
  uptime: number
  verified: boolean
  /** The endpoint an agent calls; a 402 comes back until it pays. */
  endpoint: string
}

/** Same seed, same output: the mock data is stable across reloads. */
export function sequence(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

export function hashSeed(text: string) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** A string shaped like a Stellar strkey: G… for accounts, C… for contracts. Not a valid key. */
export function strkey(seed: string, prefix: 'G' | 'C' = 'G') {
  const random = sequence(hashSeed(seed))
  return prefix + Array.from({ length: 55 }, () => BASE32[Math.floor(random() * 32)]).join('')
}

/** A 64-character hex string shaped like a transaction or wasm hash. */
export function hexHash(seed: string) {
  const random = sequence(hashSeed(seed))
  return Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(random() * 16)]).join('')
}

/** GABCD…WXYZ */
export const shortKey = (key: string, head = 5, tail = 4) =>
  key.length > head + tail + 1 ? `${key.slice(0, head)}…${key.slice(-tail)}` : key

/** Ledgers close about every five seconds; this is the "current" one. */
const LEDGER_EPOCH = Date.UTC(2026, 9, 1)
const LEDGER_AT_EPOCH = 61_480_000
export const ledgerAt = (time: number) => LEDGER_AT_EPOCH + Math.floor((time - LEDGER_EPOCH) / 5000)

export const NETWORK = {
  name: 'Stellar',
  /** The preview pretends to run on testnet. */
  environment: 'Testnet',
  usdc: strkey('usdc-sac', 'C'),
  walletWasm: hexHash('agent-wallet-wasm-0.1.0'),
  walletVersion: '0.1.0',
  facilitator: 'https://x402.oryne.org',
  feeXlm: 0.00001,
}

const service = (
  name: string,
  category: string,
  description: string,
  price: number,
  unit: string,
  protocol: Protocol,
  calls24h: number,
  agents: number,
  verified = true,
): Service => {
  const id = name.toLowerCase().replace(/\s+/g, '-')
  return {
    id,
    name,
    category,
    description,
    price,
    unit,
    protocol,
    payee: strkey(`payee-${id}`),
    calls24h,
    agents,
    uptime: 99 + (hashSeed(id) % 100) / 100,
    verified,
    endpoint: `https://api.${id.replace(/-/g, '')}.example/v1`,
  }
}

/** The directory: services that accept payment from agents per call or per job. */
export const services: Service[] = [
  service('Lumen Search', 'Search', 'Web search with full-page extracts, ranked for agents.', 0.008, 'query', 'x402', 184_220, 3_412),
  service('Fathom Market Data', 'Data', 'Real-time quotes, filings and daily market snapshots.', 0.02, 'request', 'x402', 61_904, 1_208),
  service('Quill Docs', 'Documents', 'PDF and scan parsing into clean, structured text.', 0.15, 'page', 'x402', 38_117, 966),
  service('Northwind Data', 'Data', 'Company, weather and geo datasets behind one API.', 0.004, 'call', 'MPP', 402_551, 2_731),
  service('Halcyon Compute', 'Compute', 'GPU and CPU jobs billed by the second.', 0.0006, 'second', 'MPP', 1_208_330, 812),
  service('Meridian Maps', 'Maps', 'Geocoding, routing and travel times.', 0.005, 'route', 'x402', 95_610, 1_540),
  service('Skylane Fares', 'Travel', 'Live flight fares across 400 airlines.', 0.03, 'search', 'x402', 22_480, 640),
  service('Stayfinder', 'Travel', 'Hotel availability and prices, held for 10 minutes.', 0.02, 'check', 'x402', 18_302, 512),
  service('Atlas Translate', 'Language', 'Translation across 120 languages, certified on request.', 0.01, '100 words', 'x402', 47_009, 1_022),
  service('Signal Relay', 'Messaging', 'SMS, email and push alerts sent by agents.', 0.012, 'message', 'MPP', 133_870, 734),
  service('Vaultline', 'Storage', 'Object storage paid by the gigabyte-hour.', 0.00003, 'GB-hour', 'MPP', 512_004, 388),
  service('Pricewatch', 'Commerce', 'Price comparison across 9,000 retailers.', 0.01, 'lookup', 'x402', 29_771, 455),
  service('Parcel Line', 'Logistics', 'Shipping quotes and labels from 30 carriers.', 0.05, 'quote', 'x402', 8_604, 201, false),
  service('Inference Hub', 'AI models', 'Open-weight models served by the token.', 0.0002, '1k tokens', 'MPP', 2_904_118, 4_120),
  service('Verity KYC', 'Identity', 'Business and identity verification for onboarding agents.', 0.9, 'check', 'x402', 3_118, 96, false),
  service('Kora Mobile Money', 'Payouts', 'Pay out to mobile money wallets through Stellar anchors.', 0.25, 'payout', 'x402', 6_430, 143),
]

export const serviceCategories = ['All', ...Array.from(new Set(services.map((item) => item.category)))]

export const serviceByName = (name: string) => services.find((item) => item.name === name)

/** Headline network numbers, as of "now". They creep up so the page feels live. */
export function networkTotals(time = Date.now()) {
  const minutes = (time - LEDGER_EPOCH) / 60_000
  return {
    payments24h: 412_380 + Math.floor((minutes % 1440) * 3.1),
    volume24h: 38_910 + Math.floor((minutes % 1440) * 0.42),
    agents: 23_140 + Math.floor(minutes / 90),
    services: services.length + 1_202,
    wallets: 9_870 + Math.floor(minutes / 240),
    declinedByPolicy: 0.031,
    medianSettle: 4.8,
    avgFee: 0.0000075,
  }
}

export type FeedItem = {
  id: string
  at: number
  service: Service
  amount: number
  agent: string
  wallet: string
  hash: string
  ledger: number
  status: 'settled' | 'refused'
  /** Why the wallet contract refused, when it did. */
  reason?: string
}

const refusals = ['OverPerTxLimit', 'OverBudget', 'PayeeNotAllowed', 'AgentPaused']

function feedItem(random: () => number, at: number, n: number): FeedItem {
  const pick = services[Math.floor(random() * services.length)]
  const units = Math.max(1, Math.round(random() * random() * 400))
  const amount = Math.max(0.0001, Math.round(pick.price * units * 10_000) / 10_000)
  const refused = random() < 0.04
  const seed = `${at}-${n}`
  return {
    id: `feed_${seed}`,
    at,
    service: pick,
    amount,
    agent: strkey(`agent-${Math.floor(random() * 5000)}`),
    wallet: strkey(`wallet-${Math.floor(random() * 2000)}`, 'C'),
    hash: hexHash(seed),
    ledger: ledgerAt(at),
    status: refused ? 'refused' : 'settled',
    reason: refused ? refusals[Math.floor(random() * refusals.length)] : undefined,
  }
}

/** A stream of mock agent payments, newest first. A new one lands every second or two. */
export function useLiveFeed(size = 14) {
  const [items, setItems] = useState<FeedItem[]>(() => {
    const random = sequence(Math.floor(Date.now() / 60_000))
    const now = Date.now()
    return Array.from({ length: size }, (_, i) => feedItem(random, now - i * 1700 - random() * 900, i))
  })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let n = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      timer = setTimeout(
        () => {
          n++
          setItems((current) => [feedItem(Math.random, Date.now(), n), ...current].slice(0, size))
          tick()
        },
        900 + Math.random() * 1400,
      )
    }
    tick()
    return () => clearTimeout(timer)
  }, [size])

  return items
}

/** Re-renders every `ms`, for figures that should tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

export const usdc = (value: number) =>
  `${value < 1 ? value.toFixed(value < 0.01 ? 4 : 3) : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`

export const compact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
