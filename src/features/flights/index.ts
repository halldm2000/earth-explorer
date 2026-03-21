/**
 * Live Flight Tracker App
 *
 * Displays real-time aircraft positions worldwide using the OpenSky Network
 * ADS-B API. Shows thousands of airborne aircraft as altitude-colored dots
 * on the globe, auto-refreshing every 5 seconds.
 *
 * Data processing (JSON parsing, diff computation, altitude coloring) runs
 * in a Web Worker to keep the Cesium render loop within 16 ms frame budget.
 *
 * Data source: OpenSky Network (https://opensky-network.org)
 *   - No API key required for anonymous access
 *   - Rate limit: ~10 requests per minute
 *   - Returns ~6,000–10,000 airborne aircraft at any time
 *   - CORS-enabled public API
 */

import * as Cesium from 'cesium'
import type { WorldscopeApp, AppContext, AppResources } from '@/apps/types'
import { showAppWelcome } from '@/apps/manager'
import type { CommandEntry } from '@/ai/types'
import type { AircraftData, FlightDiff, WorkerResponse } from './flight-worker'

// ── Constants ──

const OPENSKY_API = 'https://opensky-network.org/api/states/all'
const LAYER_ID = 'flight-tracker'
const REFRESH_INTERVAL = 5_000  // 5 seconds (OpenSky anonymous limit ~6s)

// ── Types ──

// Re-export AircraftData as Aircraft for public API compatibility
type Aircraft = AircraftData

// ── Altitude band label (kept on main thread for summary/query text) ──

function altitudeBand(altMeters: number): string {
  const altFt = altMeters * 3.28084
  if (altFt < 5000) return 'Low (<5k ft)'
  if (altFt < 15000) return 'Climbing (5–15k ft)'
  if (altFt < 30000) return 'Mid-cruise (15–30k ft)'
  if (altFt < 40000) return 'Cruise (30–40k ft)'
  return 'High (>40k ft)'
}

// ── Web Worker management ──

let _worker: Worker | null = null

function createWorker(): Worker {
  if (_worker) return _worker
  _worker = new Worker(new URL('./flight-worker.ts', import.meta.url), { type: 'module' })
  console.log('[flights] Web Worker created')
  return _worker
}

function terminateWorker(): void {
  if (_worker) {
    _worker.terminate()
    _worker = null
    console.log('[flights] Web Worker terminated')
  }
}

/**
 * Send raw state vectors to the worker and receive a processed diff.
 * Returns a promise that resolves with the FlightDiff.
 */
function processInWorker(states: any[][], knownIcaos: string[]): Promise<FlightDiff> {
  return new Promise((resolve, reject) => {
    const worker = createWorker()
    const handler = (e: MessageEvent<WorkerResponse>) => {
      worker.removeEventListener('message', handler)
      if (e.data.type === 'result') {
        resolve(e.data.diff)
      } else {
        reject(new Error(e.data.message))
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'process', states, knownIcaos })
  })
}

// ── State management ──

type Listener = () => void
const _listeners = new Set<Listener>()
let _aircraft: Aircraft[] = []
let _visible = false
let _loading = false
let _error: string | null = null
let _refreshTimer: ReturnType<typeof setInterval> | null = null
let _appCtx: AppContext | null = null
let _lastFetch = 0

function notify(): void { for (const fn of _listeners) fn() }
export function subscribe(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}
export function getAircraft(): Aircraft[] { return _aircraft }
export function isFlightsLoading(): boolean { return _loading }
export function getFlightsError(): string | null { return _error }
export function isFlightsVisible(): boolean { return _visible }

/**
 * Fetch raw data from OpenSky, send to worker for processing,
 * then apply the diff to Cesium entities on the main thread.
 */
async function fetchAndProcessFlights(viewer: Cesium.Viewer | null): Promise<Aircraft[]> {
  try {
    const resp = await fetch(OPENSKY_API, { signal: AbortSignal.timeout(12000) })
    if (!resp.ok) throw new Error(`OpenSky HTTP ${resp.status}`)
    const data = await resp.json()
    const states: any[][] = data.states || []

    // Send to worker for parsing, diffing, and color computation
    const knownIcaos = [..._entityMap.keys()]
    const diff = await processInWorker(states, knownIcaos)

    // Rebuild _aircraft from the diff (add + update = full current set)
    _aircraft = [...diff.add, ...diff.update]
    _lastFetch = diff.timestamp
    _error = null

    // Apply Cesium entity changes on main thread
    if (viewer) {
      applyDiff(viewer, diff)
    }

    return _aircraft
  } catch (err) {
    console.warn('[flights] Fetch/process failed:', err)
    _error = 'Failed to fetch flight data from OpenSky Network'
    return _aircraft
  }
}

// ── Airplane icon ──

let _airplaneImage: HTMLCanvasElement | null = null

function getAirplaneImage(): HTMLCanvasElement {
  if (_airplaneImage) return _airplaneImage
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')!
  const cx = size / 2

  c.fillStyle = '#ffffff'
  c.beginPath()
  // Nose
  c.moveTo(cx, 2)
  // Right fuselage → wing
  c.lineTo(cx + 2, 10)
  c.lineTo(cx + 13, 15)
  c.lineTo(cx + 13, 17)
  c.lineTo(cx + 2, 14)
  // Right fuselage → tail
  c.lineTo(cx + 2, 23)
  c.lineTo(cx + 7, 27)
  c.lineTo(cx + 7, 28.5)
  c.lineTo(cx, 26)
  // Left tail
  c.lineTo(cx - 7, 28.5)
  c.lineTo(cx - 7, 27)
  c.lineTo(cx - 2, 23)
  // Left fuselage → wing
  c.lineTo(cx - 2, 14)
  c.lineTo(cx - 13, 17)
  c.lineTo(cx - 13, 15)
  c.lineTo(cx - 2, 10)
  c.closePath()
  c.fill()

  _airplaneImage = canvas
  return canvas
}

// ── Cesium Rendering ──

let _dataSource: Cesium.CustomDataSource | null = null

function getOrCreateDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource {
  if (_dataSource) return _dataSource
  _dataSource = new Cesium.CustomDataSource('flight-tracker')
  viewer.dataSources.add(_dataSource)
  return _dataSource
}

// Map icao24 → entity for incremental updates (no flash on refresh)
const _entityMap = new Map<string, Cesium.Entity>()

/**
 * Apply a worker-computed diff to Cesium entities.
 * Only Cesium API calls happen here — all data crunching was in the worker.
 */
function applyDiff(viewer: Cesium.Viewer, diff: FlightDiff): void {
  const ds = getOrCreateDataSource(viewer)

  // Add new aircraft entities
  for (const ac of diff.add) {
    const pos = Cesium.Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude)
    const headingRad = Number.isFinite(ac.heading) ? -ac.heading * Math.PI / 180 : 0
    const color = new Cesium.Color(ac.color[0], ac.color[1], ac.color[2], ac.color[3])

    const entity = ds.entities.add({
      id: ac.icao24,
      position: pos,
      billboard: {
        image: getAirplaneImage(),
        scale: 0.55,
        rotation: headingRad,
        alignedAxis: Cesium.Cartesian3.ZERO,
        color,
        disableDepthTestDistance: 0,
      },
    })
    _entityMap.set(ac.icao24, entity)
  }

  // Update existing aircraft entities in place (no flash)
  for (const ac of diff.update) {
    const existing = _entityMap.get(ac.icao24)
    if (!existing) continue

    const pos = Cesium.Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude)
    const headingRad = Number.isFinite(ac.heading) ? -ac.heading * Math.PI / 180 : 0
    const color = new Cesium.Color(ac.color[0], ac.color[1], ac.color[2], ac.color[3])

    ;(existing as any).position = pos
    existing.billboard!.rotation = new Cesium.ConstantProperty(headingRad) as any
    existing.billboard!.color = new Cesium.ConstantProperty(color) as any
  }

  // Remove departed aircraft
  for (const icao of diff.remove) {
    const entity = _entityMap.get(icao)
    if (entity) {
      ds.entities.remove(entity)
      _entityMap.delete(icao)
    }
  }
}

// ── Auto-refresh loop ──

function startRefresh(viewer: Cesium.Viewer): void {
  stopRefresh()
  _refreshTimer = setInterval(async () => {
    if (!_visible) return
    await fetchAndProcessFlights(viewer)
    if (_visible) {
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

function formatFlight(ac: Aircraft, index?: number): string {
  const prefix = index != null ? `${index + 1}. ` : ''
  const cs = ac.callsign || ac.icao24
  const altFt = Math.round(ac.altitude * 3.28084)
  const speedKts = Math.round(ac.velocity * 1.944)
  const latDir = ac.lat >= 0 ? 'N' : 'S'
  const lonDir = ac.lon >= 0 ? 'E' : 'W'
  const vr = ac.verticalRate > 1 ? ' ↑' : ac.verticalRate < -1 ? ' ↓' : ''
  return `${prefix}**${cs}** — ${ac.country}\n` +
    `  FL${Math.round(altFt / 100).toString().padStart(3, '0')}${vr} | ${speedKts} kt | ` +
    `Hdg ${Math.round(ac.heading)}° | ` +
    `${Math.abs(ac.lat).toFixed(2)}°${latDir}, ${Math.abs(ac.lon).toFixed(2)}°${lonDir}`
}

// ── Commands ──

function makeCommands(ctx: AppContext): CommandEntry[] {
  const showCmd: CommandEntry = {
    id: 'flights:show',
    name: 'Show flights',
    module: 'flights',
    category: 'feature',
    description: 'Show real-time aircraft positions worldwide. Displays thousands of airborne aircraft colored by altitude.',
    patterns: [
      'show flights', 'show aircraft', 'flights on', 'flight tracker',
      'show planes', 'show airplanes', 'air traffic',
      'flight radar', 'plane tracker', 'show aviation',
    ],
    params: [],
    handler: async () => {
      showAppWelcome('flights')
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      _visible = true
      _loading = true
      notify()

      // Create worker on show
      createWorker()

      await fetchAndProcessFlights(viewer)
      _loading = false
      notify()

      if (_aircraft.length === 0) {
        return _error || 'No flight data available. The OpenSky Network API may be temporarily unavailable.'
      }

      startRefresh(viewer)

      // Count by altitude band
      const bands = new Map<string, number>()
      for (const ac of _aircraft) {
        const band = altitudeBand(ac.altitude)
        bands.set(band, (bands.get(band) || 0) + 1)
      }

      // Count by country (top 5)
      const countries = new Map<string, number>()
      for (const ac of _aircraft) {
        countries.set(ac.country, (countries.get(ac.country) || 0) + 1)
      }
      const topCountries = [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

      let text = `**${_aircraft.length} aircraft** airborne worldwide (auto-refreshing every 5s)\n\n`
      text += `**By altitude:** ${[...bands.entries()].map(([b, n]) => `${b}: ${n}`).join(' | ')}\n`
      text += `**Top origins:** ${topCountries.map(([c, n]) => `${c} (${n})`).join(', ')}`
      return text
    },
  }

  const hideCmd: CommandEntry = {
    id: 'flights:hide',
    name: 'Hide flights',
    module: 'flights',
    category: 'feature',
    description: 'Hide the flight tracker layer',
    patterns: ['hide flights', 'flights off', 'hide aircraft', 'hide planes'],
    params: [],
    handler: () => {
      _visible = false
      stopRefresh()
      terminateWorker()  // Terminate worker on hide
      _dataSource?.entities.removeAll()
      _entityMap.clear()
      notify()
      return 'Flight tracker hidden'
    },
  }

  const queryCmd: CommandEntry = {
    id: 'flights:query',
    name: 'Query flights',
    module: 'flights',
    category: 'feature',
    description: 'Search flights by callsign, country, or altitude. Requires the flight tracker to be active.',
    patterns: [
      'query flights', 'list flights', 'search flights',
      'find flight', 'flight info', 'how many flights',
      'flights from', 'flights near',
    ],
    params: [
      { name: 'callsign', type: 'string', required: false, description: 'Filter by callsign (e.g. "UAL", "BAW")' },
      { name: 'country', type: 'string', required: false, description: 'Filter by origin country' },
      { name: 'minAlt', type: 'number', required: false, description: 'Minimum altitude in feet' },
      { name: 'maxAlt', type: 'number', required: false, description: 'Maximum altitude in feet' },
      { name: 'sort', type: 'string', required: false, description: 'Sort by: altitude, speed, callsign' },
      { name: 'limit', type: 'number', required: false, description: 'Max results (default 10)' },
    ],
    handler: async (params) => {
      if (_aircraft.length === 0) {
        const viewer = ctx.getViewer()
        await fetchAndProcessFlights(viewer ?? null)
        if (_aircraft.length === 0) return 'No flight data available.'
      }

      let results = [..._aircraft]

      if (params.callsign) {
        const q = String(params.callsign).toUpperCase()
        results = results.filter(ac => ac.callsign.toUpperCase().includes(q))
      }
      if (params.country) {
        const q = String(params.country).toLowerCase()
        results = results.filter(ac => ac.country.toLowerCase().includes(q))
      }
      if (params.minAlt != null) {
        const minM = Number(params.minAlt) / 3.28084
        results = results.filter(ac => ac.altitude >= minM)
      }
      if (params.maxAlt != null) {
        const maxM = Number(params.maxAlt) / 3.28084
        results = results.filter(ac => ac.altitude <= maxM)
      }

      const sort = String(params.sort || 'altitude')
      switch (sort) {
        case 'altitude': case 'alt':
          results.sort((a, b) => b.altitude - a.altitude); break
        case 'speed':
          results.sort((a, b) => b.velocity - a.velocity); break
        case 'callsign':
          results.sort((a, b) => a.callsign.localeCompare(b.callsign)); break
      }

      const limit = Number(params.limit ?? 10)
      const shown = results.slice(0, limit)

      if (shown.length === 0) return 'No flights match the given filters.'

      const header = `**${results.length} flight${results.length !== 1 ? 's' : ''}** found (showing ${shown.length}):\n`
      return header + shown.map((ac, i) => formatFlight(ac, i)).join('\n')
    },
  }

  const summaryCmd: CommandEntry = {
    id: 'flights:summary',
    name: 'Flight summary',
    module: 'flights',
    category: 'feature',
    description: 'Statistical summary of global air traffic — aircraft count, altitude distribution, top countries, average speed.',
    patterns: [
      'flight summary', 'air traffic summary', 'flight stats',
      'aviation summary', 'how many planes',
    ],
    params: [],
    handler: async () => {
      if (_aircraft.length === 0) {
        const viewer = ctx.getViewer()
        await fetchAndProcessFlights(viewer ?? null)
        if (_aircraft.length === 0) return 'No flight data available.'
      }

      const total = _aircraft.length
      const alts = _aircraft.map(ac => ac.altitude * 3.28084)
      const speeds = _aircraft.filter(ac => ac.velocity > 0).map(ac => ac.velocity * 1.944)
      const maxAlt = Math.max(...alts)
      const avgAlt = alts.reduce((a, b) => a + b, 0) / alts.length
      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0

      const countries = new Map<string, number>()
      for (const ac of _aircraft) countries.set(ac.country, (countries.get(ac.country) || 0) + 1)
      const topCountries = [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

      const climbing = _aircraft.filter(ac => ac.verticalRate > 1).length
      const descending = _aircraft.filter(ac => ac.verticalRate < -1).length
      const cruise = total - climbing - descending

      let text = `**Global Air Traffic Summary**\n\n`
      text += `Total airborne: **${total}** aircraft\n`
      text += `Altitude: avg ${Math.round(avgAlt).toLocaleString()} ft, max ${Math.round(maxAlt).toLocaleString()} ft\n`
      text += `Speed: avg ${Math.round(avgSpeed)} kt\n`
      text += `Phase: ${cruise} cruising, ${climbing} climbing, ${descending} descending\n\n`
      text += `**Top 10 countries:**\n`
      for (const [country, count] of topCountries) {
        text += `- ${country}: ${count} aircraft\n`
      }
      return text
    },
  }

  return [showCmd, hideCmd, queryCmd, summaryCmd]
}

// ── App definition ──

export const flightsApp: WorldscopeApp = {
  id: 'flights',
  name: 'Flight Tracker',
  description: 'Real-time worldwide aircraft tracking via OpenSky Network ADS-B data',
  autoActivate: true,

  activate: (ctx: AppContext): AppResources => {
    _appCtx = ctx
    return {
      commands: makeCommands(ctx),
      layers: [{
        id: LAYER_ID,
        name: 'Live Flights (Global)',
        kind: 'geojson',
        category: 'transport',
        description: 'Real-time aircraft positions worldwide via OpenSky Network ADS-B',
        defaultOn: false,
        url: 'https://opensky-network.org/',
      }],
      welcome: 'Flight Tracker loaded. Say "show flights" to display real-time aircraft positions worldwide. Thousands of airborne aircraft colored by altitude, auto-refreshing every 5 seconds.',
      toolbar: {
        icon: '✈',
        label: 'Flights',
        isVisible: () => isFlightsVisible(),
      },
    }
  },

  deactivate: () => {
    stopRefresh()
    terminateWorker()
    _dataSource?.entities.removeAll()
    _entityMap.clear()
    _aircraft = []
    _dataSource = null
    _visible = false
    _error = null
    _appCtx = null
    console.log('[flights] Deactivated')
  },
}
