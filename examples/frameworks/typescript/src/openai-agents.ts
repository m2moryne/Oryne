/**
 * A research agent built with the OpenAI Agents SDK. Oryne's tools come from
 * openAIAgentsTools(), which wraps them with the SDK's own tool().
 *
 *   npm run openai-agents -- "your question"
 */
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from '@openai/agents'
import { openAIAgentsTools } from '@oryne/agent'
import OpenAI from 'openai'
import { instructions, llm, logToolCall, question, tools } from './shared.ts'

// Any OpenAI-compatible API works through Chat Completions; tracing is an OpenAI-only service.
setDefaultOpenAIClient(new OpenAI({ apiKey: llm.apiKey, baseURL: llm.baseURL }))
setOpenAIAPI('chat_completions')
setTracingDisabled(true)

const researcher = new Agent({
  name: 'Researcher',
  instructions,
  model: llm.model,
  tools: openAIAgentsTools(tools, { tool }),
})
researcher.on('agent_tool_start', (_context, called, details) => {
  const call = details.toolCall as { arguments?: string }
  logToolCall(called.name, call.arguments ? JSON.parse(call.arguments) : {})
})

const result = await run(researcher, question, { maxTurns: 12 })
console.log(`\n${result.finalOutput ?? ''}\n`)
