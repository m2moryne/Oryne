import {
  decodeHeader,
  encodeHeader,
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  server,
  signPayment,
  toBaseUnits,
  fromBaseUnits,
  type NetworkConfig,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
} from '@oryne/core'
import { Keypair } from '@stellar/stellar-sdk'
import {
  hookRefusal,
  payeeRefusal,
  type BeforePay,
  type DirectoryListing,
  type PayeeRule,
} from './guard.ts'

export * from './guard.ts'

/**
 * An agent's connection to Oryne. Give it the agent's secret key (S…, shown
 * once when the owner connects the agent) and use `agent.fetch()` wherever
 * you'd use `fetch()`: when a service answers 402 Payment Required, it pays
 * from the agent's wallet, inside its mandate, and retries.
 */

export type AgentInfo = {
  agent: {
    publicKey: string
    wallet: string
    name: string
    status: string
    perTx: string
    budget: string
    remaining?: string
  }
  network: string
  rpcUrl: string
  networkPassphrase: string
  token: string
  simulationSource: string
  walletBalance: string
}

export type Approval = {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'used'
  amount: string
  payee: string
  description: string
}

export type PaymentEvent =
  | { type: 'paying'; requirements: PaymentRequirements; amount: string }
  | { type: 'paid'; settlement: SettleResponse; amount: string }
  | { type: 'refused'; reason: string; amount: string; source: RefusalSource }

/**
 * Who refused: `'wallet'` is the contract (or the service failing to settle),
 * after the agent signed; `'client'` is this SDK, before anything was signed.
 */
export type RefusalSource = 'wallet' | 'client'

export class PaymentRefusedError extends Error {
  readonly reason: string
  readonly requirements: PaymentRequirements
  readonly source: RefusalSource
  constructor(reason: string, requirements: PaymentRequirements, source: RefusalSource = 'wallet') {
    super(source === 'wallet' ? `Payment refused by the wallet: ${reason}` : `Payment refused before signing: ${reason}`)
    this.reason = reason
    this.requirements = requirements
    this.source = source
  }
}

/** `fetch()` options, plus the most this one request may cost. */
export type PaidRequestInit = RequestInit & {
  /** Refuse to pay more than this for this request, in token units, e.g. "0.10". */
  maxPrice?: string
}

/** How long directory lookups are reused. */
const DIRECTORY_TTL_MS = 5 * 60_000

/** The hosted Oryne API, on Stellar testnet. */
export const DEFAULT_API_URL = 'https://testnet-apiv1.oryne.org'

export type OryneAgentOptions = {
  /** The agent's secret key, S… */
  secret: string
  /** Oryne API base URL. Defaults to ORYNE_API_URL, then the hosted API. */
  apiUrl?: string
  /** Most this client will pay for a single request, whatever the service asks. In token units, e.g. "1". */
  maxPerRequest?: string
  /**
   * Who this agent may pay: `'any'` (default), `'directory'` (only services in
   * the Oryne directory, at the address listed for that host) or a list of
   * Stellar addresses. Checked before signing; the wallet's on-chain mandate
   * still applies on top.
   */
  payees?: PayeeRule
  /** Last say before signing. Return `true` to pay, or `false` or a reason to refuse. */
  beforePay?: BeforePay
  onPayment?: (event: PaymentEvent) => void
}

export class OryneAgent {
  readonly keypair: Keypair
  readonly apiUrl: string
  private info?: Promise<AgentInfo>
  private readonly maxPerRequest?: bigint
  private readonly payees: PayeeRule
  private readonly beforePay?: BeforePay
  private readonly onPayment?: (event: PaymentEvent) => void
  private readonly listings = new Map<string, { at: number; listings: Promise<DirectoryListing[]> }>()

  constructor(options: OryneAgentOptions) {
    this.keypair = Keypair.fromSecret(options.secret)
    this.apiUrl = (options.apiUrl ?? process.env.ORYNE_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '')
    this.maxPerRequest = options.maxPerRequest ? toBaseUnits(options.maxPerRequest) : undefined
    this.payees = options.payees ?? 'any'
    this.beforePay = options.beforePay
    this.onPayment = options.onPayment
  }

  get publicKey() {
    return this.keypair.publicKey()
  }

  /** Calls the Oryne API as this agent; each request is signed with the agent key. */
  async api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const method = init.method ?? 'GET'
    const url = new URL(`/v1/agent${path}`, this.apiUrl)
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `oryne-agent\n${method}\n${url.pathname}\n${timestamp}`
    const signature = Buffer.from(this.keypair.sign(Buffer.from(message))).toString('base64')
    const response = await fetch(url, {
      method,
      headers: {
        'x-oryne-agent': `${this.publicKey}.${timestamp}.${signature}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) throw new Error(data.error ?? `Oryne API ${response.status}`)
    return data
  }

  /** The agent, its wallet, its limits and what it has left. Cached after the first call. */
  me(refresh = false): Promise<AgentInfo> {
    if (!this.info || refresh) this.info = this.api<AgentInfo>('')
    return this.info
  }

  /** The Oryne directory's listings for an origin. Cached for a few minutes; failures aren't cached. */
  directory(origin: string): Promise<DirectoryListing[]> {
    const cached = this.listings.get(origin)
    if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached.listings
    const url = new URL('/v1/services', this.apiUrl)
    url.searchParams.set('host', new URL(origin).host)
    const listings = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`directory answered ${response.status}`)
      const data = (await response.json()) as { services?: DirectoryListing[] }
      return data.services ?? []
    })
    listings.catch(() => this.listings.delete(origin))
    this.listings.set(origin, { at: Date.now(), listings })
    return listings
  }

  /** A fetch() that pays 402 Payment Required responses from the agent's wallet. */
  async fetch(input: string | URL, paidInit?: PaidRequestInit): Promise<Response> {
    const { maxPrice, ...init } = paidInit ?? {}
    const first = await fetch(input, init)
    if (first.status !== 402) return first

    const challenge = (await first.json().catch(() => null)) as PaymentRequired | null
    const info = await this.me()
    const requirements = challenge?.accepts?.find(
      (option) => option.scheme === 'exact' && option.network === info.network && option.asset === info.token,
    )
    if (!requirements) return new Response(JSON.stringify(challenge), { status: 402, headers: first.headers })

    const amount = BigInt(requirements.maxAmountRequired)
    const display = fromBaseUnits(amount)
    const url = first.url || String(input)
    const refusal = await this.refusal(url, requirements, amount, display, maxPrice)
    if (refusal) {
      this.onPayment?.({ type: 'refused', reason: refusal, amount: display, source: 'client' })
      throw new PaymentRefusedError(refusal, requirements, 'client')
    }

    this.onPayment?.({ type: 'paying', requirements, amount: display })
    const network: NetworkConfig = {
      name: info.network.replace('stellar-', '') as NetworkConfig['name'],
      rpcUrl: info.rpcUrl,
      networkPassphrase: info.networkPassphrase,
      decimals: 7,
    }
    const payload = await signPayment({
      rpcServer: server(network),
      network,
      agent: this.keypair,
      wallet: info.agent.wallet,
      requirements,
      simulationSource: info.simulationSource,
    })

    const headers = new Headers(init?.headers)
    headers.set(PAYMENT_HEADER, encodeHeader(payload))
    const paid = await fetch(input, { ...init, headers })

    const receipt = paid.headers.get(PAYMENT_RESPONSE_HEADER)
    const settlement = receipt ? decodeHeader<SettleResponse>(receipt) : undefined
    if (paid.status === 402) {
      const body = (await paid.clone().json().catch(() => ({}))) as { error?: string }
      const reason = settlement?.errorReason ?? body.error ?? 'Payment was not accepted'
      this.onPayment?.({ type: 'refused', reason, amount: display, source: 'wallet' })
      throw new PaymentRefusedError(reason, requirements)
    }
    if (settlement) this.onPayment?.({ type: 'paid', settlement, amount: display })
    return paid
  }

  /** Why this agent shouldn't sign the payment, or undefined if it may. */
  private async refusal(
    url: string,
    requirements: PaymentRequirements,
    amount: bigint,
    display: string,
    maxPrice: string | undefined,
  ): Promise<string | undefined> {
    if (amount <= 0n) return `Asks a payment of ${display}`
    if (this.maxPerRequest !== undefined && amount > this.maxPerRequest) {
      return `Asks ${display}, above this client's maxPerRequest of ${fromBaseUnits(this.maxPerRequest)}`
    }
    if (maxPrice !== undefined && amount > toBaseUnits(maxPrice)) {
      return `Asks ${display}, above the ${maxPrice} expected for this request`
    }
    const payee = await payeeRefusal(this.payees, url, requirements.payTo, (origin) => this.directory(origin))
    if (payee) return payee
    return hookRefusal(this.beforePay, { url, requirements, amount: display })
  }

  /** Asks the owner to approve a payment the mandate refused. Returns the pending approval. */
  requestApproval(input: { payTo: string; amount: string; description: string; resource?: string; reason?: string }) {
    return this.api<Approval>('/approvals', { method: 'POST', body: input })
  }

  approval(id: string) {
    return this.api<Approval>(`/approvals/${id}`)
  }

  /** Polls until the owner decides, or the timeout passes. */
  async waitForApproval(id: string, { timeoutMs = 10 * 60_000, intervalMs = 3000 } = {}) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const approval = await this.approval(id)
      if (approval.status !== 'pending' || Date.now() > deadline) return approval
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}

export { PaymentRefusedError as RefusedError }
