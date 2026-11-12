/**
 * A research agent built with the Vercel AI SDK. Oryne's tools come from
 * aiSdkTools(), which wraps them with the SDK's own tool() and jsonSchema().
 *
 *   npm run ai-sdk -- "your question"
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { aiSdkTools } from '@oryne/agent'
import { generateText, jsonSchema, stepCountIs, tool } from 'ai'
import { instructions, llm, logToolCall, question, tools } from './shared.ts'

const provider = createOpenAICompatible({ name: 'llm', apiKey: llm.apiKey, baseURL: llm.baseURL })

const { text } = await generateText({
  model: provider(llm.model),
  system: instructions,
  prompt: question,
  tools: aiSdkTools(tools, { tool, jsonSchema }),
  // Each step is one model turn; tool calls and their results take a step each.
  stopWhen: stepCountIs(12),
  onStepFinish: ({ toolCalls }) => {
    for (const call of toolCalls) logToolCall(call.toolName, call.input)
  },
})

console.log(`\n${text}\n`)
