#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { OryneAgent, PaymentRefusedError } from '@oryne/agent'
import { z } from 'zod'

/**
 * Oryne MCP server: gives any MCP agent (Claude, Cursor, …) tools to pay for
 * things from its Oryne wallet. Limits are enforced by the wallet contract,
 * so the model can't talk its way past them.
 *
 *   ORYNE_AGENT_SECRET  the agent's secret key (S…), shown once when you connect it
 *   ORYNE_API_URL       defaults to http://localhost:8787
 *   ORYNE_MAX_PER_REQUEST  optional client-side cap per request, e.g. "1"
 */

const secret = process.env.ORYNE_AGENT_SECRET ?? process.env.ORYNE_AGENT_KEY
if (!secret) {
  console.error('Set ORYNE_AGENT_SECRET to the agent secret key (S…) from the Oryne dashboard.')
  process.exit(1)
}

const agent = new OryneAgent({
  secret,
  apiUrl: process.env.ORYNE_API_URL,
  maxPerRequest: process.env.ORYNE_MAX_PER_REQUEST,
})

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

const mcp = new McpServer({ name: 'oryne', version: '0.1.0' })

mcp.registerTool(
  'fetch_paid',
  {
    title: 'Fetch a URL, paying if required',
    description:
      'Fetches a URL. If the service answers 402 Payment Required, pays it in USDC from your Oryne wallet ' +
      'within your mandate and returns the response. If the wallet refuses (over limit, payee not allowed), ' +
      'says why; use request_approval to ask the owner.',
    inputSchema: {
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
      body: z.string().optional().describe('Request body, for POST/PUT'),
    },
  },
  async ({ url, method, body }) => {
    const payments: string[] = []
    const client = new OryneAgent({
      secret,
      apiUrl: process.env.ORYNE_API_URL,
      maxPerRequest: process.env.ORYNE_MAX_PER_REQUEST,
      onPayment: (event) => {
        if (event.type === 'paid') payments.push(`Paid ${event.amount} USDC (tx ${event.settlement.transaction})`)
      },
    })
    try {
      const response = await client.fetch(url, {
        method,
        body,
        headers: body ? { 'content-type': 'application/json' } : undefined,
      })
      const content = (await response.text()).slice(0, 50_000)
      return text(`${payments.join('\n')}${payments.length ? '\n' : ''}HTTP ${response.status}\n\n${content}`)
    } catch (error) {
      if (error instanceof PaymentRefusedError) {
        const r = error.requirements
        return text(
          `The wallet refused this payment: ${error.reason}.\n` +
            `Service asked for ${Number(r.maxAmountRequired) / 1e7} USDC to ${r.payTo}.\n` +
            'If it is needed, call request_approval with payTo, amount and a short description.',
        )
      }
      return { ...text(`Request failed: ${(error as Error).message}`), isError: true }
    }
  },
)

mcp.registerTool(
  'wallet_status',
  {
    title: 'Wallet and budget',
    description: 'Shows your Oryne wallet, its balance, your limits and how much budget you have left.',
  },
  async () => text(await agent.me(true)),
)

mcp.registerTool(
  'request_approval',
  {
    title: 'Ask the owner to approve a payment',
    description:
      'Asks your owner to approve one payment your mandate does not allow. Waits up to two minutes for an ' +
      'answer. Once approved, retry the request with fetch_paid.',
    inputSchema: {
      payTo: z.string().describe('The Stellar address to pay (from the 402 response)'),
      amount: z.string().describe('Amount in USDC, e.g. "12.50"'),
      description: z.string().describe('What it is for, in one sentence the owner will read'),
      resource: z.string().optional(),
    },
  },
  async (input) => {
    const approval = await agent.requestApproval(input)
    const decided = await agent.waitForApproval(approval.id, { timeoutMs: 120_000 })
    return text(
      decided.status === 'pending'
        ? `Approval ${approval.id} is still waiting for the owner. Check again later.`
        : `The owner ${decided.status} the request.`,
    )
  },
)

mcp.registerTool(
  'find_service',
  {
    title: 'Find a paid service',
    description: 'Searches the Oryne directory for services that accept agent payments.',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    const url = new URL('/v1/services', agent.apiUrl)
    url.searchParams.set('q', query)
    return text(await (await fetch(url)).json())
  },
)

await mcp.connect(new StdioServerTransport())
