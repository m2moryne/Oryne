import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type ChatTurn, DEFAULT_MODEL, hourlyLimiter, streamChat, validTurns } from './deepseek.ts'

/**
 * The AI debugger: answers an owner's questions about their own wallet, agents
 * and payments with DeepSeek, grounded in a snapshot of that account. Streams the
 * answer as server-sent events (see deepseek.ts).
 */

const MAX_TURNS = 20
const MAX_CHARS = 4000
/** Questions per owner per hour; model calls cost money. */
const HOURLY_LIMIT = 30

export type DebugTurn = ChatTurn

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

// Stable instructions first, so DeepSeek's prefix cache can reuse them; the account snapshot follows.
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

const checkRate = hourlyLimiter(HOURLY_LIMIT, `That's ${HOURLY_LIMIT} questions this hour. Try again a little later.`)

export function createDebugger(apiKey: string | undefined, model = DEFAULT_MODEL) {
  return {
    enabled: !!apiKey,

    /** Streams the model's answer to the last question, as SSE. */
    answer(c: Context, owner: string, rawTurns: unknown, snapshot: DebugSnapshot) {
      if (!apiKey) throw new HTTPException(503, { message: 'The AI debugger is not set up on this server yet' })
      const turns = validTurns(rawTurns, MAX_TURNS, MAX_CHARS)
      checkRate(owner)
      return streamChat(c, {
        apiKey,
        model,
        label: 'The AI debugger',
        refusal: "I can't help with that one. Try asking about a specific payment or agent.",
        maxTokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'system', content: `Account snapshot (JSON, newest first):
${JSON.stringify(snapshot)}` },
          ...turns,
        ],
      })
    },
  }
}
