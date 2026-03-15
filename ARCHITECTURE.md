# Earth Explorer Architecture

## What This Is

Earth Explorer is a runtime for interactive 3D Earth applications. It provides a globe, a conversational command system, a layer registry, base map switching, and a plugin contract. Everything else (weather visualization, earthquake monitoring, hurricane tracking, satellite imagery, ship routes, AI model outputs) lives in separate repos and plugs in at runtime.

The goal: scientists and developers can build "digital twin" applications on top of this platform without touching the core codebase, and without bundling their app code into this repo.

## Core Runtime (this repo)

The core is intentionally small. It handles:

- **3D Globe**: CesiumJS viewer with terrain, buildings (OSM + Google Photorealistic with altitude-based auto-switching), lighting, atmosphere, camera controls, and gamepad support.
- **Conversational interface**: Natural language command system with pattern matching (instant) and Claude fallback (for open-ended questions). Three-state chat panel (minimized, peek, full).
- **Layer system**: Toggleable data overlays supporting GeoJSON vectors, imagery tiles, and 3D tilesets. Lazy-loaded on first use.
- **Base maps**: Switchable imagery styles (satellite, satellite with labels, dark, light, road). Commands: "dark map", "satellite map", etc.
- **Audio feedback**: Procedural Web Audio sounds for navigation, toggling, and data readiness.
- **Plugin API**: The stable contract between core and external plugins (see below).

### Directory Structure

```
src/
  ai/              Command system, router, registry, Claude provider
  app/             App shell, entry point
  audio/           Procedural sound effects
  features/
    layers/        Toggleable data layers (GeoJSON, imagery, tilesets)
  plugin-api/      Plugin contract types and API factory
  scene/           Cesium viewer, engine state, building/base-map management
  store/           Zustand state (tokens, chat)
  ui/              Chat panel
```

## Plugin System

### What is a plugin?

A plugin is an ES module that exports an `EarthPlugin` object. The core hands it an `ExplorerAPI` object during setup, and the plugin registers whatever it needs: layers, commands, data sources, UI panels.

```typescript
import type { EarthPlugin } from 'earth-explorer/plugin-api'

const plugin: EarthPlugin = {
  id: 'earthquake-monitor',
  name: 'USGS Earthquake Monitor',
  version: '1.0.0',
  apiVersion: '1',

  async setup(api) {
    // Register a real-time point data source
    api.viz.registerPointSource({
      id: 'usgs-earthquakes',
      name: 'USGS Earthquakes',
      realtime: { intervalMs: 60_000 },
      async fetch(req) {
        const res = await fetch('https://earthquake.usgs.gov/...')
        const geojson = await res.json()
        return { points: geojson.features.map(/* ... */) }
      },
    })

    // Register commands
    api.commands.register({
      id: 'earthquake:show',
      name: 'Show earthquakes',
      module: 'earthquake',
      patterns: ['show earthquakes', 'earthquake map', 'seismic activity'],
      // ...
    })
  },

  teardown() { /* cleanup */ }
}

export default plugin
```

### How plugins load

Three mechanisms, from simplest to most sophisticated:

1. **URL import** (zero infrastructure): The core does `await import('https://cdn.example.com/my-plugin/index.js')`. The scientist hosts their plugin anywhere (GitHub Pages, npm CDN, their own server).

2. **Local development**: `await import('./plugins/my-twin/index.ts')`. For active development, clone a plugin template and point the dev server at it.

3. **Plugin manifest** (for discoverability): A JSON file lists available plugins with metadata, URLs, and descriptions. The app reads this and shows a plugin browser. Future work.

### Data-only plugins

Simple data sources don't need code at all. A JSON manifest declares layers and the core handles rendering:

```json
{
  "id": "my-sst-forecast",
  "name": "SST Forecast",
  "apiVersion": "1",
  "layers": [
    {
      "id": "sst-24h",
      "name": "Sea Surface Temperature +24h",
      "kind": "imagery",
      "category": "weather",
      "wms": {
        "url": "https://myserver.edu/wms",
        "layers": "sst_24h",
        "parameters": { "format": "image/png", "transparent": true }
      }
    }
  ]
}
```

## API Stability

The plugin API (`src/plugin-api/types.ts`) is the only thing the core promises to keep stable. Everything else (internal module structure, store shape, router internals) can change freely.

### Stability tiers

| Tier | What | Promise |
|------|------|---------|
| **Stable** | `ExplorerAPI` methods: layers, commands, camera, baseMaps, viz, ui | Breaking changes only with major version bump. One prior major version supported. |
| **Semi-stable** | `api.unsafe.getCesiumViewer()` | May change with notice. For custom rendering that the stable API doesn't cover. |
| **Internal** | Everything in `src/` not exported through `plugin-api/` | No stability promise. Don't import directly from plugins. |

### Versioning

The API carries a version number. When a plugin loads, the core checks compatibility:
- Plugin requires v1, core is on v1: proceed.
- Plugin requires v1, core is on v2 (v1 still supported): proceed with compat shim.
- Plugin requires v1, core is on v3 (v1 dropped): show clear error.

### Testing stability

A small set of "reference plugins" live outside the core repo and run in CI. Every core PR runs them. If they break, the PR is blocked. Candidates for the first reference plugins: earthquake monitor, NASA GIBS imagery, a simple custom-layer example.

## Data Visualization Toolkit

The core provides shared infrastructure that multiple plugin types need. Plugins provide data, the core handles rendering.

### Gridded data (weather, model outputs)

Plugins implement `GriddedDataSource`: given a variable, bounds, and time, return a grid of values. The core renders it with:
- Colormaps (perceptually uniform, configurable, plugins can register custom ones)
- Legends (auto-generated from colormap and value range)
- Time slider (scrub through forecast hours, play animation)
- Comparison mode (side-by-side or overlay two sources)

This is what weather model plugins (StormCast, GFS, ECMWF, Open-Meteo) will use.

### Point data (earthquakes, stations, buoys)

Plugins implement `PointDataSource`: return an array of points with properties. The core renders them as billboard/point entities with data-driven size and color. Supports real-time polling.

### Track data (hurricanes, ships, flights, satellites)

Plugins implement `TrackDataSource`: return named tracks (sequences of timestamped points). The core renders polylines with optional time animation and trail effects.

### Colormaps

Shared colormap library. Default set covers common scientific needs (viridis, inferno, temperature diverging, precipitation sequential). Plugins can register additional colormaps for domain-specific visualization.

## Build Order

What to build and in what sequence, prioritized by how much downstream work each piece unblocks.

### Phase 1: Core Runtime (current)
- [x] 3D globe with terrain, buildings, atmosphere
- [x] Conversational command system with pattern matching + Claude
- [x] Layer system (GeoJSON vectors: borders, coastlines, rivers)
- [x] Base map switching (satellite, dark, light, road)
- [x] Plugin API contract (TypeScript interface defined)
- [ ] Plugin loader (load from URL, validate apiVersion)
- [ ] Data-only plugin loader (JSON manifest)

### Phase 2: Shared Visualization Toolkit
- [ ] Colormap system (built-in library, custom registration)
- [ ] Point renderer (data-driven size, color, labels)
- [ ] Track renderer (polylines, time animation, trail effects)
- [ ] Time slider component (shared across all time-aware plugins)
- [ ] Legend component (auto-generated from colormaps)
- [ ] Grid renderer (for gridded data overlays, GPU-efficient)

### Phase 3: First Plugins (prove the architecture)
- [ ] **Earthquake monitor** (USGS GeoJSON feed, real-time points, simple data model)
- [ ] **NASA GIBS satellite imagery** (hundreds of WMTS layers, zero auth)
- [ ] **Plugin template repo** (starter kit for external developers)

### Phase 4: Complex Plugins
- [ ] **Weather** (multiple providers, high-res grids, forecast time stepping, ensemble viz)
- [ ] **Hurricane tracker** (track data + cone of uncertainty + multiple prediction models)
- [ ] **Ship/flight tracks** (AIS/ADS-B data, real-time streaming)
- [ ] **Satellite visualization** (orbital mechanics, TLE propagation, coverage cones)

### Phase 5: Platform
- [ ] Plugin registry / marketplace
- [ ] Plugin browser UI in the app
- [ ] User preferences (favorite plugins, default layers)
- [ ] Plugin composition (multiple plugins active simultaneously)
