import { createHmac, randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { HTTPException } from 'hono/http-exception'
import { newId, now, type Db } from './db.ts'

/**
 * Webhooks: signed events sent to an owner's endpoints, with retries.
 *
 * Each delivery is a POST with the JSON event as the body and
 *   Oryne-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the endpoint secret>
 * so the receiver can check it came from Oryne and is fresh.
 */

export const eventTypes = [
  'payment.settled',
  'payment.refused',
  'approval.requested',
  'approval.approved',
  'approval.declined',
] as const
export type EventType = (typeof eventTypes)[number] | 'ping'

const MAX_ENDPOINTS = 10
/** Seconds to wait before each retry; after the last, the delivery is marked failed. */
const RETRY_AFTER = [30, 120, 600, 3600, 21_600]
const TIMEOUT_MS = 10_000

type EndpointRow = {
  id: string
  owner: string
  url: string
  events: string
  secret: string
  created_at: number
  disabled_at: number | null
}

type DeliveryRow = {
  id: string
  webhook_id: string
  owner: string
  event: string
  payload: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  response_status: number | null
  error: string | null
  next_attempt_at: number | null
  created_at: number
  delivered_at: number | null
}

const endpointView = (row: EndpointRow) => ({
  id: row.id,
  url: row.url,
  events: JSON.parse(row.events) as string[],
  createdAt: row.created_at,
  disabledAt: row.disabled_at,
})

const deliveryView = (row: DeliveryRow & { url?: string }) => ({
  id: row.id,
  webhook: row.webhook_id,
  url: row.url,
  event: row.event,
  status: row.status,
  attempts: row.attempts,
  responseStatus: row.response_status,
  error: row.error,
  createdAt: row.created_at,
  deliveredAt: row.delivered_at,
  nextAttemptAt: row.next_attempt_at,
})

/** True for loopback, private, link-local and other addresses a webhook must never reach. */
function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
  }
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  )
}

/**
 * Checks an endpoint URL: https only, and its host must resolve to public
 * addresses, so webhooks can't be pointed at the API's own network. Local
 * development (allowLocal) may use http://localhost.
 */
async function checkUrl(raw: string, allowLocal: boolean) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HTTPException(400, { message: 'Enter a full URL, e.g. https://example.com/webhooks/oryne' })
  }
  const local = allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (local) return url
  if (url.protocol !== 'https:') throw new HTTPException(400, { message: 'Webhook URLs must use https' })
  if (url.username || url.password) throw new HTTPException(400, { message: 'Leave credentials out of the URL' })
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address)
  if (addresses.length === 0) throw new HTTPException(400, { message: `Can't resolve ${url.hostname}` })
  if (addresses.some(isPrivateAddress)) throw new HTTPException(400, { message: 'Webhook URLs must point to a public address' })
  return url
}

export function createWebhooks(db: Db, options: { allowLocal: boolean }) {
  async function add(owner: string, input: { url?: unknown; events?: unknown }) {
    const url = await checkUrl(String(input.url ?? '').trim(), options.allowLocal)
    const requested = Array.isArray(input.events) ? input.events : []
    const events = eventTypes.filter((type) => requested.includes(type))
    if (events.length === 0) throw new HTTPException(400, { message: `Pick at least one event: ${eventTypes.join(', ')}` })
    const active = await db
      .prepare('select count(*) as n from webhooks where owner = ? and disabled_at is null')
      .get<{ n: number }>(owner)
    if (Number(active?.n ?? 0) >= MAX_ENDPOINTS) {
      throw new HTTPException(409, { message: `You have ${MAX_ENDPOINTS} endpoints. Remove one first.` })
    }
    const id = newId('wh')
    const secret = `whsec_${randomBytes(24).toString('base64url')}`
    await db
      .prepare('insert into webhooks (id, owner, url, events, secret, created_at) values (?, ?, ?, ?, ?, ?)')
      .run(id, owner, url.toString(), JSON.stringify(events), secret, now())
    const row = await db.prepare('select * from webhooks where id = ?').get<EndpointRow>(id)
    return { ...endpointView(row!), secret }
  }

  async function owned(owner: string, id: string) {
    const row = await db.prepare('select * from webhooks where id = ? and owner = ?').get<EndpointRow>(id, owner)
    if (!row || row.disabled_at) throw new HTTPException(404, { message: 'No such endpoint' })
    return row
  }

  async function enqueue(endpoint: EndpointRow, type: EventType, data: unknown) {
    const id = newId('evt')
    const event = { id, type, created: now(), data }
    await db
      .prepare(
        `insert into webhook_deliveries (id, webhook_id, owner, event, payload, status, attempts, next_attempt_at, created_at)
         values (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      )
      .run(id, endpoint.id, endpoint.owner, type, JSON.stringify(event), now(), now())
  }

  /** Queues an event for every endpoint of `owner` that listens to it. Never throws. */
  async function emit(owner: string, type: (typeof eventTypes)[number], data: unknown) {
    try {
      const endpoints = await db
        .prepare('select * from webhooks where owner = ? and disabled_at is null')
        .all<EndpointRow>(owner)
      for (const endpoint of endpoints) {
        if ((JSON.parse(endpoint.events) as string[]).includes(type)) await enqueue(endpoint, type, data)
      }
      if (endpoints.length) void deliverDue()
    } catch (error) {
      console.error('webhook emit', (error as Error).message)
    }
  }

  async function send(delivery: DeliveryRow, endpoint: EndpointRow) {
    const attempts = delivery.attempts + 1
    let responseStatus: number | null = null
    let error: string | null = null
    try {
      const url = await checkUrl(endpoint.url, options.allowLocal)
      const timestamp = now()
      const signature = createHmac('sha256', endpoint.secret).update(`${timestamp}.${delivery.payload}`).digest('hex')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Oryne-Webhooks/1',
          'oryne-event': delivery.event,
          'oryne-delivery': delivery.id,
          'oryne-signature': `t=${timestamp},v1=${signature}`,
        },
        body: delivery.payload,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      responseStatus = response.status
      if (!response.ok) error = `Your endpoint answered ${response.status}`
    } catch (reason) {
      error =
        reason instanceof HTTPException
          ? reason.message
          : (reason as Error).name === 'TimeoutError'
            ? `No answer within ${TIMEOUT_MS / 1000} s`
            : `Couldn't connect: ${(reason as Error).message}`
    }

    if (!error) {
      await db
        .prepare(
          "update webhook_deliveries set status = 'delivered', attempts = ?, response_status = ?, error = null, next_attempt_at = null, delivered_at = ? where id = ?",
        )
        .run(attempts, responseStatus, now(), delivery.id)
      return
    }
    const wait = RETRY_AFTER[attempts - 1]
    await db
      .prepare('update webhook_deliveries set status = ?, attempts = ?, response_status = ?, error = ?, next_attempt_at = ? where id = ?')
      .run(wait === undefined ? 'failed' : 'pending', attempts, responseStatus, error, wait === undefined ? null : now() + wait, delivery.id)
  }

  let running = false
  /** Sends every delivery that's due. One run at a time. */
  async function deliverDue() {
    if (running) return
    running = true
    try {
      const due = await db
        .prepare(
          `select d.* from webhook_deliveries d join webhooks w on w.id = d.webhook_id
           where d.status = 'pending' and d.next_attempt_at <= ? and w.disabled_at is null
           order by d.next_attempt_at limit 25`,
        )
        .all<DeliveryRow>(now())
      for (const delivery of due) {
        const endpoint = await db.prepare('select * from webhooks where id = ?').get<EndpointRow>(delivery.webhook_id)
        if (endpoint) await send(delivery, endpoint)
      }
    } catch (error) {
      console.error('webhook delivery', (error as Error).message)
    } finally {
      running = false
    }
  }

  return {
    eventTypes,
    add,
    emit,
    /** Checks for due deliveries every few seconds. */
    start() {
      const timer = setInterval(() => void deliverDue(), 5000)
      timer.unref()
    },
    async list(owner: string) {
      const endpoints = await db
        .prepare('select * from webhooks where owner = ? and disabled_at is null order by created_at desc')
        .all<EndpointRow>(owner)
      const deliveries = await db
        .prepare(
          `select d.*, w.url from webhook_deliveries d join webhooks w on w.id = d.webhook_id
           where d.owner = ? order by d.created_at desc limit 50`,
        )
        .all<DeliveryRow & { url: string }>(owner)
      return { events: eventTypes, endpoints: endpoints.map(endpointView), deliveries: deliveries.map(deliveryView) }
    },
    async remove(owner: string, id: string) {
      await owned(owner, id)
      await db.prepare('update webhooks set disabled_at = ? where id = ?').run(now(), id)
      await db.prepare("update webhook_deliveries set status = 'failed', error = 'Endpoint removed' where webhook_id = ? and status = 'pending'").run(id)
    },
    /** Sends a ping event to one endpoint now. */
    async test(owner: string, id: string) {
      const endpoint = await owned(owner, id)
      await enqueue(endpoint, 'ping', { message: 'Webhook test from Oryne' })
      await deliverDue()
    },
    /**
     * One more attempt now. The count isn't reset: a delivery that had used up
     * its retries is marked failed again if this one fails too.
     */
    async retry(owner: string, id: string) {
      const row = await db.prepare('select * from webhook_deliveries where id = ? and owner = ?').get<DeliveryRow>(id, owner)
      if (!row) throw new HTTPException(404, { message: 'No such delivery' })
      await db.prepare("update webhook_deliveries set status = 'pending', next_attempt_at = ? where id = ?").run(now(), id)
      await deliverDue()
    },
  }
}

export type Webhooks = ReturnType<typeof createWebhooks>
