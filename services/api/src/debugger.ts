import Anthropic from '@anthropic-ai/sdk'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'

/**
 * The AI debugger: answers an owner's questions about their own wallet, agents
 * and payments with Claude, grounded in a snapshot of that account. Streams the
 * answer as server-sent events: `text` (a JSON string chunk), then `done`, or
 * `error` (a JSON string) if it can't answer.
 */

const MODEL = 'claude-opus-5-5'
const MAX_TURNS = 20
const MAX_CHARS = 4000
/** Questions per owner per hour; Claude calls cost money. */
const HOURLY_LIMIT = 30

export type DebugTurn = { role: 'user' | 'assistant'; content: string }

/** What the debugger knows about the account, gathered by the route. */
export type DebugSnapshot = {
  network: string
  wallet: unknown
  agents: unknown[]
  payments: unknown[]
  approvals: unknown[]
  /** Recent API calls that failed, with their request IDs (req_…). */
  failedRequests: unknown[]
}

// Stable instructions first, so they can be cached; the account snapshot follows.
const SYSTEM = `You are the AI debugger inside the Oryne developer console. Oryne gives AI agents wallets on Stellar with limits they can't break: each owner has an agent-wallet smart contract (Soroban) that holds USDC, and every agent has an ed25519 session key and a mandate (policy) stored in that contract. On each payment, the network calls the wallet's __check_auth, which checks the transfer against the agent's mandate; if a rule fails, the transaction is refused and no money moves.

A mandate has: token (the one asset the agent may spend), perTx (most per payment), budget per window (windowDays), payees (allowed recipients; empty means any) and expiresAt (when the key stops working; null means never).

Refusal reasons you may see on payments, and what they mean:
- UnknownAgent: the key isn't registered on this wallet (removed, or the wrong wallet).
- AgentPaused: the owner paused the agent.
- AgentExpired: the mandate's expiry has passed.
- NotATransfer: the agent tried to authorize something other than a token transfer; agents may only pay.
- WrongToken: the payment asked for an asset other than the mandate's token.
- PayeeNotAllowed: the recipient isn't on the agent's payee list.
- OverPerTxLimit: the payment is larger than perTx.
- OverBudget: it would take the agent past its budget for the current window.

The snapshot also lists recent failed API calls (failedRequests) with their request IDs (req_…, also sent back in each response's X-Request-Id header); when the owner mentions a request ID, find it there. Agent API calls are signed with the agent's key: a 401 means the signature, clock or key registration is wrong.

What owners can do in the dashboard: raise or change an agent's limits (Agents → the agent → limits), add payees, pause or resume, remove an agent, and approve one payment beyond the mandate when the agent asks (Approvals; this signs approve_once). Agents built with @oryne/agent pay 402 Payment Required responses through agent.fetch() and can call requestApproval; the MCP server exposes fetch_paid, wallet_status, request_approval and find_service. Merchants use @oryne/merchant (paywall for Hono, expressPaywall for Express) with Oryne's x402 facilitator.

How to answer:
- Ground every claim in the account snapshot. Name the specific agent, payment, amount and reason you're talking about. If the snapshot doesn't contain what's needed, say so and say what to check.
- Lead with the cause in one or two sentences, then the fix as concrete steps. Show code only when the fix is in code, and keep it short.
- Amounts are in USDC. Keep answers brief and plain; use short paragraphs or a short list, and markdown only for code.
- Never ask for or repeat secret keys. You can't change anything yourself; tell the owner what to do.`

const usage = new Map<string, number[]>()

function checkRate(owner: string) {
  const hourAgo = Date.now() - 3_600_000
  const recent = (usage.get(owner) ?? []).filter((at) => at > hourAgo)
  if (recent.length >= HOURLY_LIMIT) {
    throw new HTTPException(429, { message: `That's ${HOURLY_LIMIT} questions this hour. Try again a little later.` })
  }
  recent.push(Date.now())
  usage.set(owner, recent)
}

function validTurns(input: unknown): DebugTurn[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TURNS) {
    throw new HTTPException(400, { message: `messages must be a list of 1 to ${MAX_TURNS} turns` })
  }
  const turns = input.map((turn, i) => {
    const { role, content } = (turn ?? {}) as Partial<DebugTurn>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      throw new HTTPException(400, { message: `messages[${i}] needs a role (user or assistant) and text` })
    }
    return { role, content: content.slice(0, MAX_CHARS) }
  })
  if (turns[0].role !== 'user' || turns.at(-1)!.role !== 'user') {
    throw new HTTPException(400, { message: 'The conversation must start and end with a user message' })
  }
  return turns
}

export function createDebugger(apiKey: string | undefined) {
  const client = apiKey ? new Anthropic({ apiKey }) : null

  return {
    enabled: !!client,

    /** Streams Claude's answer to the last question, as SSE. */
    answer(c: Context, owner: string, rawTurns: unknown, snapshot: DebugSnapshot) {
      if (!client) throw new HTTPException(503, { message: 'The AI debugger is not set up on this server yet' })
      const turns = validTurns(rawTurns)
      checkRate(owner)

      return streamSSE(c, async (sse) => {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          output_config: { effort: 'medium' },
          // Re-run on Anthropic's recommended model if a safety classifier declines.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [
            { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: `Account snapshot (JSON, newest first):\n${JSON.stringify(snapshot)}` },
          ],
          messages: turns,
        })
        sse.onAbort(() => stream.abort())

        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              await sse.writeSSE({ event: 'text', data: JSON.stringify(event.delta.text) })
            }
          }
          const final = await stream.finalMessage()
          if (final.stop_reason === 'refusal') {
            await sse.writeSSE({ event: 'error', data: JSON.stringify("I can't help with that one. Try asking about a specific payment or agent.") })
            return
          }
          await sse.writeSSE({ event: 'done', data: '' })
        } catch (error) {
          if (stream.aborted) return
          const message =
            error instanceof Anthropic.RateLimitError
              ? 'The debugger is busy right now. Try again in a minute.'
              : error instanceof Anthropic.AuthenticationError
                ? 'The AI debugger is not set up correctly on this server.'
                : error instanceof Anthropic.APIError
                  ? 'The AI service had a problem answering. Try again.'
                  : 'Something went wrong while answering.'
          console.error('debugger', error)
          await sse.writeSSE({ event: 'error', data: JSON.stringify(message) })
        }
      })
    },
  }
}
