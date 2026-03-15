/**
 * Browser-side MCP bridge.
 *
 * Connects to the MCP server's WebSocket endpoint, syncs the command
 * registry as MCP tool definitions, and executes tool calls when the
 * MCP server forwards them from Claude Desktop (or any MCP client).
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
import { DEFAULT_WS_PORT, WS_PATH } from './protocol'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeRegistry: (() => void) | null = null

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30_000
let currentDelay = RECONNECT_DELAY_MS

// ── Public API ──

export function startMcpBridge(port?: number): void {
  const wsPort = port ?? DEFAULT_WS_PORT
  connect(wsPort)

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

function connect(port: number): void {
  const url = `ws://localhost:${port}${WS_PATH}`

  try {
    socket = new WebSocket(url)
  } catch {
    scheduleReconnect(port)
    return
  }

  socket.onopen = () => {
    console.log('[MCP Bridge] Connected to MCP server')
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
    console.log('[MCP Bridge] Disconnected from MCP server')
    socket = null
    scheduleReconnect(port)
  }

  socket.onerror = () => {
    // onclose will fire after this, triggering reconnect
  }
}

function scheduleReconnect(port: number): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect(port)
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

/**
 * Build MCP tool definitions from the command registry.
 * Mirrors the logic in router.ts buildToolDefs(), but includes
 * the original commandId for reverse mapping.
 */
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
    // Replace colons with underscores for MCP compatibility (same as router.ts)
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
