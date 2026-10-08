/**
 * Mock data for the developer console preview. None of this exists yet: the
 * API host, endpoints, package names, key formats, events, plans and prices
 * below are a sketch of the developer surface to build, not a live API.
 */

export type Mode = 'test' | 'live'

export type ApiKey = {
  id: string
  name: string
  mode: Mode
  /** Only the last four characters are kept; the full secret is shown once, on creation. */
  last4: string
  scopes: string[]
  createdAt: string
  lastUsedAt?: string
}

export type WebhookEndpoint = {
  id: string
  url: string
  mode: Mode
  events: string[]
  enabled: boolean
  secretLast4: string
  createdAt: string
}

export type Role = 'Owner' | 'Admin' | 'Developer' | 'Viewer'

export type Member = {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited'
  lastActiveAt?: string
}

export type DevState = {
  mode: Mode
  keys: ApiKey[]
  webhooks: WebhookEndpoint[]
  team: Member[]
  org: { name: string; supportEmail: string; requireTwoFactor: boolean; ipAllowlist: boolean }
}

export type LogEntry = {
  id: string
  at: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  status: number
  latency: number
  keyName: string
  mode: Mode
  /** Client library and version that sent the request. */
  client: string
  ip: string
  idempotencyKey?: string
  request?: unknown
  response: unknown
}

export type Delivery = {
  id: string
  event: string
  url: string
  status: number
  attempts: number
  at: string
  mode: Mode
}

/** An agent registered through the API, as a developer would see it. */
export type DevAgent = {
  id: string
  name: string
  /** The developer's own reference for the end user this agent acts for. */
  externalId: string
  status: 'active' | 'paused'
  monthly: number
  perPurchase: number
  spent: number
  payments: number
  createdAt: string
  lastPaymentAt?: string
  mode: Mode
}

export const API = {
  base: 'https://api.oryne.org/v1',
  version: '2026-10-01',
  rateLimit: 600,
}

export const scopes = [
  { id: 'agents:read', note: 'List agents and read their limits' },
  { id: 'agents:write', note: 'Create agents and change their limits' },
  { id: 'payments:read', note: 'Read payments and their status' },
  { id: 'payments:write', note: 'Make payments on behalf of an agent' },
  { id: 'wallet:read', note: 'Read the balance and funding history' },
  { id: 'webhooks:write', note: 'Manage webhook endpoints' },
]

export const eventTypes = [
  { type: 'agent.connected', note: 'An agent was created or connected.' },
  { type: 'agent.paused', note: 'An agent was paused and can no longer spend.' },
  { type: 'payment.settled', note: 'A payment went through and was deducted from the balance.' },
  { type: 'payment.declined', note: 'A payment was refused; the reason is in the payload.' },
  { type: 'approval.requested', note: 'An agent is waiting for its owner to approve a purchase.' },
  { type: 'budget.threshold_reached', note: 'An agent has used 80% of its budget.' },
  { type: 'budget.exhausted', note: 'An agent has no budget left this period.' },
  { type: 'wallet.funded', note: 'Funds were added to the balance.' },
  { type: 'wallet.low_balance', note: 'The balance cannot cover the remaining budgets.' },
]

export const roles: Array<{ role: Role; note: string }> = [
  { role: 'Owner', note: 'Everything, including billing and deleting the organization.' },
  { role: 'Admin', note: 'Manage keys, webhooks, team members and settings.' },
  { role: 'Developer', note: 'Create test keys, read logs and usage. No live keys.' },
  { role: 'Viewer', note: 'Read-only access to logs, usage and agents.' },
]

export const maskKey = (key: Pick<ApiKey, 'mode' | 'last4'>) => `oryne_${key.mode}_sk_••••••••${key.last4}`

const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000

function sequence(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const token = (random: () => number, length: number) =>
  Array.from({ length }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(random() * 31)]).join('')

export function randomToken(length: number) {
  return token(Math.random, length)
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

export function seedDev(): DevState {
  return {
    mode: 'test',
    keys: [
      {
        id: 'key_test_default',
        name: 'Local development',
        mode: 'test',
        last4: 'a91f',
        scopes: scopes.map((scope) => scope.id),
        createdAt: ago(21 * DAY),
        lastUsedAt: ago(4 * MINUTE),
      },
      {
        id: 'key_test_ci',
        name: 'CI pipeline',
        mode: 'test',
        last4: '7k2m',
        scopes: ['agents:read', 'payments:read', 'payments:write'],
        createdAt: ago(9 * DAY),
        lastUsedAt: ago(3 * HOUR),
      },
      {
        id: 'key_test_staging',
        name: 'Staging server',
        mode: 'test',
        last4: 'h8wq',
        scopes: scopes.map((scope) => scope.id),
        createdAt: ago(6 * DAY),
        lastUsedAt: ago(41 * MINUTE),
      },
      {
        id: 'key_live_server',
        name: 'Production server',
        mode: 'live',
        last4: 'x4pd',
        scopes: ['agents:read', 'agents:write', 'payments:read', 'payments:write', 'wallet:read'],
        createdAt: ago(5 * DAY),
        lastUsedAt: ago(2 * MINUTE),
      },
      {
        id: 'key_live_reporting',
        name: 'Reporting job (read-only)',
        mode: 'live',
        last4: 'm2ev',
        scopes: ['agents:read', 'payments:read', 'wallet:read'],
        createdAt: ago(3 * DAY),
        lastUsedAt: ago(7 * HOUR),
      },
    ],
    webhooks: [
      {
        id: 'wh_test_staging',
        url: 'https://staging.brightwell.dev/webhooks/oryne',
        mode: 'test',
        events: ['payment.settled', 'payment.declined', 'approval.requested', 'budget.exhausted'],
        enabled: true,
        secretLast4: 'q8zt',
        createdAt: ago(14 * DAY),
      },
      {
        id: 'wh_test_tunnel',
        url: 'https://f3a9c1.tunnel.oryne.dev/webhooks/oryne',
        mode: 'test',
        events: ['payment.settled', 'payment.declined'],
        enabled: false,
        secretLast4: 'c5rk',
        createdAt: ago(8 * DAY),
      },
      {
        id: 'wh_live_prod',
        url: 'https://api.brightwell.dev/hooks/oryne',
        mode: 'live',
        events: ['payment.settled', 'payment.declined', 'approval.requested', 'wallet.low_balance'],
        enabled: true,
        secretLast4: 'n3vw',
        createdAt: ago(5 * DAY),
      },
    ],
    team: [
      { id: 'mem_2', name: 'Tomás Rivera', email: 'tomas@brightwell.dev', role: 'Admin', status: 'active', lastActiveAt: ago(26 * MINUTE) },
      { id: 'mem_3', name: 'Priya Nair', email: 'priya@brightwell.dev', role: 'Developer', status: 'active', lastActiveAt: ago(3 * HOUR) },
      { id: 'mem_4', name: 'Jonas Weber', email: 'jonas@brightwell.dev', role: 'Developer', status: 'active', lastActiveAt: ago(2 * DAY) },
      { id: 'mem_5', name: 'Leila Haddad', email: 'leila@brightwell.dev', role: 'Viewer', status: 'invited' },
    ],
    org: { name: 'Brightwell Labs', supportEmail: 'support@brightwell.dev', requireTwoFactor: true, ipAllowlist: false },
  }
}

const catalogue = [
  { merchant: 'lumen-search', description: 'Web search, 500 queries', min: 200, max: 600 },
  { merchant: 'fathom-market-data', description: 'Daily market snapshot', min: 800, max: 1800 },
  { merchant: 'quill-docs', description: 'Document parsing, 40 pages', min: 300, max: 900 },
  { merchant: 'halcyon-compute', description: 'Compute, 2 hours', min: 300, max: 900 },
  { merchant: 'skylane-fares', description: 'Flight search, 120 routes', min: 300, max: 800 },
  { merchant: 'meridian-maps', description: 'Route planning', min: 100, max: 400 },
  { merchant: 'northwind-data', description: 'Company dataset access', min: 1000, max: 2200 },
  { merchant: 'atlas-translate', description: 'Translation, 12 pages', min: 400, max: 1200 },
]

const agentNames = [
  'Research assistant',
  'Travel concierge',
  'Procurement bot',
  'Inbox triage',
  'Market watcher',
  'Support copilot',
  'Data collector',
  'Booking agent',
  'Invoice chaser',
  'Lab notebook',
  'Price tracker',
  'Onboarding guide',
]

let cachedAgents: DevAgent[] | null = null

/** Agents registered through the API by this organization's product. */
export function mockAgents(): DevAgent[] {
  if (cachedAgents) return cachedAgents
  const random = sequence(31)
  cachedAgents = agentNames.map((name, index) => {
    const mode: Mode = index % 3 === 2 ? 'live' : 'test'
    const monthly = [10000, 20000, 25000, 40000, 50000, 100000][Math.floor(random() * 6)]
    const spent = Math.round(monthly * (0.08 + random() * 0.85))
    return {
      id: `agt_${token(random, 8)}`,
      name,
      externalId: `user_${1000 + Math.floor(random() * 8999)}`,
      status: random() > 0.85 ? 'paused' : 'active',
      monthly,
      perPurchase: [1000, 2500, 5000][Math.floor(random() * 3)],
      spent,
      payments: 6 + Math.floor(random() * 140),
      createdAt: ago((2 + Math.floor(random() * 27)) * DAY),
      lastPaymentAt: ago(Math.floor(random() * 30 * HOUR) + 2 * MINUTE),
      mode,
    }
  })
  return cachedAgents
}

const agentObject = (agent: DevAgent) => ({
  id: agent.id,
  object: 'agent',
  name: agent.name,
  external_id: agent.externalId,
  status: agent.status,
  budget: {
    monthly: agent.monthly,
    per_purchase: agent.perPurchase,
    spent: agent.spent,
    currency: 'usd',
    resets_at: new Date(Date.now() + 9 * DAY).toISOString().slice(0, 10),
  },
  livemode: agent.mode === 'live',
  created: agent.createdAt,
})

export const agentJson = (agent: DevAgent) => JSON.stringify(agentObject(agent), null, 2)

const errors: Record<number, (agent: DevAgent) => unknown> = {
  400: () => ({ error: { type: 'invalid_request', code: 'parameter_invalid', message: 'amount must be a positive integer, in cents.', param: 'amount' } }),
  401: () => ({ error: { type: 'authentication_error', code: 'key_revoked', message: 'This API key has been revoked.' } }),
  402: () => ({ error: { type: 'payment_declined', code: 'budget_exhausted', message: 'The agent has no budget left this period.' } }),
  404: (agent) => ({ error: { type: 'not_found', code: 'resource_missing', message: `No such agent: ${agent.id.slice(0, -1)}x` } }),
  429: () => ({ error: { type: 'rate_limited', code: 'too_many_requests', message: 'Too many requests. Retry after 2 seconds.', retry_after: 2 } }),
  500: () => ({ error: { type: 'api_error', code: 'internal', message: 'Something went wrong on our side. The request was not processed.' } }),
}

const clients = ['oryne-node/0.4.2', 'oryne-node/0.4.2', 'oryne-python/0.3.1', 'oryne-python/0.3.1', 'oryne-go/0.2.0', 'curl/8.9.1']
const liveIps = ['203.0.113.24', '203.0.113.25', '203.0.113.31']
const testIps = ['198.51.100.7', '198.51.100.18', '192.0.2.44', '192.0.2.101']

let cachedLogs: LogEntry[] | null = null

/** Two weeks of API requests, newest first. The same on every load. */
export function mockLogs(): LogEntry[] {
  if (cachedLogs) return cachedLogs
  const random = sequence(11)
  const now = Date.now()
  const agents = mockAgents()
  const logs: LogEntry[] = []
  const pick = <Item,>(items: Item[]) => items[Math.floor(random() * items.length)]

  for (let day = 13; day >= 0; day--) {
    // Traffic grows over the fortnight, with quieter weekends.
    const weekday = new Date(now - day * DAY).getDay()
    const volume = Math.round(
      (70 + (13 - day) * 11) * (weekday === 0 || weekday === 6 ? 0.4 : 1) * (0.8 + random() * 0.4),
    )
    for (let n = 0; n < volume; n++) {
      const mode: Mode = random() < 0.7 ? 'test' : 'live'
      const agent = pick(agents.filter((candidate) => candidate.mode === mode))
      const item = pick(catalogue)
      const amount = Math.round(item.min + random() * (item.max - item.min))
      const paymentId = `pay_${token(random, 8)}`
      const created = new Date(
        now - day * DAY - Math.floor(random() * (day === 0 ? 9 * HOUR : DAY)),
      ).toISOString()

      const payment = {
        id: paymentId,
        object: 'payment',
        agent: agent.id,
        amount,
        currency: 'usd',
        merchant: item.merchant,
        description: item.description,
        status: 'settled',
        livemode: mode === 'live',
        created,
      }

      const kind = random()
      let method: LogEntry['method'] = 'GET'
      let path = '/v1/agents'
      let ok = 200
      let request: unknown
      let response: unknown = { object: 'list', data: [agentObject(agent)], has_more: true, next_cursor: `cur_${token(random, 10)}` }

      if (kind < 0.46) {
        method = 'POST'
        path = '/v1/payments'
        ok = 201
        request = { agent: agent.id, amount, currency: 'usd', merchant: item.merchant, description: item.description }
        response = payment
      } else if (kind < 0.6) {
        path = `/v1/payments/${paymentId}`
        response = payment
      } else if (kind < 0.74) {
        path = `/v1/agents/${agent.id}`
        response = agentObject(agent)
      } else if (kind < 0.86) {
        path = '/v1/wallet/balance'
        response = { object: 'balance', available: 1_284_650 + Math.floor(random() * 90_000), pending: 4_210, currency: 'usd', livemode: mode === 'live' }
      } else if (kind < 0.9) {
        method = 'POST'
        ok = 201
        request = { name: agent.name, external_id: agent.externalId, budget: { monthly: agent.monthly, per_purchase: agent.perPurchase } }
        response = agentObject(agent)
      } else if (kind < 0.94) {
        method = 'PATCH'
        path = `/v1/agents/${agent.id}/limits`
        request = { monthly: agent.monthly }
        response = agentObject(agent)
      }

      const roll = random()
      const status =
        roll > 0.94
          ? path === '/v1/payments'
            ? 402
            : pick([400, 401, 404, 429])
          : roll < 0.004
            ? 500
            : ok

      logs.push({
        id: `req_${token(random, 16)}`,
        at: created,
        method,
        path,
        status,
        latency: Math.round(
          (method === 'POST' ? 64 : 31) + random() * 70 + (status >= 500 ? 1100 : 0) + (random() > 0.96 ? 240 : 0),
        ),
        keyName:
          mode === 'live'
            ? method === 'GET' && random() < 0.25
              ? 'Reporting job (read-only)'
              : 'Production server'
            : pick(['Local development', 'Local development', 'Staging server', 'CI pipeline']),
        mode,
        client: pick(clients),
        ip: pick(mode === 'live' ? liveIps : testIps),
        idempotencyKey: method === 'POST' ? `idem_${token(random, 12)}` : undefined,
        request,
        response: status === ok ? response : errors[status](agent),
      })
    }
  }
  cachedLogs = logs.filter((log) => new Date(log.at).getTime() <= now).sort((a, b) => b.at.localeCompare(a.at))
  return cachedLogs
}

let cachedDeliveries: Delivery[] | null = null

export function mockDeliveries(): Delivery[] {
  if (cachedDeliveries) return cachedDeliveries
  const random = sequence(23)
  const now = Date.now()
  const events = [
    'payment.settled',
    'payment.settled',
    'payment.settled',
    'payment.settled',
    'payment.declined',
    'approval.requested',
    'budget.exhausted',
    'wallet.low_balance',
  ]
  cachedDeliveries = Array.from({ length: 40 }, (_, index) => {
    const mode: Mode = random() < 0.7 ? 'test' : 'live'
    const failed = random() > 0.9
    const event = events[Math.floor(random() * events.length)]
    return {
      id: `evt_${token(random, 16)}`,
      event: mode === 'test' && event === 'wallet.low_balance' ? 'payment.settled' : event,
      url: mode === 'test' ? 'https://staging.brightwell.dev/webhooks/oryne' : 'https://api.brightwell.dev/hooks/oryne',
      status: failed ? (random() > 0.5 ? 503 : 408) : 200,
      attempts: failed ? 3 : 1,
      at: new Date(now - index * 47 * MINUTE - Math.floor(random() * 30 * MINUTE)).toISOString(),
      mode,
    }
  })
  return cachedDeliveries
}

/** Illustrative only: no pricing has been decided. */
export const billing = {
  plan: 'Scale',
  note: 'Usage-based. No monthly minimum.',
  feeRate: 0.006,
  includedVolume: 10_000,
  volume: 48_216.4,
  payments: 9_412,
  periodEnds: new Date(Date.now() + 9 * DAY).toISOString(),
  invoices: [
    { id: 'INV-2026-0009', period: 'September 2026', volume: 61_840.25, amount: 311.04, status: 'Paid' },
    { id: 'INV-2026-0008', period: 'August 2026', volume: 44_102.9, amount: 204.62, status: 'Paid' },
    { id: 'INV-2026-0007', period: 'July 2026', volume: 29_377.1, amount: 116.26, status: 'Paid' },
    { id: 'INV-2026-0006', period: 'June 2026', volume: 12_905.6, amount: 17.43, status: 'Paid' },
  ],
}

/** Code samples. The key placeholder is swapped for the masked key in view. */
export const snippets = {
  install: {
    npm: 'npm install @oryne/sdk',
    pip: 'pip install oryne',
    cli: 'npm install -g @oryne/cli\noryne login',
  },
  env: (key: string) => `# .env\nORYNE_API_KEY=${key}`,
  firstPayment: {
    'Node.js': `import Oryne from '@oryne/sdk'

const oryne = new Oryne(process.env.ORYNE_API_KEY)

// 1. Register your agent and give it limits (amounts are in cents).
const agent = await oryne.agents.create({
  name: 'Research assistant',
  externalId: 'user_1042',
  budget: { monthly: 400_00, perPurchase: 25_00 },
})

// 2. Let it pay. Oryne checks the limits and the balance first.
const payment = await oryne.payments.create({
  agent: agent.id,
  amount: 4_35,
  currency: 'usd',
  merchant: 'lumen-search',
  description: 'Web search, 500 queries',
})

console.log(payment.status) // "settled", "declined" or "needs_approval"`,
    Python: `import os
from oryne import Oryne

oryne = Oryne(api_key=os.environ["ORYNE_API_KEY"])

# 1. Register your agent and give it limits (amounts are in cents).
agent = oryne.agents.create(
    name="Research assistant",
    external_id="user_1042",
    budget={"monthly": 400_00, "per_purchase": 25_00},
)

# 2. Let it pay. Oryne checks the limits and the balance first.
payment = oryne.payments.create(
    agent=agent.id,
    amount=4_35,
    currency="usd",
    merchant="lumen-search",
    description="Web search, 500 queries",
)

print(payment.status)  # "settled", "declined" or "needs_approval"`,
    cURL: `curl ${API.base}/payments \\
  -H "Authorization: Bearer $ORYNE_API_KEY" \\
  -H "Oryne-Version: ${API.version}" \\
  -H "Idempotency-Key: idem_7f3c2a9e41b8" \\
  -d agent=agt_8f2k1mq7 \\
  -d amount=435 \\
  -d currency=usd \\
  -d merchant=lumen-search \\
  -d description="Web search, 500 queries"`,
  },
  verifyWebhook: {
    'Node.js': `import Oryne from '@oryne/sdk'

app.post('/webhooks/oryne', express.raw({ type: 'application/json' }), (req, res) => {
  // Throws if the signature does not match your endpoint's signing secret.
  const event = Oryne.webhooks.verify(
    req.body,
    req.headers['oryne-signature'],
    process.env.ORYNE_WEBHOOK_SECRET,
  )

  if (event.type === 'payment.declined') {
    console.log(event.data.agent, event.data.decline_code)
  }

  res.sendStatus(200)
})`,
    Python: `from oryne import Oryne

@app.post("/webhooks/oryne")
def handle(request):
    # Raises if the signature does not match your endpoint's signing secret.
    event = Oryne.webhooks.verify(
        request.body,
        request.headers["oryne-signature"],
        os.environ["ORYNE_WEBHOOK_SECRET"],
    )

    if event.type == "payment.declined":
        print(event.data.agent, event.data.decline_code)

    return "", 200`,
  },
  listen: 'oryne listen --forward-to localhost:3000/webhooks/oryne',
}

export const sdks = [
  {
    name: 'Node.js',
    pkg: '@oryne/sdk',
    version: '0.4.2',
    install: 'npm install @oryne/sdk',
    note: 'TypeScript types included. Works in Node, Bun, Deno and edge runtimes.',
  },
  {
    name: 'Python',
    pkg: 'oryne',
    version: '0.3.1',
    install: 'pip install oryne',
    note: 'Sync and async clients, typed with Pydantic models.',
  },
  {
    name: 'Go',
    pkg: 'oryne-go',
    version: '0.2.0',
    install: 'go get github.com/oryne/oryne-go',
    note: 'Context-aware client with automatic retries and idempotency keys.',
  },
  {
    name: 'CLI',
    pkg: '@oryne/cli',
    version: '0.4.0',
    install: 'npm install -g @oryne/cli',
    note: 'Tail logs, forward webhooks to localhost and trigger test events.',
  },
  {
    name: 'Agent SDK',
    pkg: '@oryne/agent',
    version: '0.1.0',
    install: 'npm install @oryne/agent',
    note: 'A fetch() that pays: answers x402 and MPP challenges from the agent wallet, inside its mandate.',
  },
  {
    name: 'Merchant kit',
    pkg: '@oryne/merchant',
    version: '0.1.0',
    install: 'npm install @oryne/merchant',
    note: 'Paywall middleware for Express, Next.js and FastAPI. Get paid in USDC on Stellar.',
  },
  {
    name: 'MCP server',
    pkg: '@oryne/mcp',
    version: '0.1.3',
    install: 'npx @oryne/mcp --key $ORYNE_API_KEY',
    note: 'Tools for any MCP agent: pay, balance, find_service, request_approval. Limits enforced on-chain.',
  },
  {
    name: 'REST API',
    pkg: API.base,
    version: API.version,
    install: `curl ${API.base}/agents -H "Authorization: Bearer $ORYNE_API_KEY"`,
    note: 'Plain JSON over HTTPS for anything without an SDK.',
  },
]

/** Sandbox merchants with fixed behaviour, for testing every path. */
export const testMerchants = [
  { id: 'test-merchant-ok', behaviour: 'Always settles' },
  { id: 'test-merchant-decline', behaviour: 'Always declines with merchant_refused' },
  { id: 'test-merchant-approval', behaviour: 'Always returns needs_approval' },
  { id: 'test-merchant-slow', behaviour: 'Settles after a 10 second delay' },
  { id: 'test-merchant-timeout', behaviour: 'Never responds; the payment times out' },
]
