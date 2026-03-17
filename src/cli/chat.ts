#!/usr/bin/env node
/**
 * Worldscope CLI Chat
 *
 * A terminal interface for controlling the 3D globe via local AI models (Ollama)
 * or cloud providers. Connects to the same WebSocket broker as the browser app.
 *
 * Usage:
 *   pnpm chat                          # auto-detect Ollama model
 *   pnpm chat --model llama3.1:8b      # specific Ollama model
 *   pnpm chat --provider claude        # use Claude (needs ANTHROPIC_API_KEY env)
 */

import { createInterface } from 'node:readline'
import { WebSocket } from 'ws'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  McpToolDef,
  ServerToBrowserMessage,
  BrowserToServerMessage,
} from '../mcp/protocol.js'
import { BROKER_SERVER_PATH } from '../mcp/protocol.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')

/** Read a key from .env file */
function loadDotEnvKey(key: string): string {
  try {
    const env = readFileSync(join(PROJECT_ROOT, '.env'), 'utf-8')
    const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
    return match?.[1]?.trim() || ''
  } catch { return '' }
}

// ── Config ──

const args = process.argv.slice(2)
function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const BROKER_URL = getArg('--broker') || `ws://localhost:5173${BROKER_SERVER_PATH}`
const OLLAMA_URL = getArg('--ollama-url') || 'http://localhost:11434'
const PROVIDER = getArg('--provider') || 'ollama'
const MODEL = getArg('--model') || undefined
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || loadDotEnvKey('VITE_ANTHROPIC_API_KEY') || ''
const TOOL_CALL_TIMEOUT = 15_000
const MAX_ROUNDS = 5

// ── Colors ──

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

// ── Broker connection ──

let ws: WebSocket | null = null
let tools: McpToolDef[] = []
const pendingCalls = new Map<string, {
  resolve: (result: { content: string; isError?: boolean }) => void
  timer: ReturnType<typeof setTimeout>
}>()
let callCounter = 0

function connectBroker(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(BROKER_URL)
    ws.on('open', () => {
      ws!.send(JSON.stringify({ type: 'sync-request' }))
      resolve()
    })
    ws.on('message', (data) => {
      const msg: BrowserToServerMessage = JSON.parse(data.toString())
      if (msg.type === 'sync-response' || msg.type === 'tools-changed') {
        tools = msg.tools
      } else if (msg.type === 'tool-result') {
        const pending = pendingCalls.get(msg.callId)
        if (pending) {
          clearTimeout(pending.timer)
          pending.resolve({ content: msg.content, isError: msg.isError })
          pendingCalls.delete(msg.callId)
        }
      }
    })
    ws.on('error', () => reject(new Error('Cannot connect to Worldscope. Is pnpm dev running?')))
    ws.on('close', () => { ws = null })
  })
}

function callTool(commandId: string, params: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ content: 'Not connected to Worldscope', isError: true })
      return
    }
    const callId = `cli-${++callCounter}-${Date.now()}`
    const timer = setTimeout(() => {
      pendingCalls.delete(callId)
      resolve({ content: 'Tool call timed out', isError: true })
    }, TOOL_CALL_TIMEOUT)
    pendingCalls.set(callId, { resolve, timer })
    const msg: ServerToBrowserMessage = { type: 'tool-call', callId, commandId, params }
    ws.send(JSON.stringify(msg))
  })
}

// ── OpenAI-format tool definitions ──

function buildToolDefs() {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

// ── Chat with tool execution loop (OpenAI format) ──

interface Message {
  role: string
  content: string | null
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

async function chatWithTools(
  messages: Message[],
  callAPI: (messages: Message[], toolDefs: any[]) => Promise<{ content: string | null; tool_calls?: any[]; reasoning?: string }>,
): Promise<string> {
  const toolDefs = buildToolDefs()
  let textOutput = ''
  let round = 0

  while (round < MAX_ROUNDS) {
    round++
    const response = await callAPI(messages, toolDefs)

    // Collect text
    if (response.reasoning) {
      // Show thinking in dim
      process.stdout.write(`${DIM}${response.reasoning}${RESET}\n`)
    }
    if (response.content) {
      textOutput += response.content
    }

    // No tool calls → done
    if (!response.tool_calls || response.tool_calls.length === 0) break

    // Add assistant message with tool calls to history
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    })

    // Execute tool calls
    for (const tc of response.tool_calls) {
      const toolName = tc.function.name
      let params: Record<string, unknown> = {}
      try { params = JSON.parse(tc.function.arguments) } catch {}

      const tool = tools.find(t => t.name === toolName)
      if (tool) {
        const result = await callTool(tool.commandId, params)
        if (result.isError) {
          console.log(`${RED}  ✗ ${tool.commandId}: ${result.content}${RESET}`)
        } else {
          console.log(`${GREEN}  ✓ ${result.content}${RESET}`)
        }
        // Add tool result to history
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: tc.id,
        })
      }
    }
  }

  return textOutput
}

// ── Ollama API ──

async function detectModel(): Promise<string> {
  if (MODEL) return MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    const data = await res.json()
    const models: { name: string }[] = data.models || []
    if (models.length === 0) throw new Error('No Ollama models installed')
    return models.find(m => m.name.includes('llama'))?.name
      || models[0].name
  } catch {
    throw new Error('Cannot connect to Ollama. Is it running?')
  }
}

function makeOllamaAPI(model: string) {
  return async (messages: Message[], toolDefs: any[]) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 1024,
      stream: false,
    }
    if (toolDefs.length > 0) body.tools = toolDefs

    const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.text()
      // Retry without tools if model doesn't support them
      if (errBody.includes('does not support tools') && body.tools) {
        delete body.tools
        const retry = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!retry.ok) throw new Error(`Ollama error: ${await retry.text()}`)
        const data = await retry.json()
        const msg = data.choices?.[0]?.message
        return { content: msg?.content || msg?.reasoning || '', tool_calls: undefined }
      }
      throw new Error(`Ollama error: ${errBody}`)
    }
    const data = await res.json()
    const msg = data.choices?.[0]?.message
    return {
      content: msg?.content || '',
      reasoning: msg?.reasoning || undefined,
      tool_calls: msg?.tool_calls,
    }
  }
}

// ── Claude API ──

function makeClaudeAPI() {
  return async (messages: Message[], toolDefs: any[]) => {
    if (!ANTHROPIC_KEY) throw new Error('Set ANTHROPIC_API_KEY to use Claude')

    const systemMsg = messages.find(m => m.role === 'system')
    const apiMessages = messages.filter(m => m.role !== 'system')

    // Convert to Anthropic format
    const anthropicTools = toolDefs.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))

    const body: Record<string, unknown> = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemMsg?.content || '',
      messages: apiMessages.map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
          }
        }
        if (m.role === 'assistant' && m.tool_calls) {
          const content: any[] = []
          if (m.content) content.push({ type: 'text', text: m.content })
          for (const tc of m.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            })
          }
          return { role: 'assistant', content }
        }
        return { role: m.role, content: m.content }
      }),
    }
    if (anthropicTools.length > 0) body.tools = anthropicTools

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Claude error: ${await res.text()}`)

    const data = await res.json()
    let content = ''
    const tool_calls: any[] = []

    for (const block of data.content || []) {
      if (block.type === 'text') content += block.text
      if (block.type === 'tool_use') {
        tool_calls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        })
      }
    }

    return { content: content || null, tool_calls: tool_calls.length > 0 ? tool_calls : undefined }
  }
}

// ── Main ──

async function main() {
  console.log(`${BOLD}Worldscope CLI Chat${RESET}`)
  console.log(`${DIM}Type commands naturally. Ctrl+C to exit.${RESET}\n`)

  // Connect to broker and wait for tools
  try {
    await connectBroker()
    for (let i = 0; i < 30 && tools.length === 0; i++) {
      await new Promise(r => setTimeout(r, 100))
    }
    if (tools.length === 0) {
      console.log(`${YELLOW}Connected but no tools yet${RESET} — is the browser open at localhost:5173?`)
    } else {
      console.log(`${GREEN}Connected to Worldscope${RESET} (${tools.length} tools)`)
    }
  } catch (err) {
    console.error(`${RED}${(err as Error).message}${RESET}`)
    process.exit(1)
  }

  // Set up provider
  let callAPI: (messages: Message[], toolDefs: any[]) => Promise<{ content: string | null; tool_calls?: any[]; reasoning?: string }>
  let providerLabel: string

  if (PROVIDER === 'claude') {
    if (!ANTHROPIC_KEY) {
      console.error(`${RED}Set ANTHROPIC_API_KEY to use Claude${RESET}`)
      process.exit(1)
    }
    callAPI = makeClaudeAPI()
    providerLabel = 'Claude'
  } else {
    let model: string
    try {
      model = await detectModel()
    } catch (err) {
      console.error(`${RED}${(err as Error).message}${RESET}`)
      process.exit(1)
    }
    callAPI = makeOllamaAPI(model)
    providerLabel = `Ollama/${model}`
  }

  console.log(`${DIM}Provider: ${providerLabel}${RESET}`)
  console.log(`${DIM}Commands: /claude, /ollama [model], /models, /clear, /quit${RESET}\n`)

  const systemPrompt = `You are an AI assistant for Worldscope, an interactive 3D globe application. You control the globe using tools. Be concise.`

  const history: Message[] = [
    { role: 'system', content: systemPrompt },
  ]

  /** Switch the active provider */
  function switchProvider(provider: string, model?: string) {
    if (provider === 'claude') {
      if (!ANTHROPIC_KEY) {
        console.log(`${RED}Set ANTHROPIC_API_KEY to use Claude${RESET}`)
        return
      }
      callAPI = makeClaudeAPI()
      providerLabel = 'Claude'
    } else {
      const m = model || 'llama3.1:8b'
      callAPI = makeOllamaAPI(m)
      providerLabel = `Ollama/${m}`
    }
    // Clear history on provider switch (different models have different context)
    history.length = 1 // keep system prompt
    console.log(`${GREEN}Switched to ${providerLabel}${RESET}\n`)
  }

  /** Handle CLI slash commands, returns true if handled */
  async function handleSlashCommand(input: string): Promise<boolean> {
    if (input === '/claude' || input === '/anthropic') {
      switchProvider('claude')
      return true
    }
    if (input.startsWith('/ollama')) {
      const model = input.slice(7).trim() || undefined
      // Fuzzy match if partial name given
      if (model) {
        try {
          const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
          const data = await res.json()
          const installed: string[] = (data.models || []).map((m: any) => m.name)
          const match = installed.find(m => m === model)
            || installed.find(m => m.startsWith(model))
            || installed.find(m => m.includes(model))
          switchProvider('ollama', match || model)
        } catch {
          switchProvider('ollama', model)
        }
      } else {
        const detected = await detectModel()
        switchProvider('ollama', detected)
      }
      return true
    }
    if (input === '/models') {
      try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
        const data = await res.json()
        const models: { name: string; details?: { parameter_size?: string } }[] = data.models || []
        console.log(`${BOLD}Available Ollama models:${RESET}`)
        for (const m of models) {
          const size = m.details?.parameter_size || ''
          console.log(`  ${m.name}${size ? ` ${DIM}(${size})${RESET}` : ''}`)
        }
        if (ANTHROPIC_KEY) console.log(`  ${DIM}claude (cloud)${RESET}`)
        console.log(`${DIM}Current: ${providerLabel}${RESET}`)
      } catch {
        console.log(`${RED}Cannot connect to Ollama${RESET}`)
      }
      console.log()
      return true
    }
    if (input === '/clear') {
      history.length = 1
      console.log(`${DIM}History cleared${RESET}\n`)
      return true
    }
    if (input === '/quit' || input === '/exit' || input === '/bye') {
      ws?.close()
      process.exit(0)
    }
    return false
  }

  // REPL
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${CYAN}> ${RESET}`,
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    // Check for slash commands first
    if (input.startsWith('/')) {
      const handled = await handleSlashCommand(input)
      if (handled) { rl.prompt(); return }
    }

    history.push({ role: 'user', content: input })

    try {
      const response = await chatWithTools(history, callAPI)
      if (response) console.log(`\n${response}`)
      history.push({ role: 'assistant', content: response || '' })

      // Keep history manageable
      if (history.length > 30) {
        history.splice(1, 2)
      }
    } catch (err) {
      console.error(`\n${RED}${(err as Error).message}${RESET}`)
    }

    console.log()
    rl.prompt()
  })

  rl.on('close', () => {
    ws?.close()
    process.exit(0)
  })
}

main()
