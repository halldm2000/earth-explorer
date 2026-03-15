/**
 * MCP module public API.
 *
 * The bridge (browser-side) is the only piece that runs in the app.
 * The server is a separate Node.js process (see server.ts).
 */

export { startMcpBridge, stopMcpBridge, isMcpConnected } from './bridge'
export type { McpToolDef } from './protocol'
export { DEFAULT_WS_PORT } from './protocol'
