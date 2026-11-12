import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'

/**
 * Streaming chat with DeepSeek, shared by the AI debugger and OryneAI. Answers
 * go back as server-sent events: `text` (a JSON string chunk), then `done`, or
 * `error` (a JSON string) if the model can't answer.
 */

/** DeepSeek's chat API speaks the OpenAI format. */
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const DEFAULT_MODEL = 'deepseek-chat'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
type Message = { role: 'system' | 'user' | 'assistant'; content: string }

/** A conversation from a request body: 1 to maxTurns turns, starting and ending with the user. */
export function validTurns(input: unknown, maxTurns: number, maxChars: number): ChatTurn[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maxTurns) {
    throw new HTTPException(400, { message: `messages must be a list of 1 to ${maxTurns} turns` })
  }
  const turns = input.map((turn, i) => {
    const { role, content } = (turn ?? {}) as Partial<ChatTurn>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      throw new HTTPException(400, { message: `messages[${i}] needs a role (user or assistant) and text` })
    }
    return { role, content: content.slice(0, maxChars) }
  })
  if (turns[0].role !== 'user' || turns.at(-1)!.role !== 'user') {
    throw new HTTPException(400, { message: 'The conversation must start and end with a user message' })
  }
  return turns
}

/** At most `limit` uses per key per hour, kept in memory (one API process per network). */
export function hourlyLimiter(limit: number, message: string) {
  const usage = new Map<string, number[]>()
  return (key: string) => {
    const hourAgo = Date.now() - 3_600_000
    const recent = (usage.get(key) ?? []).filter((at) => at > hourAgo)
    if (recent.length >= limit) throw new HTTPException(429, { message })
    recent.push(Date.now())
    usage.set(key, recent)
    // Forget keys that have gone quiet, so the map doesn't grow without bound.
    if (usage.size > 10_000) {
      for (const [other, times] of usage) if (!times.some((at) => at > hourAgo)) usage.delete(other)
    }
  }
}

export type StreamOptions = {
  apiKey: string
  model: string
  messages: Message[]
  /** Names the feature in logs and at the start of error messages, e.g. "The AI debugger". */
  label: string
  /** Shown to the user when the model refuses on content grounds. */
  refusal: string
  maxTokens?: number
  temperature?: number
}

/** Streams the model's answer as SSE. */
export function streamChat(c: Context, options: StreamOptions) {
  const { apiKey, model, messages, label, refusal, maxTokens = 2000, temperature = 0.3 } = options
  // Behind nginx: send each chunk on as it comes instead of buffering the whole answer.
  c.header('X-Accel-Buffering', 'no')
  c.header('Cache-Control', 'no-cache, no-transform')

  return streamSSE(c, async (sse) => {
    const abort = new AbortController()
    sse.onAbort(() => abort.abort())
    const fail = (message: string) => sse.writeSSE({ event: 'error', data: JSON.stringify(message) })

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: abort.signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: true, max_tokens: maxTokens, temperature, messages }),
      })
      if (!response.ok || !response.body) {
        console.error(`${label}: DeepSeek`, response.status, await response.text().catch(() => ''))
        await fail(
          response.status === 401 || response.status === 403
            ? `${label} isn't set up correctly on this server.`
            : response.status === 402
              ? `${label} is out of credit. Try again later.`
              : response.status === 429 || response.status === 503
                ? `${label} is busy right now. Try again in a minute.`
                : 'The AI service had a problem answering. Try again.',
        )
        return
      }

      // Server-sent events: lines of "data: {json}", ending with "data: [DONE]".
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let finish: string | null = null
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const data = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!data || data === '[DONE]') continue
          const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }
          const choice = chunk.choices?.[0]
          if (choice?.delta?.content) await sse.writeSSE({ event: 'text', data: JSON.stringify(choice.delta.content) })
          if (choice?.finish_reason) finish = choice.finish_reason
        }
      }
      if (finish === 'content_filter') {
        await fail(refusal)
        return
      }
      await sse.writeSSE({ event: 'done', data: '' })
    } catch (error) {
      if (abort.signal.aborted) return
      console.error(label, error)
      await fail('Something went wrong while answering.')
    }
  })
}
