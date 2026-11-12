import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { Keypair } from '@stellar/stellar-sdk'
import {
  aiSdkTools,
  anthropicTools,
  langChainTools,
  openAIAgentsTools,
  openAITools,
  OryneAgent,
  oryneTools,
  runOryneTool,
  type PaymentEvent,
} from './index.ts'

const MERCHANT = Keypair.random().publicKey()
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
const API = 'https://api.oryne.test'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fake network: the Oryne API, a free page, and a merchant asking 0.50 USDC. */
function network() {
  const requests: Array<{ path: string; body?: string }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push({ path: url.pathname + url.search, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url.origin === API && url.pathname === '/v1/agent') {
      return Response.json({
        agent: { publicKey: 'G', wallet: 'C', name: 'researcher', status: 'active', perTx: '1', budget: '10', remaining: '9.5' },
        network: 'stellar-testnet',
        rpcUrl: 'https://rpc.invalid',
        networkPassphrase: 'Test SDF Network ; September 2015',
        token: TOKEN,
        simulationSource: MERCHANT,
        walletBalance: '10',
      })
    }
    if (url.origin === API && url.pathname === '/v1/services') return Response.json({ services: [{ name: 'Search', q: url.searchParams.get('q') }] })
    if (url.pathname === '/free') return new Response('hello', { status: 200 })
    return Response.json(
      {
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'stellar-testnet',
            asset: TOKEN,
            maxAmountRequired: '5000000',
            payTo: MERCHANT,
            resource: url.toString(),
            facilitator: `${API}/v1/x402`,
            maxTimeoutSeconds: 60,
          },
        ],
      },
      { status: 402 },
    )
  }) as typeof fetch
  return requests
}

const agent = (options: Partial<ConstructorParameters<typeof OryneAgent>[0]> = {}) =>
  new OryneAgent({ secret: Keypair.random().secret(), apiUrl: API, ...options })

test('there are four tools, each with an object schema', () => {
  const tools = oryneTools(agent())
  assert.deepEqual(tools.map((tool) => tool.name), ['fetch_paid', 'wallet_status', 'request_approval', 'find_service'])
  for (const tool of tools) assert.equal(tool.parameters.type, 'object')
  assert.deepEqual(oryneTools(agent(), { only: ['fetch_paid'] }).map((tool) => tool.name), ['fetch_paid'])
})

test('fetch_paid returns a free page as it is', async () => {
  network()
  const result = await runOryneTool(oryneTools(agent()), 'fetch_paid', { url: 'https://shop.test/free' })
  assert.equal(result, 'HTTP 200\n\nhello')
})

test('fetch_paid explains a refusal over maxPrice, and the agent and the call both hear about it', async () => {
  network()
  const seen: PaymentEvent['type'][] = []
  const tools = oryneTools(agent({ onPayment: (event) => seen.push(event.type) }))
  const result = await runOryneTool(tools, 'fetch_paid', JSON.stringify({ url: 'https://shop.test/report', maxPrice: '0.10' }))
  assert.match(result, /^Not paid: Asks 0.5, above the 0.10 expected/)
  assert.match(result, new RegExp(`asked for 0.5 USDC to ${MERCHANT}`))
  assert.deepEqual(seen, ['refused'])
})

test('fetch_paid checks its input before fetching', async () => {
  const requests = network()
  const tools = oryneTools(agent())
  assert.match(await runOryneTool(tools, 'fetch_paid', { url: 'shop.test' }), /must be a full address/)
  assert.match(await runOryneTool(tools, 'fetch_paid', { url: 'https://shop.test/a', maxPrice: 'lots' }), /maxPrice must be/)
  assert.equal(requests.length, 0)
})

test('wallet_status and find_service answer with JSON text', async () => {
  network()
  const tools = oryneTools(agent())
  assert.equal(JSON.parse(await runOryneTool(tools, 'wallet_status', '')).agent.remaining, '9.5')
  assert.equal(JSON.parse(await runOryneTool(tools, 'find_service', { query: 'web search' })).services[0].q, 'web search')
})

test('request_approval refuses incomplete input without calling the API', async () => {
  const requests = network()
  const result = await runOryneTool(oryneTools(agent()), 'request_approval', { payTo: MERCHANT, amount: 'ten' })
  assert.match(result, /^Not asked/)
  assert.equal(requests.length, 0)
})

test('runOryneTool handles unknown tools and bad arguments', async () => {
  const tools = oryneTools(agent())
  assert.equal(await runOryneTool(tools, 'drain_wallet', {}), 'Unknown tool: drain_wallet')
  assert.match(await runOryneTool(tools, 'fetch_paid', '{not json'), /weren't valid JSON/)
  assert.match(await runOryneTool(tools, 'fetch_paid', '[]'), /must be an object/)
})

test('OpenAI and Anthropic formats carry the same schema', () => {
  const tools = oryneTools(agent())
  const openai = openAITools(tools)
  assert.equal(openai[0].type, 'function')
  assert.equal(openai[0].function.name, 'fetch_paid')
  assert.deepEqual(openai[0].function.parameters, tools[0].parameters)
  const claude = anthropicTools(tools)
  assert.deepEqual(claude[3], { name: 'find_service', description: tools[3].description, input_schema: tools[3].parameters })
})

test('framework adapters call the framework helpers and run the Oryne tool', async () => {
  network()
  const tools = oryneTools(agent(), { only: ['fetch_paid'] })
  const identity = (definition: unknown) => definition

  const ai = aiSdkTools(tools, { tool: identity, jsonSchema: (schema: unknown) => ({ wrapped: schema }) })
  assert.deepEqual(ai.fetch_paid.inputSchema, { wrapped: tools[0].parameters })
  assert.equal(await ai.fetch_paid.execute({ url: 'https://shop.test/free' }), 'HTTP 200\n\nhello')

  const [agentsTool] = openAIAgentsTools(tools, { tool: identity })
  assert.equal(agentsTool.strict, false)
  assert.equal(await agentsTool.execute('{"url":"https://shop.test/free"}'), 'HTTP 200\n\nhello')

  const [lc] = langChainTools(tools, { tool: (fn: Function, fields: object) => ({ fn, ...fields }) })
  assert.equal(lc.name, 'fetch_paid')
  assert.equal(await lc.fn({ url: 'https://shop.test/free' }), 'HTTP 200\n\nhello')
})
