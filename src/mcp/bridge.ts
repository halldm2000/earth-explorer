/**
 * Browser-side MCP bridge.
 *
 * Connects to the broker's WebSocket endpoint on the Vite dev server,
 * syncs the command registry as MCP tool definitions, and executes tool
 * calls when MCP server processes forward them from AI clients.
 *
 * Runs inside the React app (browser context). Imported and started
 * from the AI init module.
 */

import { registry } from '@/ai/registry'
import type { CommandEntry } from '@/ai/types'
import type {
  McpToolDef,
  McpContentBlock,
  ServerToBrowserMessage,
  BrowserToServerMessage,
} from './protocol'
import { BROKER_BROWSER_PATH } from './protocol'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeRegistry: (() => void) | null = null

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_DELAY_MS = 15_000
let currentDelay = RECONNECT_DELAY_MS

// ── Public API ──

export function startMcpBridge(): void {
  connect()

  // Watch for registry changes and push updates
  unsubscribeRegistry = registry.subscribe(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      send({ type: 'tools-changed', tools: buildToolDefs() })
    }
  })
}

export function stopMcpBridge(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (unsubscribeRegistry) {
    unsubscribeRegistry()
    unsubscribeRegistry = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
}

export function isMcpConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN
}

// ── Connection management ──

function connect(): void {
  // Connect to the broker on the same host/port as the Vite dev server
  const url = `ws://${window.location.host}${BROKER_BROWSER_PATH}`

  try {
    socket = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    console.log('[MCP Bridge] Connected to broker')
    currentDelay = RECONNECT_DELAY_MS
  }

  socket.onmessage = (event) => {
    try {
      const msg: ServerToBrowserMessage = JSON.parse(event.data as string)
      handleServerMessage(msg)
    } catch (err) {
      console.warn('[MCP Bridge] Failed to parse message:', err)
    }
  }

  socket.onclose = () => {
    console.log('[MCP Bridge] Disconnected from broker')
    socket = null
    scheduleReconnect()
  }

  socket.onerror = () => {
    // onclose will fire after this, triggering reconnect
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, currentDelay)
  // Exponential backoff, capped
  currentDelay = Math.min(currentDelay * 1.5, MAX_RECONNECT_DELAY_MS)
}

// ── Message handling ──

function handleServerMessage(msg: ServerToBrowserMessage): void {
  switch (msg.type) {
    case 'sync-request':
      send({ type: 'sync-response', tools: buildToolDefs() })
      break

    case 'tool-call':
      executeToolCall(msg.callId, msg.commandId, msg.params)
      break
  }
}

async function executeToolCall(
  callId: string,
  commandId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const command = registry.get(commandId)
  if (!command) {
    send({
      type: 'tool-result',
      callId,
      content: `Unknown command: ${commandId}`,
      isError: true,
    })
    return
  }

  try {
    const result = await command.handler(params)

    // Handler can return void, string, or ContentBlock[]
    let content: string
    let blocks: McpContentBlock[] | undefined
    if (result == null) {
      content = `Executed: ${command.name}`
    } else if (typeof result === 'string') {
      content = result
    } else if (Array.isArray(result)) {
      // ContentBlock[] — pass through all blocks including images
      blocks = result.map(b => {
        if (b.type === 'image') {
          return { type: 'image' as const, data: b.data, mediaType: b.mediaType }
        }
        return { type: 'text' as const, text: b.text }
      })
      const textParts = result
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
      content = textParts.join('\n') || `Executed: ${command.name}`
    } else {
      content = String(result)
    }

    send({ type: 'tool-result', callId, content, blocks })
  } catch (err) {
    send({
      type: 'tool-result',
      callId,
      content: `Error executing ${command.name}: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    })
  }
}

// ── Tool definition generation ──

function buildToolDefs(): McpToolDef[] {
  return registry.getAll()
    .filter(cmd => !cmd.aiHidden)
    .map(commandToToolDef)
}

function commandToToolDef(cmd: CommandEntry): McpToolDef {
  const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {}
  const required: string[] = []

  for (const p of cmd.params) {
    const prop: { type: string; description?: string; enum?: string[] } = {
      type: p.type === 'enum' ? 'string' : p.type,
    }
    if (p.description) prop.description = p.description
    if (p.options) prop.enum = p.options
    properties[p.name] = prop
    if (p.required) required.push(p.name)
  }

  return {
    name: cmd.id.replace(/:/g, '_'),
    description: cmd.description,
    parameters: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    commandId: cmd.id,
  }
}

// ── Helpers ──

function send(msg: BrowserToServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}
