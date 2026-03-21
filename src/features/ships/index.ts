/**
 * Live Ship Tracker App
 *
 * Displays real-time vessel positions from two sources:
 *   1. AIS Bridge (preferred) — Vite plugin connects to AISStream.io
 *      server-side via WebSocket, serves data via HTTP. Global coverage.
 *   2. Digitraffic (fallback) — Finnish Transport Agency REST API.
 *      Baltic/Nordic coverage, no API key needed.
 *
 * The bridge is tried first on each poll. If it has no data (plugin
 * not running or AISStream unreachable), falls back to Digitraffic.
 */

import * as Cesium from 'cesium'
import type { WorldscopeApp, AppContext, AppResources } from '@/apps/types'
import { showAppWelcome } from '@/apps/manager'
import type { CommandEntry } from '@/ai/types'

// ── Constants ──

const AIS_BRIDGE_API = '/__ais/locations'
const AIS_BRIDGE_STATUS = '/__ais/status'
const DIGITRAFFIC_API = 'https://meri.digitraffic.fi/api/ais/v1/locations'
const DIGITRAFFIC_VESSELS = 'https://meri.digitraffic.fi/api/ais/v1/vessels'
const LAYER_ID = 'ship-tracker'
const REFRESH_INTERVAL = 10_000  // 10 seconds

// ── Types ──

interface Ship {
  mmsi: number
  name: string
  lat: number
  lon: number
  sog: number      // speed over ground, knots (AIS: 1/10 knot)
  cog: number      // course over ground, degrees (AIS: 1/10 degree)
  heading: number  // true heading, degrees (511 = not available)
  navStatus: number
  shipType: number
  lastUpdate: number
}

// ── Speed-based coloring ──
// Anchored (gray) → Slow (green) → Medium (cyan) → Fast (yellow) → Very fast (orange)

function speedColor(sogKnots: number): Cesium.Color {
  if (sogKnots < 0.5) return new Cesium.Color(0.5, 0.55, 0.7, 0.6)   // dim blue-gray — anchored
  if (sogKnots < 5)   return new Cesium.Color(0.2, 0.9, 0.3, 0.85)   // green — slow
  if (sogKnots < 12)  return new Cesium.Color(0.3, 0.8, 1.0, 0.85)   // cyan — medium
  if (sogKnots < 20)  return new Cesium.Color(0.9, 0.85, 0.2, 0.85)  // yellow — fast
  return new Cesium.Color(1.0, 0.5, 0.2, 0.85)                        // orange — very fast
}

function speedBand(sogKnots: number): string {
  if (sogKnots < 0.5) return 'Anchored (<0.5 kt)'
  if (sogKnots < 5)   return 'Slow (0.5–5 kt)'
  if (sogKnots < 12)  return 'Medium (5–12 kt)'
  if (sogKnots < 20)  return 'Fast (12–20 kt)'
  return 'Very fast (>20 kt)'
}

// ── State management ──

type Listener = () => void
const _listeners = new Set<Listener>()
const _ships = new Map<number, Ship>()  // MMSI → Ship
const _vesselNames = new Map<number, string>()  // MMSI → name (from metadata API)
let _visible = false
let _loading = false
let _error: string | null = null
let _refreshTimer: ReturnType<typeof setInterval> | null = null
let _appCtx: AppContext | null = null

function notify(): void { for (const fn of _listeners) fn() }

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}
export function getShips(): Ship[] { return [..._ships.values()] }
export function isShipsLoading(): boolean { return _loading }
export function getShipsError(): string | null { return _error }
export function isShipsVisible(): boolean { return _visible }
export function getShipsSource(): 'bridge' | 'digitraffic' | null { return _source }

// ── Ship icon ──

let _shipImage: HTMLCanvasElement | null = null

function getShipImage(): HTMLCanvasElement {
  if (_shipImage) return _shipImage
  const size = 28
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')!
  const cx = size / 2

  c.fillStyle = '#ffffff'
  c.beginPath()
  // Bow (pointed top)
  c.moveTo(cx, 2)
  // Right hull
  c.lineTo(cx + 5, 10)
  c.lineTo(cx + 5, 22)
  // Stern (flat bottom)
  c.lineTo(cx + 4, 26)
  c.lineTo(cx - 4, 26)
  // Left hull
  c.lineTo(cx - 5, 22)
  c.lineTo(cx - 5, 10)
  c.closePath()
  c.fill()

  _shipImage = canvas
  return canvas
}

// ── Data fetching ──

let _source: 'bridge' | 'digitraffic' | null = null

/**
 * Try AIS Bridge first (global AISStream data via Vite plugin).
 * If bridge has no data, fall back to Digitraffic (Baltic/Nordic).
 */
async function fetchShips(): Promise<void> {
  // Try AIS Bridge (global)
  if (await fetchFromBridge()) return
  // Fall back to Digitraffic (regional)
  await fetchFromDigitraffic()
}

async function fetchFromBridge(): Promise<boolean> {
  try {
    // Check bridge status first
    const statusResp = await fetch(AIS_BRIDGE_STATUS, { signal: AbortSignal.timeout(3000) })
    if (statusResp.ok) {
      const status = await statusResp.json()
      if (!status.connected && _source !== 'bridge') {
        console.log(`[ships] AIS Bridge: connected=${status.connected}, error=${status.error || 'none'}, vessels=${status.vesselCount}`)
      }
    }

    const resp = await fetch(AIS_BRIDGE_API, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return false
    const data = await resp.json()
    const vessels: any[] = data.vessels || []
    if (vessels.length === 0) return false

    for (const v of vessels) {
      const mmsi = v.mmsi as number
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue
      if (v.lat === 0 && v.lon === 0) continue

      _ships.set(mmsi, {
        mmsi,
        name: String(v.name || '').trim(),
        lat: v.lat,
        lon: v.lon,
        sog: v.sog ?? 0,
        cog: v.cog ?? 0,
        heading: Number.isFinite(v.heading) ? v.heading : 0,
        navStatus: v.navStatus ?? 15,
        shipType: 0,
        lastUpdate: Date.now(),
      })
    }

    if (_source !== 'bridge') {
      _source = 'bridge'
      console.log(`[ships] Using AIS Bridge (global) — ${_ships.size} vessels`)
    }
    _error = null
    return true
  } catch {
    return false
  }
}

async function fetchFromDigitraffic(): Promise<void> {
  try {
    const resp = await fetch(DIGITRAFFIC_API, { signal: AbortSignal.timeout(12000) })
    if (!resp.ok) throw new Error(`Digitraffic HTTP ${resp.status}`)
    const data = await resp.json()
    const features: any[] = data.features || []

    for (const f of features) {

      const mmsi = f.mmsi as number
      const props = f.properties || {}
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue

      const lon = coords[0] as number
      const lat = coords[1] as number
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

      // Digitraffic SOG is in 1/10 knot, COG in 1/10 degree
      const sogRaw = (props.sog as number) ?? 0
      const cogRaw = (props.cog as number) ?? 0
      const sog = sogRaw / 10
      const cog = cogRaw / 10
      const headingRaw = (props.heading as number) ?? 511
      const heading = headingRaw === 511 ? cog : headingRaw

      _ships.set(mmsi, {
        mmsi,
        name: _vesselNames.get(mmsi) || '',
        lat,
        lon,
        sog,
        cog,
        heading: Number.isFinite(heading) ? heading : 0,
        navStatus: (props.navStat as number) ?? 15,
        shipType: (props.shipType as number) ?? 0,
        lastUpdate: Date.now(),
      })
    }

    if (_source !== 'digitraffic') {
      _source = 'digitraffic'
      console.log(`[ships] Using Digitraffic (Baltic/Nordic) — ${_ships.size} vessels`)
    }
    _error = null
  } catch (err) {
    console.warn('[ships] Fetch failed:', err)
    _error = 'Failed to fetch vessel data'
  }
}

/**
 * Fetch vessel metadata (names) from Digitraffic — only needed when
 * using Digitraffic source (bridge data already includes names).
 */
async function fetchVesselNames(): Promise<void> {
  if (_source === 'bridge') return // bridge data has names
  try {
    const resp = await fetch(DIGITRAFFIC_VESSELS, { signal: AbortSignal.timeout(20000) })
    if (!resp.ok) return
    const data = await resp.json()
    const vessels: any[] = Array.isArray(data) ? data : []
    for (const v of vessels) {
      if (v.mmsi && v.name) {
        _vesselNames.set(v.mmsi, String(v.name).trim())
      }
    }
    for (const [mmsi, ship] of _ships) {
      const name = _vesselNames.get(mmsi)
      if (name && !ship.name) ship.name = name
    }
    console.log(`[ships] ${_vesselNames.size} vessel names loaded`)
  } catch (err) {
    console.warn('[ships] Vessel names fetch failed:', err)
  }
}

// ── Cesium Rendering ──

let _dataSource: Cesium.CustomDataSource | null = null
const _entityMap = new Map<number, Cesium.Entity>()  // MMSI → entity

function getOrCreateDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource {
  if (_dataSource) return _dataSource
  _dataSource = new Cesium.CustomDataSource('ship-tracker')
  viewer.dataSources.add(_dataSource)
  return _dataSource
}

function renderShips(viewer: Cesium.Viewer): void {
  const ds = getOrCreateDataSource(viewer)
  const seen = new Set<number>()

  for (const [mmsi, ship] of _ships) {
    seen.add(mmsi)
    const color = speedColor(ship.sog)
    const headingRad = -ship.heading * Math.PI / 180
    const pos = Cesium.Cartesian3.fromDegrees(ship.lon, ship.lat, 0)

    const existing = _entityMap.get(mmsi)
    if (existing) {
      ;(existing as any).position = pos
      existing.billboard!.rotation = new Cesium.ConstantProperty(headingRad) as any
      existing.billboard!.color = new Cesium.ConstantProperty(color) as any
    } else {
      const entity = ds.entities.add({
        id: String(mmsi),
        position: pos,
        billboard: {
          image: getShipImage(),
          scale: 0.5,
          rotation: headingRad,
          alignedAxis: Cesium.Cartesian3.ZERO,
          color,
          disableDepthTestDistance: 0,
        },
      })
      _entityMap.set(mmsi, entity)
    }
  }

  // Remove ships no longer in data
  for (const [mmsi, entity] of _entityMap) {
    if (!seen.has(mmsi)) {
      ds.entities.remove(entity)
      _entityMap.delete(mmsi)
    }
  }
}

// ── Auto-refresh loop ──

function startRefresh(viewer: Cesium.Viewer): void {
  stopRefresh()
  _refreshTimer = setInterval(async () => {
    if (!_visible) return
    await fetchShips()
    if (_visible) {
      renderShips(viewer)
      notify()
    }
  }, REFRESH_INTERVAL)
}

function stopRefresh(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer)
    _refreshTimer = null
  }
}

// ── Formatting ──

function formatShip(ship: Ship, index?: number): string {
  const prefix = index != null ? `${index + 1}. ` : ''
  const name = ship.name || `MMSI ${ship.mmsi}`
  const latDir = ship.lat >= 0 ? 'N' : 'S'
  const lonDir = ship.lon >= 0 ? 'E' : 'W'
  return `${prefix}**${name}**\n` +
    `  ${ship.sog.toFixed(1)} kt | Hdg ${Math.round(ship.heading)}° | ` +
    `${Math.abs(ship.lat).toFixed(2)}°${latDir}, ${Math.abs(ship.lon).toFixed(2)}°${lonDir}`
}

// ── Commands ──

function makeCommands(ctx: AppContext): CommandEntry[] {
  const showCmd: CommandEntry = {
    id: 'ships:show',
    name: 'Show ships',
    module: 'ships',
    category: 'feature',
    description: 'Show real-time vessel positions worldwide via AIS. Ships colored by speed. Global coverage when AISStream bridge is active, Baltic/Nordic via Digitraffic fallback.',
    patterns: [
      'show ships', 'show vessels', 'ships on', 'ship tracker',
      'show boats', 'marine traffic', 'vessel tracker',
      'show maritime', 'ais tracker',
    ],
    params: [],
    handler: async () => {
      if (_visible) return 'Ship tracker is already active with ' + _ships.size + ' vessels tracked.'

      showAppWelcome('ships')
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      _visible = true
      notify()

      // Render immediately if ships already loaded (AIS bridge streams in background)
      if (_ships.size > 0) {
        renderShips(viewer)
      } else {
        // No ships yet — fetch and wait
        _loading = true
        notify()
        await fetchShips()
        _loading = false
        notify()

        if (_ships.size === 0) {
          return _error || 'No vessel data available.'
        }
        renderShips(viewer)
      }

      startRefresh(viewer)

      // Fetch vessel names in background (only needed for Digitraffic)
      fetchVesselNames()

      // Count by speed band
      const bands = new Map<string, number>()
      for (const ship of _ships.values()) {
        const band = speedBand(ship.sog)
        bands.set(band, (bands.get(band) || 0) + 1)
      }

      const coverage = _source === 'bridge' ? 'worldwide (AISStream)' : 'Baltic/Nordic (Digitraffic)'
      let text = `**${_ships.size} vessels** tracked ${coverage} (auto-refreshing every 10s)\n\n`
      text += `**By speed:** ${[...bands.entries()].map(([b, n]) => `${b}: ${n}`).join(' | ')}`
      return text
    },
  }

  const hideCmd: CommandEntry = {
    id: 'ships:hide',
    name: 'Hide ships',
    module: 'ships',
    category: 'feature',
    description: 'Hide the ship tracker layer',
    patterns: ['hide ships', 'ships off', 'hide vessels', 'hide boats'],
    params: [],
    handler: () => {
      _visible = false
      _source = null
      stopRefresh()
      _dataSource?.entities.removeAll()
      _entityMap.clear()
      _ships.clear()
      notify()
      return 'Ship tracker hidden'
    },
  }

  const queryCmd: CommandEntry = {
    id: 'ships:query',
    name: 'Query ships',
    module: 'ships',
    category: 'feature',
    description: 'Search tracked vessels by name, MMSI, or speed. Requires the ship tracker to be active.',
    patterns: [
      'query ships', 'list ships', 'search ships',
      'find ship', 'ship info', 'how many ships',
      'find vessel', 'vessel info',
    ],
    params: [
      { name: 'name', type: 'string', required: false, description: 'Filter by vessel name' },
      { name: 'mmsi', type: 'string', required: false, description: 'Filter by MMSI' },
      { name: 'minSpeed', type: 'number', required: false, description: 'Minimum speed in knots' },
      { name: 'maxSpeed', type: 'number', required: false, description: 'Maximum speed in knots' },
      { name: 'sort', type: 'string', required: false, description: 'Sort by: speed, name' },
      { name: 'limit', type: 'number', required: false, description: 'Max results (default 10)' },
    ],
    handler: async (params) => {
      if (_ships.size === 0) return 'No ship data available. Make sure the ship tracker is active.'

      let results = [..._ships.values()]

      if (params.name) {
        const q = String(params.name).toUpperCase()
        results = results.filter(s => s.name.toUpperCase().includes(q))
      }
      if (params.mmsi) {
        const q = String(params.mmsi)
        results = results.filter(s => String(s.mmsi).includes(q))
      }
      if (params.minSpeed != null) {
        results = results.filter(s => s.sog >= Number(params.minSpeed))
      }
      if (params.maxSpeed != null) {
        results = results.filter(s => s.sog <= Number(params.maxSpeed))
      }

      const sort = String(params.sort || 'speed')
      switch (sort) {
        case 'speed': results.sort((a, b) => b.sog - a.sog); break
        case 'name': results.sort((a, b) => a.name.localeCompare(b.name)); break
      }

      const limit = Number(params.limit ?? 10)
      const shown = results.slice(0, limit)

      if (shown.length === 0) return 'No vessels match the given filters.'

      const header = `**${results.length} vessel${results.length !== 1 ? 's' : ''}** found (showing ${shown.length}):\n`
      return header + shown.map((s, i) => formatShip(s, i)).join('\n')
    },
  }

  const summaryCmd: CommandEntry = {
    id: 'ships:summary',
    name: 'Ship summary',
    module: 'ships',
    category: 'feature',
    description: 'Statistical summary of tracked vessels — count, speed distribution.',
    patterns: [
      'ship summary', 'vessel summary', 'maritime summary',
      'how many ships', 'ship stats',
    ],
    params: [],
    handler: async () => {
      if (_ships.size === 0) return 'No ship data available. Make sure the ship tracker is active.'

      const all = [..._ships.values()]
      const total = all.length
      const speeds = all.map(s => s.sog)
      const maxSpeed = Math.max(...speeds)
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length
      const moving = all.filter(s => s.sog >= 0.5).length

      const bands = new Map<string, number>()
      for (const s of all) {
        const band = speedBand(s.sog)
        bands.set(band, (bands.get(band) || 0) + 1)
      }

      const coverage = _source === 'bridge' ? '(Global)' : '(Baltic/Nordic)'
      let text = `**Maritime Traffic Summary** ${coverage}\n\n`
      text += `Vessels tracked: **${total}**\n`
      text += `Moving: ${moving} | Stationary: ${total - moving}\n`
      text += `Speed: avg ${avgSpeed.toFixed(1)} kt, max ${maxSpeed.toFixed(1)} kt\n\n`
      text += `**By speed:**\n`
      for (const [band, count] of bands) {
        text += `- ${band}: ${count}\n`
      }
      return text
    },
  }

  return [showCmd, hideCmd, queryCmd, summaryCmd]
}

// ── App definition ──

export const shipsApp: WorldscopeApp = {
  id: 'ships',
  name: 'Ship Tracker',
  description: 'Real-time vessel tracking via AIS data (global via AISStream bridge, Baltic/Nordic fallback via Digitraffic)',
  autoActivate: true,

  activate: (ctx: AppContext): AppResources => {
    _appCtx = ctx
    return {
      commands: makeCommands(ctx),
      layers: [{
        id: LAYER_ID,
        name: 'Live Ships (Global)',
        kind: 'geojson',
        category: 'transport',
        description: 'Real-time vessel positions via Digitraffic AIS (Baltic/Nordic)',
        defaultOn: false,
        url: 'https://www.digitraffic.fi/en/marine-traffic/',
      }],
      welcome: 'Ship Tracker loaded. Say "show ships" to display real-time vessel positions. Global coverage with AISStream API key, Baltic/Nordic without.',
      toolbar: {
        icon: '🚢',
        label: 'Ships',
        isVisible: () => isShipsVisible(),
      },
    }
  },

  deactivate: () => {
    stopRefresh()
    _dataSource?.entities.removeAll()
    _entityMap.clear()
    _ships.clear()
    _vesselNames.clear()
    _dataSource = null
    _visible = false
    _source = null
    _error = null
    _appCtx = null
    console.log('[ships] Deactivated')
  },
}
