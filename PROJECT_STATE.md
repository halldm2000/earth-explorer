# Project State

## Current Status

Core runtime ~80% complete. MCP server fully implemented with dual transport support (stdio for Claude Desktop/Code, HTTP for other AI environments). Browser-side bridge wired into app startup. CesiumJS 1.139, React 18, Zustand, Vite, pnpm.

## Recent Changes

| Date | Change | Files |
|------|--------|-------|
| 2026-03-15 | MCP server: dual transport (stdio + HTTP/SSE) | src/mcp/server.ts |
| 2026-03-15 | Wire MCP bridge into app initialization | src/ai/init.ts |
| 2026-03-15 | Fix Cesium 1.139 CameraFlyToOptions type | src/ai/core-commands.ts |
| 2026-03-15 | Switch to pnpm (Dropbox compat) | package.json, pnpm-lock.yaml |
| 2026-03-15 | Register MCP server with Claude Code | ~/.claude.json |
| 2026-03-13 | Project scaffolded from agent-studio template | All |
| 2026-03-13 | CLAUDE.md customized for CesiumJS + Earth Explorer | CLAUDE.md |

## MCP Architecture

```
Claude Desktop/Code ──stdio──► MCP Server ──WebSocket──► Browser App
Other AI clients ────HTTP────►     │                       (executes commands,
                                   │                        returns results)
                                   ▼
                              Port 3001: WS bridge to browser
                              Port 3002: HTTP MCP endpoint (when --transport http)
```

**Stdio mode** (default): `pnpm run mcp` or `npx tsx src/mcp/server.ts`
**HTTP mode**: `pnpm run mcp:http` or `npx tsx src/mcp/server.ts --transport http`

Tools are dynamically registered from the browser's command registry. When plugins load/unload, tools update automatically.

## Known Issues

- End-to-end MCP test pending (needs browser app running + Claude Code session restart)
- Prototype single-file HTML (CLAUDE-COWORK/earth-explorer.html) has features not yet ported to modular structure
- vite-plugin-cesium peer dep warning (wants rollup ^2.25, project uses rollup 4)

## Architecture Notes

CesiumJS as the 3D engine, React for UI shell, Zustand for state. Features (flood sim, fire spread, climate projections, weather overlay, Earth-2 inference) will be self-contained modules in src/features/. The Cesium Viewer is abstracted behind src/scene/engine.ts so features never touch Cesium APIs directly. See agent-studio DECISIONS.md for the engine-agnostic rationale.

## Next Steps

1. End-to-end test: start dev server, open browser, restart Claude Code, verify tool discovery and execution
2. Phase 2: Visualization toolkit (colormaps, grid renderer, legends, time slider)
3. Phase 3: Reference plugins (earthquake monitor, NASA GIBS)
