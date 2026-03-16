/**
 * MCP module public API.
 *
 * The bridge (browser-side) is the only piece that runs in the app.
 * The server is a separate Node.js process (see server.ts).
 * The broker runs as a Vite plugin (see vite-plugin-mcp-broker.ts).
 */

export { startMcpBridge, stopMcpBridge, isMcpConnected } from './bridge'
export type { McpToolDef } from './protocol'
