# Worldscope

An interactive 3D globe for visualizing and exploring Earth data. Built as a general-purpose platform with a modular app system for simulations (flood, fire, climate projections), weather overlays, and NVIDIA Earth-2 model inference.

This project uses the **agent-studio** multi-agent framework for development. The orchestrator and specialist agents are at `~/Dropbox/WORK_NVIDIA/NV_PROJECTS/agent-studio/`.

## Tech Stack

- **Framework**: React 18+ with TypeScript
- **3D Engine**: CesiumJS 1.139 (globe, terrain, 3D tiles, geospatial primitives)
- **State**: Zustand with slices pattern
- **Build**: Vite with vite-plugin-cesium
- **Data formats**: GeoJSON, WMTS imagery (more planned: NetCDF, GRIB, CSV)
- **AI integration**: Multi-provider streaming client (Anthropic, OpenAI, Ollama, OpenRouter) with 3-tier intent routing
- **Audio**: Procedural Web Audio API sound effects

## Architecture

```
src/
├── app/          # Shell (App.tsx, SetupScreen.tsx)
├── ai/           # AI router, providers, command registry, core commands
├── apps/         # App system (manager, types) for dynamic feature registration
├── audio/        # Procedural Web Audio sound effects
├── cli/          # Standalone CLI chat client
├── features/     # Feature modules (layers, earthquake, gibs)
├── mcp/          # MCP server (stdio + HTTP), browser bridge, Vite broker plugin
├── plugin-api/   # Plugin contract types (ExplorerAPI, EarthPlugin — defined, not yet loaded)
├── scene/        # CesiumJS viewer, engine state, buildings, base maps
├── store/        # Zustand store (tokens, chat state)
└── ui/           # ChatPanel (three-state: minimized, peek, full)
```

Features register as "apps" via `apps/manager.ts`, which manages lifecycle, commands, and layers. The command registry lives in `ai/registry.ts`. Adding a feature never requires editing core files.

## Cesium-Specific Conventions

- The Cesium Viewer lives in `scene/`. Engine state (viewer, building mode, base map, orbit) is managed via `scene/engine.ts`.
- Apps interact with the globe through the `AppContext` provided by the app manager: `addLayer()`, `removeLayer()`, `showLayer()`, `hideLayer()`, `getViewer()`, `onTick()`.
- Camera status is synced to the Zustand store by `CesiumViewer.tsx` on each frame. Commands read position from the store or viewer as needed.
- Building mode auto-switches between OSM and Google Photorealistic 3D Tiles based on altitude (hysteresis: 50km→photo, 55km→OSM).

## API Tokens

- **Cesium Ion**: Required. Stored in `.env` as `VITE_CESIUM_ION_TOKEN`. Provides terrain (asset 1), OSM buildings (asset 96188), and imagery. A default token is embedded for basic usage.
- **Anthropic**: Optional. Stored in `.env` as `VITE_ANTHROPIC_API_KEY`. Enables Claude-powered AI chat (Haiku for classification, Sonnet for conversation).

Never commit `.env`.

## MCP Integration (Important for AI Agents)

This project has an MCP server that lets AI assistants control the 3D globe. If you have `worldscope` MCP tools available, **just use them**. That's it.

- **Do NOT start the dev server.** The user manages it. If tools return "not connected", ask the user to run `pnpm dev` in the project directory.
- **Do NOT use worktrees.** The MCP server must run from the main project directory.
- **Do NOT use preview tools or launch browsers.** The MCP screenshot tool captures the globe directly.
- **Do NOT install dependencies.** The user's machine has everything set up.

The MCP tools handle navigation, screenshots, layer toggling, queries, and more. The connection from your MCP server to the browser is automatic via a WebSocket broker on the Vite dev server.

## Dropbox + Git

This project lives in a Dropbox-synced folder. To prevent Dropbox from corrupting `.git` internals (loose objects, refs), the `.git` and `node_modules` directories are excluded from Dropbox sync via the `com.dropbox.ignored` alternate data stream:

```powershell
Set-Content -Path '.git' -Stream com.dropbox.ignored -Value 1
Set-Content -Path 'node_modules' -Stream com.dropbox.ignored -Value 1
```

**On a new machine:** clone from GitHub independently (`git clone`), run `npm install`, and set the ignore flags above. Source files sync via Dropbox; git history syncs via GitHub push/pull.

## Development Conventions

- **Dark mode is the default.** Light mode is the variant.
- **Colormaps must be perceptually uniform.** Viridis is the default. No rainbow/jet.
- **All animations use spring physics**, not CSS easing. Define spring constants, not durations.
- **Camera controls have inertia.** Cesium's default camera controller handles this; don't replace it.
- **Every data display has units and a legend.** No orphaned colors.
- **No secrets in client code.** API tokens are in `.env` (Vite injects them at build time).
- **Frame budget: 16ms.** Nothing blocks Cesium's render loop.

## Quality Standards

See `quality-gates.md` for specific budgets and thresholds.

## Project Status

See `PROJECT_STATE.md` for current status, recent changes, and known issues.
