import {
  decodeHeader,
  encodeHeader,
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  SCHEME,
  toBaseUnits,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
} from '@oryne/core'

/**
 * Charge AI agents per request. Unpaid requests get 402 Payment Required
 * with what to pay; paid ones are settled through the Oryne facilitator
 * before your handler runs.
 *
 *   const pay = paywall({ payTo: 'G…', facilitator: 'http://localhost:8787/v1/x402' })
 *   app.get('/search', pay('0.008'), handler)   // Hono
 */

export type PaywallOptions = {
  /** Your Stellar address. It needs a trustline to the token if it's a G… account. */
  payTo: string
  /** Facilitator base URL, e.g. https://api.oryne.org/v1/x402 */
  facilitator: string
  /** Read once from GET {facilitator origin}/v1/info if not given. */
  network?: string
  asset?: string
  decimals?: number
}

type Resolved = { network: string; asset: string; decimals: number }

/** Framework-free core: decide what a request owes and whether it has paid. */
export function createPaywall(options: PaywallOptions) {
  let resolved: Promise<Resolved> | undefined

  const resolve = () =>
    (resolved ??= (async () => {
      if (options.network && options.asset) {
        return { network: options.network, asset: options.asset, decimals: options.decimals ?? 7 }
      }
      const info = (await (await fetch(new URL('/v1/info', options.facilitator))).json()) as {
        network: string
        token: string
        tokenDecimals: number
      }
      return { network: options.network ?? info.network, asset: options.asset ?? info.token, decimals: info.tokenDecimals }
    })())

  async function requirements(price: string, resource: string, description?: string): Promise<PaymentRequirements> {
    const { network, asset, decimals } = await resolve()
    return {
      scheme: SCHEME,
      network,
      asset,
      maxAmountRequired: toBaseUnits(price, decimals).toString(),
      payTo: options.payTo,
      resource,
      description,
      facilitator: options.facilitator,
      maxTimeoutSeconds: 60,
    }
  }

  async function settle(header: string, required: PaymentRequirements): Promise<SettleResponse> {
    let paymentPayload: PaymentPayload
    try {
      paymentPayload = decodeHeader<PaymentPayload>(header)
    } catch {
      return { success: false, errorReason: 'Malformed X-PAYMENT header' }
    }
    const response = await fetch(`${options.facilitator.replace(/\/$/, '')}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentPayload, paymentRequirements: required }),
    })
    if (!response.ok) return { success: false, errorReason: `Facilitator ${response.status}` }
    return (await response.json()) as SettleResponse
  }

  /**
   * Handles one request. Returns `{ paid: true, receipt }` to let the request
   * through (add `receipt` as the X-PAYMENT-RESPONSE header), or a 402 body.
   */
  async function handle(input: { price: string; url: string; paymentHeader?: string | null; description?: string }) {
    const required = await requirements(input.price, input.url, input.description)
    const challenge = (error?: string): PaymentRequired => ({ x402Version: X402_VERSION, error, accepts: [required] })
    if (!input.paymentHeader) return { paid: false as const, status: 402 as const, body: challenge('Payment required') }
    const settlement = await settle(input.paymentHeader, required)
    if (!settlement.success) {
      return {
        paid: false as const,
        status: 402 as const,
        body: challenge(settlement.errorReason),
        receipt: encodeHeader(settlement),
      }
    }
    return { paid: true as const, receipt: encodeHeader(settlement), settlement }
  }

  return { handle, requirements }
}

type HonoLike = {
  req: { url: string; header: (name: string) => string | undefined }
  json: (body: unknown, status?: number) => Response
  header: (name: string, value: string) => void
}

/** Hono middleware: `app.get('/search', pay('0.008'), handler)` */
export function paywall(options: PaywallOptions) {
  const core = createPaywall(options)
  return (price: string, description?: string) =>
    async (c: HonoLike, next: () => Promise<void>) => {
      const result = await core.handle({
        price,
        description,
        url: c.req.url,
        paymentHeader: c.req.header(PAYMENT_HEADER),
      })
      if (result.receipt) c.header(PAYMENT_RESPONSE_HEADER, result.receipt)
      if (!result.paid) return c.json(result.body, result.status)
      await next()
    }
}

type ExpressReq = { protocol: string; get: (name: string) => string | undefined; originalUrl: string }
type ExpressRes = { status: (code: number) => { json: (body: unknown) => void }; setHeader: (n: string, v: string) => void }

/** Express middleware: `app.get('/search', expressPaywall(opts)('0.008'), handler)` */
export function expressPaywall(options: PaywallOptions) {
  const core = createPaywall(options)
  return (price: string, description?: string) =>
    (req: ExpressReq, res: ExpressRes, next: (error?: unknown) => void) => {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
      core
        .handle({ price, description, url, paymentHeader: req.get(PAYMENT_HEADER) })
        .then((result) => {
          if (result.receipt) res.setHeader(PAYMENT_RESPONSE_HEADER, result.receipt)
          if (!result.paid) return res.status(result.status).json(result.body)
          next()
        })
        .catch(next)
    }
}
