#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { OryneAgent, oryneTools, parsePayeeRule, type OryneTool, type OryneToolName } from '@oryne/agent'
import { z } from 'zod'

/**
 * Oryne MCP server: gives any MCP agent (Claude, Cursor, …) tools to pay for
 * things from its Oryne wallet. Limits are enforced by the wallet contract,
 * so the model can't talk its way past them.
 *
 *   ORYNE_AGENT_SECRET  the agent's secret key (S…), shown once when you connect it
 *   ORYNE_API_URL       defaults to the hosted API, https://testnet-apiv1.oryne.org
 *   ORYNE_MAX_PER_REQUEST  optional client-side cap per request, e.g. "1"
 *   ORYNE_PAYEES        who the agent may pay: "any" (default), "directory"
 *                       (only listed services, at their listed address) or
 *                       comma-separated Stellar addresses
 */

const secret = process.env.ORYNE_AGENT_SECRET ?? process.env.ORYNE_AGENT_KEY
if (!secret) {
  console.error('Set ORYNE_AGENT_SECRET to the agent secret key (S…) from the Oryne dashboard.')
  process.exit(1)
}

const clientOptions = {
  secret,
  apiUrl: process.env.ORYNE_API_URL,
  maxPerRequest: process.env.ORYNE_MAX_PER_REQUEST,
  payees: parsePayeeRule(process.env.ORYNE_PAYEES),
}

const agent = new OryneAgent(clientOptions)
// The same tools the framework integrations use (@oryne/agent's oryneTools), so they all behave alike.
const tools = Object.fromEntries(oryneTools(agent).map((tool) => [tool.name, tool])) as Record<OryneToolName, OryneTool>

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })

const mcp = new McpServer({ name: 'oryne', version: '0.4.0' })

mcp.registerTool(
  'fetch_paid',
  {
    title: 'Fetch a URL, paying if required',
    description: tools.fetch_paid.description,
    inputSchema: {
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
      body: z.string().optional().describe('Request body, for POST/PUT'),
      maxPrice: z
        .string()
        .regex(/^\d+(\.\d{1,7})?$/)
        .optional()
        .describe('Most you expect this request to cost in USDC, e.g. "0.10". Anything higher is refused unpaid.'),
    },
  },
  async (input) => {
    const result = await tools.fetch_paid.execute(input)
    return { ...text(result), ...(result.startsWith('Request failed:') ? { isError: true } : {}) }
  },
)

mcp.registerTool(
  'wallet_status',
  { title: 'Wallet and budget', description: tools.wallet_status.description },
  async () => text(await tools.wallet_status.execute({})),
)

mcp.registerTool(
  'request_approval',
  {
    title: 'Ask the owner to approve a payment',
    description: tools.request_approval.description,
    inputSchema: {
      payTo: z.string().describe('The Stellar address to pay (from the 402 response)'),
      amount: z.string().describe('Amount in USDC, e.g. "12.50"'),
      description: z.string().describe('What it is for, in one sentence the owner will read'),
      resource: z.string().optional(),
    },
  },
  async (input) => text(await tools.request_approval.execute(input)),
)

mcp.registerTool(
  'find_service',
  { title: 'Find a paid service', description: tools.find_service.description, inputSchema: { query: z.string() } },
  async (input) => text(await tools.find_service.execute(input)),
)

await mcp.connect(new StdioServerTransport())
