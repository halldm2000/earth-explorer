/**
 * Shared protocol types for the WebSocket bridge between the MCP server
 * (Node.js, stdio transport) and the browser app (command registry + handlers).
 *
 * Flow: Claude Desktop <--stdio--> MCP Server <--WebSocket--> Browser App
 */

// ── Messages from MCP server → browser ──

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

// ── Messages from browser → MCP server ──

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

export const DEFAULT_WS_PORT = 3100
export const WS_PATH = '/mcp-bridge'
