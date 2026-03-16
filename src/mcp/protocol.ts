/**
 * Shared protocol types for the MCP bridge.
 *
 * Architecture:
 *   AI Client <--stdio/HTTP--> MCP Server <--WS client--> Broker (Vite dev server) <--WS client--> Browser
 *
 * The broker runs as a Vite plugin on the dev server. Both MCP server processes
 * and the browser connect to it as WebSocket clients. The broker routes messages
 * between them, enabling multiple AI clients to share one browser session.
 */

// ── Messages from MCP server → browser (routed through broker) ──

export interface SyncRequestMessage {
  type: 'sync-request'
}

export interface ToolCallMessage {
  type: 'tool-call'
  /** Unique ID to correlate the response */
  callId: string
  /** Command ID (e.g. "core:go-to") */
  commandId: string
  /** Extracted parameters */
  params: Record<string, unknown>
}

export type ServerToBrowserMessage = SyncRequestMessage | ToolCallMessage

// ── Messages from browser → MCP server (routed through broker) ──

export interface SyncResponseMessage {
  type: 'sync-response'
  /** Full set of available tools (auto-generated from command registry) */
  tools: McpToolDef[]
}

/** A content block in a tool result (mirrors the app's ContentBlock type) */
export interface McpContentBlock {
  type: 'text' | 'image'
  text?: string
  data?: string       // base64 image data
  mediaType?: string   // e.g. 'image/jpeg'
}

export interface ToolResultMessage {
  type: 'tool-result'
  callId: string
  /** Text result (simple string for backward compat) */
  content: string
  /** Rich content blocks (includes images). If present, use this instead of content. */
  blocks?: McpContentBlock[]
  isError?: boolean
}

/** Pushed when the command registry changes (plugin loaded/unloaded, etc.) */
export interface ToolsChangedMessage {
  type: 'tools-changed'
  tools: McpToolDef[]
}

export type BrowserToServerMessage =
  | SyncResponseMessage
  | ToolResultMessage
  | ToolsChangedMessage

// ── Shared tool definition (maps to MCP tool schema) ──

export interface McpToolParam {
  type: string
  description?: string
  enum?: string[]
}

export interface McpToolDef {
  /** Command ID with colons replaced by underscores (MCP-safe) */
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, McpToolParam>
    required?: string[]
  }
  /** Original command ID (e.g. "core:go-to") for reverse lookup */
  commandId: string
}

// ── Constants ──

/** Broker WebSocket paths (on the Vite dev server) */
export const BROKER_BROWSER_PATH = '/mcp-bridge/browser'
export const BROKER_SERVER_PATH = '/mcp-bridge/server'

/** Default Vite dev server port */
export const DEFAULT_BROKER_PORT = 5173
