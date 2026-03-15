#!/usr/bin/env node
/**
 * MCP Server for Earth Explorer.
 *
 * Runs as a standalone Node.js process. Communicates with AI clients via
 * MCP protocol (stdio or HTTP) and with the browser app via WebSocket.
 *
 * Transports:
 *   --transport stdio   (default) For Claude Desktop / Claude Code
 *   --transport http    For any HTTP-capable AI client (OpenAI, custom agents, etc.)
 *
 * Usage:
 *   npx tsx src/mcp/server.ts [--transport stdio|http] [--port 3001] [--http-port 3002]
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "earth-explorer": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/earth-explorer/src/mcp/server.ts"]
 *       }
 *     }
 *   }
 *
 * HTTP mode (for non-Claude AI environments):
 *   npx tsx src/mcp/server.ts --transport http --http-port 3002
 *   Then POST MCP requests to http://localhost:3002/mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type {
  McpToolDef,
  ServerToBrowserMessage,
  BrowserToServerMessage,
} from './protocol.js'
import { DEFAULT_WS_PORT, WS_PATH } from './protocol.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── State ──

import type { McpContentBlock } from './protocol.js'

let browserSocket: WebSocket | null = null
let currentTools: McpToolDef[] = []
const pendingCalls = new Map<string, {
  resolve: (result: { content: string; blocks?: McpContentBlock[]; isError?: boolean }) => void
  timer: ReturnType<typeof setTimeout>
}>()
let callCounter = 0

const TOOL_CALL_TIMEOUT_MS = 30_000
const DEFAULT_HTTP_PORT = 3002
const TOOLS_CACHE_PATH = join(__dirname, '..', '..', '.mcp-tools-cache.json')

// ── Tool cache (so tools are available on startup before browser connects) ──

function loadCachedTools(): McpToolDef[] {
  try {
    const data = readFileSync(TOOLS_CACHE_PATH, 'utf-8')
    const tools = JSON.parse(data) as McpToolDef[]
    log(`Loaded ${tools.length} tools from cache`)
    return tools
  } catch {
    return []
  }
}

function saveCachedTools(tools: McpToolDef[]): void {
  try {
    writeFileSync(TOOLS_CACHE_PATH, JSON.stringify(tools, null, 2))
    log(`Saved ${tools.length} tools to cache`)
  } catch (err) {
    log(`Failed to save tool cache: ${err}`)
  }
}

// ── CLI args ──

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    transport: (get('--transport') || 'stdio') as 'stdio' | 'http',
    wsPort: parseInt(get('--port') || String(DEFAULT_WS_PORT), 10),
    httpPort: parseInt(get('--http-port') || String(DEFAULT_HTTP_PORT), 10),
  }
}

// ── WebSocket server (browser connects here) ──

function startWebSocketServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port, path: WS_PATH })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log(`Port ${port} in use, retrying in 2s (another MCP server may be shutting down)`)
      setTimeout(() => {
        wss.close()
        startWebSocketServer(port)
      }, 2000)
    } else {
      log(`WebSocket server error: ${err.message}`)
    }
  })

  wss.on('listening', () => {
    log(`WebSocket server listening on ws://localhost:${port}${WS_PATH}`)
  })

  wss.on('connection', (ws) => {
    log('Browser connected')
    browserSocket = ws

    // Request initial tool sync
    sendWs(ws, { type: 'sync-request' })

    ws.on('message', (data) => {
      try {
        const msg: BrowserToServerMessage = JSON.parse(data.toString())
        handleBrowserMessage(msg)
      } catch (err) {
        log(`Failed to parse browser message: ${err}`)
      }
    })

    ws.on('close', () => {
      log('Browser disconnected')
      browserSocket = null
      currentTools = []
      // Reject any pending calls
      for (const [id, pending] of pendingCalls) {
        clearTimeout(pending.timer)
        pending.resolve({ content: 'Browser disconnected', isError: true })
        pendingCalls.delete(id)
      }
    })
  })

  return wss
}

function handleBrowserMessage(msg: BrowserToServerMessage): void {
  switch (msg.type) {
    case 'sync-response':
    case 'tools-changed':
      currentTools = msg.tools
      log(`Tools updated: ${currentTools.length} available (live from browser)`)
      saveCachedTools(currentTools)
      refreshMcpTools()
      break

    case 'tool-result': {
      const pending = pendingCalls.get(msg.callId)
      if (pending) {
        clearTimeout(pending.timer)
        pending.resolve({ content: msg.content, blocks: msg.blocks, isError: msg.isError })
        pendingCalls.delete(msg.callId)
      }
      break
    }
  }
}

// ── Tool call forwarding ──

function callBrowserTool(
  commandId: string,
  params: Record<string, unknown>,
): Promise<{ content: string; blocks?: McpContentBlock[]; isError?: boolean }> {
  return new Promise((resolve) => {
    if (!browserSocket || browserSocket.readyState !== WebSocket.OPEN) {
      resolve({
        content: 'Earth Explorer is not connected. Open the app in your browser first.',
        isError: true,
      })
      return
    }

    const callId = `mcp-${++callCounter}-${Date.now()}`
    const timer = setTimeout(() => {
      pendingCalls.delete(callId)
      resolve({ content: 'Tool call timed out (30s)', isError: true })
    }, TOOL_CALL_TIMEOUT_MS)

    pendingCalls.set(callId, { resolve, timer })

    sendWs(browserSocket, {
      type: 'tool-call',
      callId,
      commandId,
      params,
    })
  })
}

// ── MCP server ──

const mcpServer = new McpServer({
  name: 'earth-explorer',
  version: '1.0.0',
})

// Track registered tool names to avoid duplicates (SDK has no unregister)
const registeredToolNames = new Set<string>()

function refreshMcpTools(): void {
  for (const tool of currentTools) {
    if (registeredToolNames.has(tool.name)) continue
    registeredToolNames.add(tool.name)

    // Build a Zod schema from the tool's parameter definition
    const shape: Record<string, z.ZodTypeAny> = {}
    const props = tool.parameters.properties
    const required = new Set(tool.parameters.required || [])

    for (const [key, param] of Object.entries(props)) {
      let field: z.ZodTypeAny
      if (param.enum) {
        field = z.enum(param.enum as [string, ...string[]])
      } else if (param.type === 'number') {
        field = z.number()
      } else if (param.type === 'boolean') {
        field = z.boolean()
      } else {
        field = z.string()
      }
      if (param.description) {
        field = field.describe(param.description)
      }
      if (!required.has(key)) {
        field = field.optional()
      }
      shape[key] = field
    }

    const commandId = tool.commandId

    mcpServer.tool(
      tool.name,
      tool.description,
      shape,
      async (params) => {
        const result = await callBrowserTool(commandId, params)
        return {
          content: buildMcpContent(result),
          isError: result.isError,
        }
      },
    )
  }
}

/** Convert browser result (with optional image blocks) to MCP content array */
function buildMcpContent(result: { content: string; blocks?: McpContentBlock[] }) {
  if (!result.blocks || result.blocks.length === 0) {
    return [{ type: 'text' as const, text: result.content }]
  }
  return result.blocks.map(block => {
    if (block.type === 'image' && block.data) {
      return {
        type: 'image' as const,
        data: block.data,
        mimeType: block.mediaType || 'image/jpeg',
      }
    }
    return { type: 'text' as const, text: block.text || '' }
  })
}

// Register a status resource so clients can check connection state
mcpServer.resource(
  'status',
  'earth-explorer://status',
  async () => ({
    contents: [{
      uri: 'earth-explorer://status',
      text: JSON.stringify({
        browserConnected: browserSocket?.readyState === WebSocket.OPEN,
        toolCount: currentTools.length,
        tools: currentTools.map(t => t.name),
      }, null, 2),
      mimeType: 'application/json',
    }],
  }),
)

// ── Transport: stdio ──

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  log('MCP server started (stdio transport)')
}

// ── Transport: HTTP (Streamable HTTP) ──

async function startHttp(httpPort: number): Promise<void> {
  // Map of session ID -> transport for stateful sessions
  const sessions = new Map<string, StreamableHTTPServerTransport>()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${httpPort}`)

    // CORS headers for browser-based AI clients
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id')
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        browserConnected: browserSocket?.readyState === WebSocket.OPEN,
        toolCount: currentTools.length,
      }))
      return
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (sessionId && sessions.has(sessionId)) {
        // Existing session: route to its transport
        const transport = sessions.get(sessionId)!
        await transport.handleRequest(req, res)
        return
      }

      if (sessionId && !sessions.has(sessionId)) {
        // Unknown session
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session not found' }))
        return
      }

      // New session: create transport and connect a fresh McpServer
      // Each HTTP session gets its own McpServer instance sharing the same
      // browser bridge, because McpServer.connect() is single-transport.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })

      const sessionServer = new McpServer({
        name: 'earth-explorer',
        version: '1.0.0',
      })

      // Register the same tools and resources on this session server
      registerToolsOn(sessionServer)
      registerResourcesOn(sessionServer)

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
        log(`HTTP session closed: ${sid}`)
      }

      await sessionServer.connect(transport)
      await transport.handleRequest(req, res)

      const sid = transport.sessionId
      if (sid) {
        sessions.set(sid, transport)
        log(`New HTTP session: ${sid}`)
      }

      return
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol, /health for status.' }))
  })

  httpServer.listen(httpPort, () => {
    log(`HTTP MCP server listening on http://localhost:${httpPort}/mcp`)
    log(`Health check: http://localhost:${httpPort}/health`)
  })
}

/**
 * Register tools on an McpServer instance. Used by HTTP mode to create
 * per-session servers that share the same browser bridge.
 */
function registerToolsOn(server: McpServer): void {
  for (const tool of currentTools) {
    const shape: Record<string, z.ZodTypeAny> = {}
    const props = tool.parameters.properties
    const required = new Set(tool.parameters.required || [])

    for (const [key, param] of Object.entries(props)) {
      let field: z.ZodTypeAny
      if (param.enum) {
        field = z.enum(param.enum as [string, ...string[]])
      } else if (param.type === 'number') {
        field = z.number()
      } else if (param.type === 'boolean') {
        field = z.boolean()
      } else {
        field = z.string()
      }
      if (param.description) field = field.describe(param.description)
      if (!required.has(key)) field = field.optional()
      shape[key] = field
    }

    const commandId = tool.commandId

    server.tool(
      tool.name,
      tool.description,
      shape,
      async (params) => {
        const result = await callBrowserTool(commandId, params)
        return {
          content: buildMcpContent(result),
          isError: result.isError,
        }
      },
    )
  }
}

function registerResourcesOn(server: McpServer): void {
  server.resource(
    'status',
    'earth-explorer://status',
    async () => ({
      contents: [{
        uri: 'earth-explorer://status',
        text: JSON.stringify({
          browserConnected: browserSocket?.readyState === WebSocket.OPEN,
          toolCount: currentTools.length,
          tools: currentTools.map(t => t.name),
        }, null, 2),
        mimeType: 'application/json',
      }],
    }),
  )
}

// ── Helpers ──

function sendWs(ws: WebSocket, msg: ServerToBrowserMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function log(msg: string): void {
  process.stderr.write(`[earth-mcp] ${msg}\n`)
}

// ── Main ──

async function main(): Promise<void> {
  const config = parseArgs()

  // Load cached tools so they're available immediately when the MCP client
  // sends its first tools/list request (before the browser connects).
  const cached = loadCachedTools()
  if (cached.length > 0) {
    currentTools = cached
    refreshMcpTools()
  }

  // Start WebSocket server for browser connection (both modes need this)
  startWebSocketServer(config.wsPort)

  // Start the chosen MCP transport
  if (config.transport === 'http') {
    await startHttp(config.httpPort)
  } else {
    await startStdio()
  }
}

main().catch((err) => {
  process.stderr.write(`[earth-mcp] Fatal: ${err}\n`)
  process.exit(1)
})
