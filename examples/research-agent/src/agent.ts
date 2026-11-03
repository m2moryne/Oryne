/**
 * A research agent with its own Oryne wallet.
 *
 * DeepSeek does the thinking. Oryne's agent SDK (@oryne/agent) gives it
 * money: when a service answers 402 Payment Required, agent.fetch() pays from
 * the agent's wallet, inside the limits its owner set. The wallet contract on
 * Stellar enforces those limits, so if the model asks for something too
 * expensive, the payment is refused, and the agent can ask its owner.
 *
 *   npm start "What are people saying about Stellar this week?"
 */
import { OryneAgent, PaymentRefusedError, type PaymentEvent } from '@oryne/agent'

// ---------------------------------------------------------------- settings

const env = (name: string, fallback?: string) => {
  const value = process.env[name]?.trim() || fallback
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in (see README.md).`)
    process.exit(1)
  }
  return value
}

const AGENT_SECRET = env('ORYNE_AGENT_SECRET')
const DEEPSEEK_KEY = env('DEEPSEEK_API_KEY')
const API_URL = env('ORYNE_API_URL', 'https://oryne.onrender.com')
const SHOP = env('MERCHANT_URL', 'https://oryne-demo-merchant.onrender.com').replace(/\/$/, '')
const MODEL = env('DEEPSEEK_MODEL', 'deepseek-chat')
/** Any OpenAI-compatible chat API works here; DeepSeek by default. */
const LLM_URL = env('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').replace(/\/$/, '')

const question = process.argv.slice(2).join(' ') || 'Find me a good quote about invention, and research agent payments on Stellar.'

// ---------------------------------------------------------------- the wallet

const say = (icon: string, text: string) => console.log(`${icon}  ${text}`)

const agent = new OryneAgent({
  secret: AGENT_SECRET,
  apiUrl: API_URL,
  onPayment: (event: PaymentEvent) => {
    if (event.type === 'paying') say('💳', `paying ${event.amount} USDC for ${new URL(event.requirements.resource).pathname}`)
    if (event.type === 'paid') say('✅', `paid · tx ${event.settlement.transaction?.slice(0, 12)}…`)
    if (event.type === 'refused') say('⛔', `refused by the wallet: ${event.reason}`)
  },
})

// ---------------------------------------------------------------- tools the model can call

type Tool = {
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, string>) => Promise<unknown>
}

/** What a refused payment was for, so request_approval can ask for exactly that. */
const refused = new Map<string, { payTo: string; amount: string; description: string }>()

const tools: Record<string, Tool> = {
  wallet_status: {
    description: "Shows this agent's Oryne wallet: balance, budget left, and the most it may pay at once.",
    parameters: { type: 'object', properties: {} },
    async run() {
      const { agent: me, walletBalance } = await agent.me(true)
      return { walletBalance, budget: me.budget, remaining: me.remaining, maxPerPayment: me.perTx, status: me.status }
    },
  },

  list_services: {
    description: 'Lists the paid research services this agent can buy from, with their prices in USDC. Free to call.',
    parameters: { type: 'object', properties: {} },
    async run() {
      return (await fetch(SHOP)).json()
    },
  },

  buy: {
    description:
      'Calls a paid service and pays for it from the wallet. path is one of the routes from list_services, ' +
      'e.g. "/search?q=stellar". If the wallet refuses (too expensive for your limits), it says so: ' +
      'only then consider request_approval.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Route and query, e.g. /quote or /search?q=topic' } },
      required: ['path'],
    },
    async run({ path }) {
      const url = new URL(path, SHOP)
      try {
        const response = await agent.fetch(url)
        return { status: response.status, body: await response.json().catch(() => null) }
      } catch (error) {
        if (error instanceof PaymentRefusedError) {
          const r = error.requirements
          const amount = String(Number(r.maxAmountRequired) / 1e7)
          refused.set(url.pathname, { payTo: r.payTo, amount, description: r.description ?? url.pathname })
          return { refused: error.reason, price: `${amount} USDC`, hint: 'Ask the owner with request_approval if it is worth it.' }
        }
        throw error
      }
    },
  },

  request_approval: {
    description:
      "Asks the wallet's owner to approve one payment the wallet refused. Waits up to 3 minutes for their " +
      'answer in the Oryne dashboard. If approved, call buy again with the same path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path that was refused, e.g. /report' },
        reason: { type: 'string', description: 'One sentence for the owner: why this is worth paying for' },
      },
      required: ['path', 'reason'],
    },
    async run({ path, reason }) {
      const pathname = new URL(path, SHOP).pathname
      const payment = refused.get(pathname)
      if (!payment) return { error: 'Only a payment the wallet refused can be sent for approval. Call buy first.' }
      const approval = await agent.requestApproval({ ...payment, resource: `${SHOP}${pathname}`, reason })
      say('🙋', `asked the owner to approve ${payment.amount} USDC · open Approvals in the Oryne dashboard`)
      const decided = await agent.waitForApproval(approval.id, { timeoutMs: 180_000 })
      say(decided.status === 'approved' ? '👍' : '✋', `owner: ${decided.status}`)
      return { decision: decided.status }
    },
  },
}

// ---------------------------------------------------------------- the loop

type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

/** DeepSeek's API is OpenAI-compatible: chat completions with function tools. */
async function think(messages: Message[]) {
  const response = await fetch(`${LLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${DEEPSEEK_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: Object.entries(tools).map(([name, tool]) => ({
        type: 'function',
        function: { name, description: tool.description, parameters: tool.parameters },
      })),
    }),
  })
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = (await response.json()) as { choices: Array<{ message: Extract<Message, { role: 'assistant' }> }> }
  return data.choices[0].message
}

const messages: Message[] = [
  {
    role: 'system',
    content:
      'You are a research agent with a small USDC wallet on Stellar, managed by Oryne. ' +
      'Use list_services to see what you can buy, and buy only what helps answer the question. ' +
      'Spend carefully: check wallet_status if unsure. If the wallet refuses a payment, explain why to the ' +
      'owner with request_approval only when the item is clearly worth it; otherwise answer without it. ' +
      'Finish with a short answer that says what you bought and what it cost.',
  },
  { role: 'user', content: question },
]

say('🧭', `question: ${question}`)
for (let step = 0; step < 10; step++) {
  say('🤖', 'thinking…')
  const reply = await think(messages)
  messages.push(reply)
  if (!reply.tool_calls?.length) {
    console.log(`\n${reply.content ?? ''}\n`)
    process.exit(0)
  }
  for (const call of reply.tool_calls) {
    const tool = tools[call.function.name]
    let result: unknown
    try {
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>
      say('🔧', `${call.function.name}(${Object.values(args).join(', ')})`)
      result = tool ? await tool.run(args) : { error: `No tool called ${call.function.name}` }
    } catch (error) {
      result = { error: (error as Error).message }
    }
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 20_000) })
  }
}
say('⏹', 'stopped after 10 steps')
