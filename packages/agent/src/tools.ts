import { fromBaseUnits } from '@oryne/core'
import { OryneAgent, PaymentRefusedError, type OryneAgentOptions } from './index.ts'

/**
 * Oryne's agent tools for any LLM framework: the same four tools the MCP
 * server gives Claude and Cursor (fetch_paid, wallet_status, request_approval,
 * find_service), as plain definitions with a JSON Schema and an `execute`
 * that returns text for the model. Adapters below turn them into what each
 * framework expects, without Oryne depending on any of them.
 *
 *   const tools = oryneTools(new OryneAgent({ secret }))
 *   openAITools(tools)                      // OpenAI-style function calling (also DeepSeek, Groq, …)
 *   anthropicTools(tools)                   // Claude's Messages API
 *   aiSdkTools(tools, { tool, jsonSchema }) // Vercel AI SDK, from 'ai'
 *   openAIAgentsTools(tools, { tool })      // OpenAI Agents SDK, from '@openai/agents'
 *   langChainTools(tools, { tool })         // LangChain.js, from '@langchain/core/tools'
 *
 * The wallet contract enforces the agent's mandate whatever a model asks, so
 * these tools can be given to a model as they are.
 */

export type OryneToolName = 'fetch_paid' | 'wallet_status' | 'request_approval' | 'find_service'

/** A JSON Schema object describing a tool's input. */
export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type OryneTool = {
  name: OryneToolName
  description: string
  parameters: JsonSchema
  /** Runs the tool. Returns text for the model; failures are described in the text, not thrown. */
  execute(input: Record<string, unknown>): Promise<string>
}

export type OryneToolsOptions = {
  /** How long request_approval waits for the owner to decide. Default 2 minutes. */
  approvalTimeoutMs?: number
  /** Longest response body fetch_paid hands back to the model, in characters. Default 50,000. */
  maxResponseChars?: number
  /** Only these tools. Default: all four. */
  only?: OryneToolName[]
}

const AMOUNT = /^\d+(\.\d{1,7})?$/

const asString = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

/** The four Oryne tools for an agent (or the options to make one). */
export function oryneTools(agentOrOptions: OryneAgent | OryneAgentOptions, options: OryneToolsOptions = {}): OryneTool[] {
  const agent = agentOrOptions instanceof OryneAgent ? agentOrOptions : new OryneAgent(agentOrOptions)
  const { approvalTimeoutMs = 120_000, maxResponseChars = 50_000, only } = options

  const tools: OryneTool[] = [
    {
      name: 'fetch_paid',
      description:
        'Fetches a URL. If the service answers 402 Payment Required, pays it in USDC from your Oryne wallet ' +
        'within your mandate and returns the response. If the wallet refuses (over limit, payee not allowed), ' +
        'says why; use request_approval to ask the owner.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to fetch, https://…' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method. Default GET.' },
          body: { type: 'string', description: 'Request body (JSON), for POST or PUT' },
          maxPrice: {
            type: 'string',
            description: 'Most you expect this request to cost in USDC, e.g. "0.10". Anything higher is refused unpaid.',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
      async execute(input) {
        const url = String(input.url ?? '')
        const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
        const body = typeof input.body === 'string' && input.body ? input.body : undefined
        const maxPrice = typeof input.maxPrice === 'string' && input.maxPrice ? input.maxPrice : undefined
        if (!/^https?:\/\//.test(url)) return 'Not fetched: url must be a full address starting with https://'
        if (maxPrice && !AMOUNT.test(maxPrice)) return 'Not fetched: maxPrice must be an amount like "0.10"'

        const payments: string[] = []
        try {
          const response = await agent.fetch(url, {
            method,
            body,
            headers: body ? { 'content-type': 'application/json' } : undefined,
            maxPrice,
            onPayment: (event) => {
              if (event.type === 'paid') payments.push(`Paid ${event.amount} USDC (tx ${event.settlement.transaction})`)
            },
          })
          const content = (await response.text()).slice(0, maxResponseChars)
          return `${payments.map((line) => `${line}\n`).join('')}HTTP ${response.status}\n\n${content}`
        } catch (error) {
          if (error instanceof PaymentRefusedError) {
            const r = error.requirements
            const asked = `Service asked for ${fromBaseUnits(BigInt(r.maxAmountRequired))} USDC to ${r.payTo}.\n`
            if (error.source === 'client') {
              return (
                `Not paid: ${error.reason}. Nothing was signed and no money moved.\n${asked}` +
                'Do not try to pay this another way. If you think it is legitimate, tell your owner.'
              )
            }
            return (
              `The wallet refused this payment: ${error.reason}.\n${asked}` +
              'If it is needed, call request_approval with payTo, amount and a short description.'
            )
          }
          return `Request failed: ${(error as Error).message}`
        }
      },
    },
    {
      name: 'wallet_status',
      description: 'Shows your Oryne wallet, its balance, your limits and how much budget you have left.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute() {
        try {
          return asString(await agent.me(true))
        } catch (error) {
          return `Could not read the wallet: ${(error as Error).message}`
        }
      },
    },
    {
      name: 'request_approval',
      description:
        'Asks your owner to approve one payment your mandate does not allow. Waits for an answer for a while. ' +
        'Once approved, retry the request with fetch_paid.',
      parameters: {
        type: 'object',
        properties: {
          payTo: { type: 'string', description: 'The Stellar address to pay (from the refused payment)' },
          amount: { type: 'string', description: 'Amount in USDC, e.g. "12.50"' },
          description: { type: 'string', description: 'What it is for, in one sentence the owner will read' },
          resource: { type: 'string', description: 'The URL the payment is for' },
        },
        required: ['payTo', 'amount', 'description'],
        additionalProperties: false,
      },
      async execute(input) {
        const payTo = String(input.payTo ?? '')
        const amount = String(input.amount ?? '')
        const description = String(input.description ?? '')
        if (!payTo || !AMOUNT.test(amount) || !description) {
          return 'Not asked: give payTo (a Stellar address), amount (like "12.50") and a description.'
        }
        try {
          const approval = await agent.requestApproval({
            payTo,
            amount,
            description,
            resource: typeof input.resource === 'string' && input.resource ? input.resource : undefined,
          })
          const decided = await agent.waitForApproval(approval.id, { timeoutMs: approvalTimeoutMs })
          return decided.status === 'pending'
            ? `Approval ${approval.id} is still waiting for the owner. Check again later.`
            : `The owner ${decided.status} the request.`
        } catch (error) {
          return `Could not ask for approval: ${(error as Error).message}`
        }
      },
    },
    {
      name: 'find_service',
      description: 'Searches the Oryne directory for services that accept agent payments.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What you need, e.g. "web search" or "weather"' } },
        required: ['query'],
        additionalProperties: false,
      },
      async execute(input) {
        try {
          const url = new URL('/v1/services', agent.apiUrl)
          url.searchParams.set('q', String(input.query ?? ''))
          const response = await fetch(url)
          if (!response.ok) return `The directory answered HTTP ${response.status}.`
          return asString(await response.json())
        } catch (error) {
          return `Could not search the directory: ${(error as Error).message}`
        }
      },
    },
  ]
  return only ? tools.filter((tool) => only.includes(tool.name)) : tools
}

/**
 * Runs the tool a model called, by name. `args` may be the JSON string models
 * send or an already-parsed object. Returns the text to send back.
 */
export async function runOryneTool(tools: OryneTool[], name: string, args: unknown): Promise<string> {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) return `Unknown tool: ${name}`
  let input: unknown = args ?? {}
  if (typeof input === 'string') {
    try {
      input = input.trim() ? JSON.parse(input) : {}
    } catch {
      return `The arguments for ${name} weren't valid JSON.`
    }
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return `The arguments for ${name} must be an object.`
  return tool.execute(input as Record<string, unknown>)
}

/** OpenAI-style function tools (Chat Completions; also DeepSeek, Groq, Together, Ollama, …). Run calls with runOryneTool. */
export function openAITools(tools: OryneTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}

/** Tools for Claude's Messages API (`tools` in messages.create). Run tool_use blocks with runOryneTool. */
export function anthropicTools(tools: OryneTool[]) {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }))
}

// The adapters take the framework's own helpers as arguments, so Oryne needs
// none of these frameworks installed and works with whichever version you have.

type AnyFunction = (...args: any[]) => any

/**
 * Vercel AI SDK tools: pass `tool` and `jsonSchema` from 'ai'.
 *
 *   import { generateText, jsonSchema, tool } from 'ai'
 *   const result = await generateText({ model, tools: aiSdkTools(oryneTools(agent), { tool, jsonSchema }), prompt })
 */
export function aiSdkTools(tools: OryneTool[], ai: { tool: AnyFunction; jsonSchema: AnyFunction }): Record<string, any> {
  return Object.fromEntries(
    tools.map((oryne) => {
      const schema = ai.jsonSchema(oryne.parameters)
      return [
        oryne.name,
        ai.tool({
          description: oryne.description,
          // AI SDK 5 and later read inputSchema; 4 read parameters.
          inputSchema: schema,
          parameters: schema,
          execute: (input: Record<string, unknown>) => oryne.execute(input ?? {}),
        }),
      ]
    }),
  )
}

/**
 * OpenAI Agents SDK tools: pass `tool` from '@openai/agents'.
 *
 *   import { Agent, run, tool } from '@openai/agents'
 *   const agent = new Agent({ name: 'Researcher', tools: openAIAgentsTools(oryneTools(oryne), { tool }) })
 */
export function openAIAgentsTools(tools: OryneTool[], agents: { tool: AnyFunction }): any[] {
  return tools.map((oryne) =>
    agents.tool({
      name: oryne.name,
      description: oryne.description,
      parameters: oryne.parameters,
      // Optional fields (method, maxPrice…) aren't allowed in strict mode.
      strict: false,
      execute: (input: unknown) =>
        oryne.execute(typeof input === 'string' ? JSON.parse(input || '{}') : ((input ?? {}) as Record<string, unknown>)),
    }),
  )
}

/**
 * LangChain.js tools: pass `tool` from '@langchain/core/tools'.
 *
 *   import { tool } from '@langchain/core/tools'
 *   const llmWithTools = llm.bindTools(langChainTools(oryneTools(agent), { tool }))
 */
export function langChainTools(tools: OryneTool[], langchain: { tool: AnyFunction }): any[] {
  return tools.map((oryne) =>
    langchain.tool((input: Record<string, unknown>) => oryne.execute(input ?? {}), {
      name: oryne.name,
      description: oryne.description,
      schema: oryne.parameters,
    }),
  )
}
