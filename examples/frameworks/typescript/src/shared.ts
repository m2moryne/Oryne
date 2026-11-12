/**
 * What both examples share: the agent's Oryne wallet, the model settings and
 * the task. Each example only wires these into its framework.
 */
import { OryneAgent, oryneTools, type PaymentEvent } from '@oryne/agent'

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Set ${name} in examples/frameworks/.env (see .env.example).`)
    process.exit(1)
  }
  return value
}

const say = (icon: string, text: string) => console.log(`${icon}  ${text}`)

/** The agent's wallet. Payments are printed as they happen. */
export const oryne = new OryneAgent({
  secret: required('ORYNE_AGENT_SECRET'),
  apiUrl: process.env.ORYNE_API_URL,
  onPayment: (event: PaymentEvent) => {
    if (event.type === 'paying') say('💳', `paying ${event.amount} USDC for ${new URL(event.requirements.resource).pathname}`)
    if (event.type === 'paid') say('✅', `paid · tx ${event.settlement.transaction?.slice(0, 12) ?? '?'}…`)
    if (event.type === 'refused') say('⛔', `not paid (${event.source === 'client' ? 'before signing' : 'by the wallet'}): ${event.reason}`)
  },
})

/** Oryne's four tools: fetch_paid, wallet_status, request_approval, find_service. */
export const tools = oryneTools(oryne)

/** Any OpenAI-compatible chat API; DeepSeek by default. */
export const llm = {
  apiKey: process.env.LLM_API_KEY?.trim() || required('DEEPSEEK_API_KEY'),
  baseURL: process.env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL?.trim() || 'deepseek-chat',
}

const merchant = (process.env.MERCHANT_URL?.trim() || 'https://demo.oryne.org').replace(/\/$/, '')

export const instructions = `You are a research assistant with your own Oryne wallet (USDC on Stellar).
Paid sources are at ${merchant}: GET / lists them with prices (it's free). Use fetch_paid to buy what helps,
with a maxPrice a little above the listed price. Check wallet_status first to see your limits.
If a payment is refused by the wallet, decide whether it's worth it; if it is, use request_approval with the
payTo address and amount from the refusal, then try again once approved. Never pay for the same thing twice.
Finish with a short answer and list what you bought and what it cost.`

export const question = process.argv.slice(2).join(' ') || 'What are agent payments on Stellar, and why do limits matter?'

export function logToolCall(name: string, input: unknown) {
  const args = input && typeof input === 'object' ? JSON.stringify(input) : ''
  say('🔧', `${name}(${args === '{}' ? '' : args})`)
}

say('🧭', `question: ${question}`)
