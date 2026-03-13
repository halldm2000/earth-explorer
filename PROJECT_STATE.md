# Project State

## Current Status

Scaffolding phase. Project structure created via agent-studio template. CesiumJS chosen as the rendering engine. A working single-file HTML prototype exists (in CLAUDE-COWORK/earth-explorer.html) with the core globe, terrain, OSM buildings, atmosphere, location bookmarks, time controls, and layer toggles. Next step: port the prototype into the proper React/Vite/TypeScript project structure.

## Recent Changes

| Date | Change | Files |
|------|--------|-------|
| 2026-03-13 | Project scaffolded from agent-studio template | All |
| 2026-03-13 | CLAUDE.md customized for CesiumJS + Earth Explorer | CLAUDE.md |

## Known Issues

- Prototype is a single HTML file, not yet ported to modular React structure
- CesiumJS CDN version 1.119 failed to load; switched to 1.126 via jsDelivr in prototype

## Architecture Notes

CesiumJS as the 3D engine, React for UI shell, Zustand for state. Features (flood sim, fire spread, climate projections, weather overlay, Earth-2 inference) will be self-contained modules in src/features/. The Cesium Viewer is abstracted behind src/scene/engine.ts so features never touch Cesium APIs directly. See agent-studio DECISIONS.md for the engine-agnostic rationale.
