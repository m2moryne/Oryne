import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { Keypair } from '@stellar/stellar-sdk'
import type { PaymentRequirements } from '@oryne/core'
import { OryneAgent, PaymentRefusedError, parsePayeeRule, payeeRefusal, type PaymentEvent } from './index.ts'

const MERCHANT = Keypair.random().publicKey()
const ATTACKER = Keypair.random().publicKey()
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
const API = 'https://api.oryne.test'

const listing = (url: string, payTo: string) => ({ url, payTo })
const lookup = (listings: Array<{ url: string; payTo: string }>) => async () => listings

test('any payee passes', async () => {
  assert.equal(await payeeRefusal('any', 'https://x.test/a', ATTACKER, lookup([])), undefined)
})

test('an explicit payee list only allows its addresses', async () => {
  assert.equal(await payeeRefusal([MERCHANT], 'https://x.test/a', MERCHANT, lookup([])), undefined)
  assert.match((await payeeRefusal([MERCHANT], 'https://x.test/a', ATTACKER, lookup([])))!, /not in this agent's allowed payees/)
})

test('directory rule: the host must be listed, at the address it asks to be paid', async () => {
  const directory = lookup([listing('https://api.shop.test/search', MERCHANT)])
  assert.equal(await payeeRefusal('directory', 'https://api.shop.test/other?q=1', MERCHANT, directory), undefined)
  assert.match((await payeeRefusal('directory', 'https://api.shop.test/search', ATTACKER, directory))!, /but its directory listing pays/)
  assert.match((await payeeRefusal('directory', 'https://evil.test/search', MERCHANT, directory))!, /not listed/)
})

test('directory rule: a listing for another port or scheme does not count', async () => {
  const directory = lookup([listing('https://api.shop.test/search', MERCHANT)])
  assert.match((await payeeRefusal('directory', 'http://api.shop.test/search', MERCHANT, directory))!, /not listed/)
  assert.match((await payeeRefusal('directory', 'https://api.shop.test:8443/search', MERCHANT, directory))!, /not listed/)
})

test('directory rule fails closed when the directory cannot be reached', async () => {
  const down = async () => {
    throw new Error('offline')
  }
  assert.match((await payeeRefusal('directory', 'https://api.shop.test/', MERCHANT, down))!, /Could not check/)
})

test('payee rules parse from text', () => {
  assert.equal(parsePayeeRule(undefined), undefined)
  assert.equal(parsePayeeRule(' directory '), 'directory')
  assert.deepEqual(parsePayeeRule(`${MERCHANT}, ${ATTACKER}`), [MERCHANT, ATTACKER])
})

// ---------------------------------------------------------------- fetch()

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fake network: a merchant that answers 402 asking `price` to `payTo`, and the Oryne API. */
function network(options: { payTo: string; price: string; listings?: Array<{ url: string; payTo: string }> }) {
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    calls.push(url.pathname)
    if (url.origin === API && url.pathname === '/v1/agent') {
      return Response.json({
        agent: { publicKey: 'G', wallet: 'C', name: 'test', status: 'active', perTx: '1', budget: '10' },
        network: 'stellar-testnet',
        rpcUrl: 'https://rpc.invalid',
        networkPassphrase: 'Test SDF Network ; September 2015',
        token: TOKEN,
        simulationSource: MERCHANT,
        walletBalance: '10',
      })
    }
    if (url.origin === API && url.pathname === '/v1/services') {
      return Response.json({ services: options.listings ?? [] })
    }
    if (url.pathname === '/v1/agent/approvals') return Response.json({})
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'stellar-testnet',
      asset: TOKEN,
      maxAmountRequired: String(Math.round(Number(options.price) * 1e7)),
      payTo: options.payTo,
      resource: url.toString(),
      facilitator: `${API}/v1/x402`,
      maxTimeoutSeconds: 60,
    }
    return Response.json({ x402Version: 1, accepts: [requirements] }, { status: 402 })
  }) as typeof fetch
  return calls
}

const agent = (options: Partial<ConstructorParameters<typeof OryneAgent>[0]> = {}) =>
  new OryneAgent({ secret: Keypair.random().secret(), apiUrl: API, ...options })

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => assert.fail('expected a refusal'),
    (error: unknown) => error,
  )
  assert.ok(error instanceof PaymentRefusedError)
  return error
}

test('fetch refuses a payment above maxPrice before signing', async () => {
  network({ payTo: MERCHANT, price: '0.50' })
  const events: PaymentEvent[] = []
  const error = await refusal(agent({ onPayment: (event) => events.push(event) }).fetch('https://api.shop.test/search', { maxPrice: '0.10' }))
  assert.equal(error.source, 'client')
  assert.match(error.reason, /above the 0.10 expected/)
  assert.deepEqual(events.map((event) => event.type), ['refused'])
})

test('fetch refuses a payee that does not match the directory listing', async () => {
  network({ payTo: ATTACKER, price: '0.05', listings: [listing('https://api.shop.test/search', MERCHANT)] })
  const error = await refusal(agent({ payees: 'directory' }).fetch('https://api.shop.test/search'))
  assert.equal(error.source, 'client')
  assert.match(error.reason, /directory listing pays/)
})

test('fetch refuses an unlisted service under the directory rule', async () => {
  network({ payTo: ATTACKER, price: '0.05', listings: [] })
  const error = await refusal(agent({ payees: 'directory' }).fetch('https://evil.test/data'))
  assert.match(error.reason, /not listed/)
})

test('beforePay can refuse with a reason', async () => {
  network({ payTo: MERCHANT, price: '0.05' })
  const seen: string[] = []
  const error = await refusal(
    agent({
      beforePay: ({ url, amount }) => {
        seen.push(`${url} ${amount}`)
        return 'not this one'
      },
    }).fetch('https://api.shop.test/search'),
  )
  assert.equal(error.reason, 'not this one')
  assert.deepEqual(seen, ['https://api.shop.test/search 0.05'])
})

test('directory lookups are cached per origin', async () => {
  const calls = network({ payTo: ATTACKER, price: '0.05', listings: [listing('https://api.shop.test/', MERCHANT)] })
  const client = agent({ payees: 'directory' })
  await refusal(client.fetch('https://api.shop.test/a'))
  await refusal(client.fetch('https://api.shop.test/b'))
  assert.equal(calls.filter((path) => path === '/v1/services').length, 1)
})
