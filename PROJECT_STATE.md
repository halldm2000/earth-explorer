# Project State

## Current Status

Core runtime ~90% complete. MCP server fully operational with dual transport (stdio + HTTP). App system implemented with two working apps (earthquake monitor, NASA GIBS). AI router with 3-tier intent classification (pattern → Haiku classifier → Sonnet chat). Multi-provider AI support (Anthropic, OpenAI, Ollama, OpenRouter). 20+ commands. Procedural audio. Google Photorealistic 3D Tiles with altitude auto-switching. CesiumJS 1.139, React 18, Zustand, Vite, pnpm.

## What's Built

### Core Systems
- **3D Globe**: CesiumJS viewer with terrain, OSM + Google Photorealistic buildings (altitude-based auto-switching), atmosphere, lighting, 5 base map styles
- **AI Router**: 3-tier routing — Haiku classifier (~300ms) → Sonnet chat with tool use (streaming) → offline regex fallback
- **AI Providers**: Anthropic (Claude), OpenAI-compatible (OpenAI, Ollama, OpenRouter, Together, Groq, LM Studio, vLLM)
- **Command Registry**: Dynamic registration/unregistration, module scoping, listener subscriptions
- **20+ Commands**: go-to, zoom-to/in/out, face, look-at, orbit, reset-view, toggle-buildings/terrain/lighting, set-time, base-map, list-maps, fullscreen, mute, help, set-provider, list-providers, pull-model
- **Query Tools**: camera, layers, scene (all chatOnly, route through AI for interpretation)
- **MCP Server**: Dual transport (stdio + HTTP), WebSocket bridge to browser, Vite broker plugin, tool caching
- **App System**: Dynamic app lifecycle (register, activate, deactivate), resource management (commands + layers), tick callbacks
- **Chat Panel**: Three states (minimized, peek, full), markdown rendering, tool action display, usage stats, keyboard shortcuts
- **Audio**: Procedural Web Audio (snap, ping, success, rumble), master gain, mute toggle (M key)
- **Store**: Zustand with cesium token management, chat state (messages, panel state, status, processing flag)
- **CLI Client**: Standalone stdin/stdout chat client via MCP protocol

### Apps (src/features/)
- **Layers**: Layer management (GeoJSON, imagery, 3D tilesets), built-in borders/coastlines/rivers
- **Earthquake Monitor**: USGS real-time feed (M2.5+ daily), show/hide/latest commands, auto-activates
- **NASA GIBS**: 4 WMTS layers (MODIS true color, VIIRS night lights, sea surface temp, cloud cover), toggle/list commands, auto-activates

### Plugin API (defined, not yet loaded)
- **types.ts**: Full contract (EarthPlugin, ExplorerAPI, GriddedDataSource, PointDataSource, TrackDataSource, ColormapDef, PanelDef)
- No plugin loader or execution engine yet

## What's NOT Built (despite being mentioned in docs)

- **src/data/**: No data pipeline, no NetCDF/GRIB/CSV loaders (only GeoJSON via layer manager)
- **src/shared/**: No shared types/constants/hooks directory
- **Plugin loader**: Plugin API types exist but no way to load external plugins
- **Screenshot/vision**: Referenced in AI design doc but query:screenshot not implemented
- **Elevation query**: query:elevation not implemented
- **Colormap system**: No colormap registry or shared colormaps
- **Grid/Point/Track renderers**: Plugin API defines data source interfaces but no renderers exist
- **Time slider**: Not built
- **Legend component**: Not built
- **Speech input/output**: Not implemented
- **SetupScreen**: Component exists but not wired into App.tsx
- **Spring animations**: No react-spring, no spring physics (animations use Cesium flyTo)
- **CSS Modules**: Not used (inline styles / plain CSS)

## Recent Changes

| Date | Change | Files |
|------|--------|-------|
| 2026-03-16 | Add orbit command with auto-cancel on user input | src/scene/engine.ts, src/ai/core-commands.ts |
| 2026-03-16 | Fix look-at heading (was 180° inverted) | src/ai/core-commands.ts |
| 2026-03-16 | Fix zoom-to to use AGL instead of ellipsoid height | src/ai/core-commands.ts |
| 2026-03-16 | Generalize face-north → face with heading support | src/ai/core-commands.ts |
| 2026-03-15 | MCP server: dual transport (stdio + HTTP/SSE) | src/mcp/server.ts |
| 2026-03-15 | Wire MCP bridge into app initialization | src/ai/init.ts |
| 2026-03-15 | Fix Cesium 1.139 CameraFlyToOptions type | src/ai/core-commands.ts |
| 2026-03-15 | Switch to pnpm (Dropbox compat) | package.json, pnpm-lock.yaml |
| 2026-03-15 | Register MCP server with Claude Code | ~/.claude.json |
| 2026-03-13 | Project scaffolded from agent-studio template | All |
| 2026-03-13 | CLAUDE.md customized for CesiumJS + Worldscope | CLAUDE.md |

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

Tools are dynamically registered from the browser's command registry. When apps load/unload, tools update automatically.

## Known Issues

- MCP tool schema caching: new/changed tool params require MCP server restart to take effect
- Prototype single-file HTML (CLAUDE-COWORK/worldscope.html) has features not yet ported to modular structure
- vite-plugin-cesium peer dep warning (wants rollup ^2.25, project uses rollup 4)
- query:screenshot and query:elevation referenced in AI design but not implemented

## Architecture Notes

CesiumJS as the 3D engine, React for UI shell, Zustand for state. Features are registered as "apps" via `src/apps/manager.ts` which manages lifecycle, commands, and layers. The Cesium Viewer is abstracted behind `src/scene/engine.ts`. The command registry in `src/ai/registry.ts` is the single source of truth for capabilities — the AI router, MCP server, and app system all use it.

## Next Steps

1. Implement query:screenshot (canvas capture + vision) and query:elevation
2. Phase 2: Visualization toolkit (colormaps, grid renderer, point renderer, legends, time slider)
3. Plugin loader (load EarthPlugin modules from URL, validate apiVersion)
4. Wire SetupScreen into App.tsx for missing token onboarding
5. Fix MCP tool re-registration so schema changes don't require server restart
