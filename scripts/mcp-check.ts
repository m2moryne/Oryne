/**
 * Runs the Oryne MCP server the way Claude Desktop does, and checks every tool
 * against Stellar testnet: a client starts the server as a child process and
 * speaks MCP to it over stdio.
 *
 *   npm run mcp-check            the server from this repository's source
 *   npm run mcp-check -- --npm   the published package, via `npx -y @oryne/mcp`,
 *                                exactly what the Claude Desktop config runs
 *
 * It creates a fresh owner (a funded testnet account), a wallet with 50 test
 * USDC and an agent allowed 1 USDC per payment, then through MCP:
 * lists the tools → wallet_status → find_service → fetch_paid a 0.01 quote
 * (paid) → fetch_paid a 30 USDC report (refused by the contract) →
 * request_approval while the owner approves → fetch_paid the report (paid).
 * Against the source it also checks fetch_paid's maxPrice refuses unpaid.
 *
 * Defaults to the hosted testnet API and demo merchant; set ORYNE_API_URL and
 * MERCHANT_URL to use local ones. At the end it prints a Claude Desktop config
 * for the agent it made, so you can try the same agent in the app.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { hash, Keypair, TransactionBuilder } from '@stellar/stellar-sdk'

const api = process.env.ORYNE_API_URL ?? 'https://oryne.onrender.com'
const merchant = process.env.MERCHANT_URL ?? 'https://oryne-demo-merchant.onrender.com'
const fromNpm = process.argv.includes('--npm')
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const step = (text: string) => console.log(`\n▸ ${text}`)
const ok = (text: string) => console.log(`  ✓ ${text}`)
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`)
  return data
}

// ---------------------------------------------------------------- owner, wallet, agent

type Intent = { id: string; mode: 'envelope'; xdr: string; networkPassphrase: string }

const owner = Keypair.random()
const submit = (intent: Intent, token: string) => {
  const tx = TransactionBuilder.fromXDR(intent.xdr, intent.networkPassphrase)
  tx.sign(owner)
  return call<{ hash: string }>(`/v1/intents/${intent.id}/submit`, { body: { signedXdr: tx.toXDR() }, token })
}

step(`Owner signs in (${api})`)
await fetch(`https://friendbot.stellar.org/?addr=${owner.publicKey()}`)
const challenge = await call<{ nonce: string; message: string }>('/v1/auth/challenge', { body: { address: owner.publicKey() } })
const signed = owner.sign(Buffer.from(hash(Buffer.from(`Stellar Signed Message:\n${challenge.message}`))))
const { token } = await call<{ token: string }>('/v1/auth/verify', {
  body: { nonce: challenge.nonce, signature: Buffer.from(signed).toString('base64') },
})
ok(`owner ${owner.publicKey()}`)

step('Wallet with 50 test USDC, and an agent allowed 1 USDC per payment')
const wallet = await call<{ id: string }>('/v1/wallets', { body: { name: 'MCP check wallet' }, token })
await call('/v1/faucet', { body: { to: wallet.id, amount: '50' } })
const agentKey = Keypair.random()
const intent = await call<Intent>(`/v1/wallets/${wallet.id}/agents`, {
  body: { publicKey: agentKey.publicKey(), name: 'MCP check agent', kind: 'Research', perTx: '1', budget: '5', windowDays: 30 },
  token,
})
await submit(intent, token)
ok(`wallet ${wallet.id}, agent ${agentKey.publicKey()}`)

// ---------------------------------------------------------------- the MCP server, over stdio

const env = { ...(process.env as Record<string, string>), ORYNE_AGENT_SECRET: agentKey.secret(), ORYNE_API_URL: api }
const transport = fromNpm
  ? new StdioClientTransport({ command: 'npx', args: ['-y', '@oryne/mcp@latest'], env, stderr: 'inherit' })
  : new StdioClientTransport({ command: process.execPath, args: [`${root}packages/mcp/src/server.ts`], env, stderr: 'inherit' })
const client = new Client({ name: 'oryne-mcp-check', version: '1.0.0' })

step(`Start the MCP server: ${fromNpm ? 'npx -y @oryne/mcp@latest' : 'packages/mcp/src/server.ts'}`)
await client.connect(transport)
const server = client.getServerVersion()
ok(`connected to ${server?.name} ${server?.version}`)

const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args }, undefined, { timeout: 180_000 })) as {
    content: Array<{ type: string; text?: string }>
    isError?: boolean
  }
  const text = result.content.map((part) => part.text ?? '').join('\n')
  if (result.isError) throw new Error(`${name} failed: ${text}`)
  return text
}
const firstLines = (text: string, lines = 2) => text.split('\n').filter(Boolean).slice(0, lines).join(' | ')

try {
  step('List tools')
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  ok(names.join(', '))
  for (const expected of ['fetch_paid', 'find_service', 'request_approval', 'wallet_status']) {
    check(names.includes(expected), `missing tool ${expected}`)
  }

  step('wallet_status')
  const status = await tool('wallet_status')
  check(status.includes(wallet.id), 'wallet_status does not show the wallet')
  const info = JSON.parse(status) as { walletBalance: string; agent: { perTx: string; budget: string } }
  ok(`balance ${info.walletBalance} USDC, ${info.agent.perTx} per payment, ${info.agent.budget} budget`)

  step('find_service "quote"')
  ok(firstLines(await tool('find_service', { query: 'quote' }), 1).slice(0, 160))

  step('fetch_paid a 0.01 USDC quote')
  const quote = await tool('fetch_paid', { url: `${merchant}/quote` })
  check(/^Paid 0\.01 USDC/.test(quote) && quote.includes('HTTP 200'), `quote was not paid:\n${quote}`)
  ok(firstLines(quote))

  if (!fromNpm) {
    step('fetch_paid a 0.05 search with maxPrice 0.01 (refused before signing)')
    const search = await tool('fetch_paid', { url: `${merchant}/search?q=stellar`, maxPrice: '0.01' })
    check(search.startsWith('Not paid') && search.includes('Nothing was signed'), `expected a client refusal:\n${search}`)
    ok(firstLines(search, 1))
  }

  step('fetch_paid a 30 USDC report (over the 1 USDC limit)')
  const refused = await tool('fetch_paid', { url: `${merchant}/report` })
  check(refused.includes('OverPerTxLimit'), `expected OverPerTxLimit:\n${refused}`)
  ok(firstLines(refused, 1))
  const payTo = /to (G[A-Z2-7]{55})/.exec(refused)?.[1]
  check(payTo, 'refusal does not say who to pay')

  step('request_approval, while the owner approves it')
  const owner = (async () => {
    for (let i = 0; i < 60; i++) {
      const { approvals } = await call<{ approvals: Array<{ id: string; status: string }> }>('/v1/approvals', { token })
      const pending = approvals.find((a) => a.status === 'pending')
      if (pending) {
        const approve = await call<Intent>(`/v1/approvals/${pending.id}/approve`, { method: 'POST', token })
        await submit(approve, token)
        return pending.id
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('No approval request reached the owner')
  })()
  const [answer, approvalId] = await Promise.all([
    tool('request_approval', { payTo, amount: '30', description: 'MCP check: research report', resource: `${merchant}/report` }),
    owner,
  ])
  check(answer.includes('approved'), `expected approved:\n${answer}`)
  ok(`${approvalId}: ${answer}`)

  step('fetch_paid the report again')
  const report = await tool('fetch_paid', { url: `${merchant}/report` })
  check(/^Paid 30 USDC/.test(report), `report was not paid:\n${report}`)
  ok(firstLines(report))
} finally {
  await client.close()
}

console.log('\n✓ The MCP server works end to end.\n')
console.log('To try this agent in Claude Desktop, put this in claude_desktop_config.json')
console.log('(Windows: %APPDATA%\\Claude\\, macOS: ~/Library/Application Support/Claude/) and restart it:\n')
const command = process.platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', '-y', '@oryne/mcp'] } : { command: 'npx', args: ['-y', '@oryne/mcp'] }
console.log(JSON.stringify({ mcpServers: { oryne: { ...command, env: { ORYNE_AGENT_SECRET: agentKey.secret(), ORYNE_API_URL: api } } } }, null, 2))
console.log('\n(Testnet only: the wallet holds test USDC.)')
