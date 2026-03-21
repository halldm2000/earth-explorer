/**
 * Earthquake Tracker App
 *
 * Displays recent M2.5+ earthquakes from the USGS real-time feed as a
 * GeoJSON layer on the globe. Click any quake to select it and see details.
 * Only the selected quake animates (pulse + ripple halos).
 */

import * as Cesium from 'cesium'
import type { WorldscopeApp, AppContext, AppResources } from '@/apps/types'
import { showAppWelcome } from '@/apps/manager'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'

const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const LAYER_ID = 'earthquake-usgs-2.5'

// ── Cached feed data ──

export interface QuakeFeature {
  properties: {
    mag: number
    place: string
    time: number
    updated: number
    felt: number | null
    cdi: number | null      // community decimal intensity
    mmi: number | null      // modified mercalli intensity
    alert: string | null    // green, yellow, orange, red
    status: string          // automatic, reviewed
    tsunami: number         // 0 or 1
    sig: number             // significance 0-1000
    net: string             // contributing network
    magType: string         // ml, md, mb, mww, etc.
    type: string            // earthquake, quarry blast, etc.
    title: string
    url: string
  }
  geometry: { coordinates: [number, number, number] } // [lon, lat, depth_km]
}

let _cachedFeatures: QuakeFeature[] = []
let _cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute

async function fetchQuakes(): Promise<QuakeFeature[]> {
  if (_cachedFeatures.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedFeatures
  }
  const resp = await fetch(USGS_FEED)
  const data = await resp.json()
  _cachedFeatures = data.features || []
  _cacheTime = Date.now()
  return _cachedFeatures
}

function formatQuake(q: QuakeFeature, index?: number): string {
  const p = q.properties
  const [lon, lat, depth] = q.geometry.coordinates
  const prefix = index != null ? `${index + 1}. ` : ''
  const tsunami = p.tsunami ? ' [TSUNAMI]' : ''
  const alert = p.alert ? ` [${p.alert.toUpperCase()} ALERT]` : ''
  const felt = p.felt ? ` (${p.felt} felt reports)` : ''
  const time = new Date(p.time).toLocaleString()
  return `${prefix}**M${p.mag.toFixed(1)}** — ${p.place}${tsunami}${alert}\n` +
    `  ${time} | Depth: ${depth.toFixed(1)} km | ${lat.toFixed(3)}, ${lon.toFixed(3)}${felt}`
}

/** Haversine distance in km */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Color earthquakes by magnitude: yellow (2.5) → orange (5) → red (7+) */
function magColor(mag: number): Cesium.Color {
  const t = Math.min(Math.max((mag - 2.5) / 5, 0), 1) // 0–1 over M2.5–M7.5
  const r = 1.0
  const g = 1.0 - t * 0.8  // yellow → red
  const b = 0.1 - t * 0.1
  return new Cesium.Color(r, g, b, 0.85)
}

/** Size circles by magnitude: M2.5 = 10px, M5 = 24px, M7+ = 50px */
function magSize(mag: number): number {
  return Math.max(10, Math.pow(2, mag - 0.5))
}

/** Minimum magnitude to show labels (default 4.0) */
let labelThreshold = 4.0

// ── Selection state (click-to-select) ──

let _visible = false
let _selectionDs: Cesium.CustomDataSource | null = null
const _listeners = new Set<() => void>()

function notify(): void { _listeners.forEach(fn => fn()) }

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

export function getSelectedQuake(): QuakeFeature | null {
  if (!_matchedQuake || !_visible) return null
  return _matchedQuake
}

export function isEarthquakeVisible(): boolean { return _visible }

// The currently matched quake (set during click handler)
let _matchedQuake: QuakeFeature | null = null

function selectQuake(quake: QuakeFeature | null, viewer: Cesium.Viewer): void {
  _matchedQuake = quake
  renderSelection(viewer)
  notify()
}

function renderSelection(viewer: Cesium.Viewer): void {
  // Remove old selection overlay
  if (_selectionDs) {
    _selectionDs.entities.removeAll()
  } else {
    _selectionDs = new Cesium.CustomDataSource('earthquake-selection')
    viewer.dataSources.add(_selectionDs)
  }

  const quake = _matchedQuake
  if (!quake) return

  const [lon, lat] = quake.geometry.coordinates
  const mag = quake.properties.mag
  const color = magColor(mag)
  const baseSize = magSize(mag)
  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0)
  const t0 = Date.now()

  // Glow halo behind the selected dot (gentle breathing, slightly out of phase)
  _selectionDs.entities.add({
    position: pos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 1.5)
        return (baseSize + 16) + 6 * s
      }, false) as any,
      color: color.withAlpha(0.18),
      outlineWidth: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  // Pulsing selected dot (white core with colored outline)
  _selectionDs.entities.add({
    position: pos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 2.5)
        return baseSize * (1 + 0.2 * s)
      }, false) as any,
      color: Cesium.Color.WHITE,
      outlineColor: color,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  // Selected label
  _selectionDs.entities.add({
    position: pos,
    label: {
      text: `M${mag.toFixed(1)} — ${quake.properties.place}`,
      font: 'bold 14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -baseSize - 10),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    },
  })
}

let _clickHandler: Cesium.ScreenSpaceEventHandler | null = null
let _selectionListener: Cesium.Event.RemoveCallback | null = null

function tryMatchEntity(entity: Cesium.Entity, viewer: Cesium.Viewer, source: string): boolean {
  const props = entity.properties
  if (!props) {
    console.log(`[earthquake:click] ${source}: entity has no properties`)
    return false
  }

  // Try to read mag property
  let mag: number | undefined
  try {
    mag = props.mag?.getValue?.(Cesium.JulianDate.now())
  } catch {
    try { mag = props.mag?.getValue?.() } catch { /* */ }
  }

  if (mag == null) {
    // List available property names for debugging
    const names = props.propertyNames || []
    console.log(`[earthquake:click] ${source}: no 'mag' property. Available:`, [...names])
    return false
  }

  console.log(`[earthquake:click] ${source}: found mag=${mag}`)

  let place: string | undefined
  let time: number | undefined
  try {
    place = props.place?.getValue?.(Cesium.JulianDate.now()) as string
    time = props.time?.getValue?.(Cesium.JulianDate.now()) as number
  } catch {
    try {
      place = props.place?.getValue?.() as string
      time = props.time?.getValue?.() as number
    } catch { /* */ }
  }

  const match = _cachedFeatures.find(q =>
    q.properties.mag === mag &&
    q.properties.place === place &&
    q.properties.time === time
  )

  if (match) {
    console.log(`[earthquake:click] ${source}: matched quake — M${mag} ${place}`)
    // Clear Cesium's default selection UI (green highlight box)
    viewer.selectedEntity = undefined
    selectQuake(match, viewer)
    return true
  } else {
    console.log(`[earthquake:click] ${source}: mag=${mag} place="${place}" time=${time} — no match in ${_cachedFeatures.length} cached features`)
    return false
  }
}

function setupClickHandler(viewer: Cesium.Viewer): void {
  // ── Raw ScreenSpaceEventHandler (picks on left click) ──
  if (!_clickHandler) {
    _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    _clickHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      console.log(`[earthquake:click] LEFT_CLICK at screen (${click.position.x}, ${click.position.y})`)

      // Try scene.pick
      const picked = viewer.scene.pick(click.position)
      console.log('[earthquake:click] scene.pick result:', picked)

      if (picked?.id && picked.id instanceof Cesium.Entity) {
        console.log(`[earthquake:click] Picked entity id="${picked.id.id}", name="${picked.id.name}"`)
        tryMatchEntity(picked.id, viewer, 'ScreenSpaceEventHandler')
      } else if (picked?.id) {
        console.log('[earthquake:click] Picked id is not an Entity:', typeof picked.id, picked.id)
      } else {
        console.log('[earthquake:click] No entity picked — checking drill pick...')
        const drillResults = viewer.scene.drillPick(click.position, 5)
        console.log(`[earthquake:click] drillPick returned ${drillResults.length} result(s)`)
        for (let i = 0; i < drillResults.length; i++) {
          const dr = drillResults[i]
          console.log(`[earthquake:click] drillPick[${i}]:`, dr?.id?.id ?? dr?.id ?? dr)
          if (dr?.id && dr.id instanceof Cesium.Entity) {
            if (tryMatchEntity(dr.id, viewer, `drillPick[${i}]`)) break
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    console.log('[earthquake] ScreenSpaceEventHandler installed')
  }

  // ── Cesium selectedEntityChanged (backup) ──
  if (!_selectionListener) {
    _selectionListener = viewer.selectedEntityChanged.addEventListener((entity: Cesium.Entity | undefined) => {
      console.log('[earthquake:click] selectedEntityChanged:', entity?.id ?? '(none)')
      if (!entity) return
      tryMatchEntity(entity, viewer, 'selectedEntityChanged')
    })
    console.log('[earthquake] selectedEntityChanged listener installed')
  }
}

function cleanupClickHandler(): void {
  if (_clickHandler) {
    _clickHandler.destroy()
    _clickHandler = null
  }
  if (_selectionListener) {
    _selectionListener()
    _selectionListener = null
  }
}

function cleanupSelectionDs(viewer: Cesium.Viewer): void {
  if (_selectionDs) {
    viewer.dataSources.remove(_selectionDs, true)
    _selectionDs = null
  }
}

// ── Layer definition ──

const earthquakeLayer: LayerDef = {
  id: LAYER_ID,
  name: 'Earthquakes (M2.5+ Today)',
  kind: 'geojson',
  category: 'hazards',
  description: 'USGS real-time feed of M2.5+ earthquakes in the past day',
  defaultOn: false,
  url: USGS_FEED,
  style: {
    stroke: '#ff4444',
    strokeWidth: 1,
    fill: 'rgba(255, 68, 68, 0.3)',
  },
  styleEntities: (entities) => {
    // All quakes are static dots — no CallbackProperty per quake
    const snapshot = [...entities.values]

    for (const entity of snapshot) {
      const mag = entity.properties?.mag?.getValue?.() ?? 3
      const color = magColor(mag)
      const baseSize = magSize(mag)

      // Replace default pin with a static circle sized by magnitude
      entity.billboard = undefined as any
      entity.point = new Cesium.PointGraphics({
        pixelSize: baseSize,
        color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 1_000_000,
      })

      // Label for significant quakes
      if (mag >= labelThreshold) {
        entity.label = new Cesium.LabelGraphics({
          text: `M${mag.toFixed(1)}`,
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -baseSize - 6),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 1_000_000,
        })
      }
    }
  },
}

// ── Commands ──

function makeCommands(ctx: AppContext): CommandEntry[] {
  const showCmd: CommandEntry = {
    id: 'earthquake:show',
    name: 'Show earthquakes',
    module: 'earthquake',
    category: 'feature',
    description: 'Show the USGS earthquake layer on the globe',
    patterns: ['show earthquakes', 'earthquakes on', 'turn on earthquakes'],
    params: [],
    handler: async () => {
      showAppWelcome('earthquake')
      // Pre-populate cache so click-to-select can match entities
      await fetchQuakes()
      const ok = await ctx.showLayer(LAYER_ID)
      if (ok) {
        _visible = true
        const viewer = ctx.getViewer()
        if (viewer) setupClickHandler(viewer)
        notify()
      }
      return ok ? 'Earthquake layer visible' : 'Failed to show earthquake layer'
    },
  }

  const hideCmd: CommandEntry = {
    id: 'earthquake:hide',
    name: 'Hide earthquakes',
    module: 'earthquake',
    category: 'feature',
    description: 'Hide the USGS earthquake layer',
    patterns: ['hide earthquakes', 'earthquakes off', 'turn off earthquakes'],
    params: [],
    handler: () => {
      const viewer = ctx.getViewer()
      if (viewer) cleanupSelectionDs(viewer)
      _matchedQuake = null
      _visible = false
      cleanupClickHandler()
      notify()
      const ok = ctx.hideLayer(LAYER_ID)
      return ok ? 'Earthquake layer hidden' : 'Earthquake layer not found'
    },
  }

  const queryCmd: CommandEntry = {
    id: 'earthquake:query',
    name: 'Query earthquakes',
    module: 'earthquake',
    category: 'feature',
    description: 'Query the USGS earthquake dataset. Filter by magnitude, location, sort by magnitude/time/depth, limit results. Returns detailed info including magnitude, location, depth, felt reports, tsunami flags, and alert levels.',
    patterns: [
      'query earthquakes', 'list earthquakes', 'search earthquakes',
      'earthquakes near', 'earthquakes above', 'earthquakes in',
      'how many earthquakes', 'earthquake count', 'earthquake data',
      'latest earthquake', 'recent earthquake', 'last earthquake',
      'biggest earthquake', 'strongest earthquake', 'largest earthquake',
      'deepest earthquake', 'shallowest earthquake',
    ],
    params: [
      { name: 'minMag', type: 'number', required: false, description: 'Minimum magnitude filter (e.g. 4.0)' },
      { name: 'maxMag', type: 'number', required: false, description: 'Maximum magnitude filter' },
      { name: 'minDepth', type: 'number', required: false, description: 'Minimum depth in km' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Maximum depth in km' },
      { name: 'nearLat', type: 'number', required: false, description: 'Latitude for proximity search' },
      { name: 'nearLon', type: 'number', required: false, description: 'Longitude for proximity search' },
      { name: 'radiusKm', type: 'number', required: false, description: 'Search radius in km (default 500, used with nearLat/nearLon)' },
      { name: 'sort', type: 'string', required: false, description: 'Sort by: time (default), magnitude, depth, distance, significance' },
      { name: 'limit', type: 'number', required: false, description: 'Max results to return (default 10)' },
      { name: 'flyTo', type: 'boolean', required: false, description: 'Fly to the first result' },
    ],
    handler: async (params) => {
      try {
        let quakes = await fetchQuakes()
        if (quakes.length === 0) return 'No recent M2.5+ earthquakes found.'

        // Filter by magnitude
        if (params.minMag != null) quakes = quakes.filter(q => q.properties.mag >= Number(params.minMag))
        if (params.maxMag != null) quakes = quakes.filter(q => q.properties.mag <= Number(params.maxMag))

        // Filter by depth
        if (params.minDepth != null) quakes = quakes.filter(q => q.geometry.coordinates[2] >= Number(params.minDepth))
        if (params.maxDepth != null) quakes = quakes.filter(q => q.geometry.coordinates[2] <= Number(params.maxDepth))

        // Filter by proximity
        const hasNear = params.nearLat != null && params.nearLon != null
        if (hasNear) {
          const lat = Number(params.nearLat)
          const lon = Number(params.nearLon)
          const radius = Number(params.radiusKm ?? 500)
          quakes = quakes.filter(q => {
            const [qLon, qLat] = q.geometry.coordinates
            return haversineKm(lat, lon, qLat, qLon) <= radius
          })
        }

        if (quakes.length === 0) return 'No earthquakes match the given filters.'

        // Sort
        const sort = String(params.sort || 'time')
        switch (sort) {
          case 'magnitude': case 'mag':
            quakes.sort((a, b) => b.properties.mag - a.properties.mag); break
          case 'depth':
            quakes.sort((a, b) => b.geometry.coordinates[2] - a.geometry.coordinates[2]); break
          case 'significance': case 'sig':
            quakes.sort((a, b) => b.properties.sig - a.properties.sig); break
          case 'distance':
            if (hasNear) {
              const lat = Number(params.nearLat), lon = Number(params.nearLon)
              quakes.sort((a, b) => {
                const dA = haversineKm(lat, lon, a.geometry.coordinates[1], a.geometry.coordinates[0])
                const dB = haversineKm(lat, lon, b.geometry.coordinates[1], b.geometry.coordinates[0])
                return dA - dB
              })
            }
            break
          default: // time
            quakes.sort((a, b) => b.properties.time - a.properties.time)
        }

        const limit = Number(params.limit ?? 10)
        const results = quakes.slice(0, limit)

        // Fly to first result
        if (params.flyTo && results.length > 0) {
          const [lon, lat] = results[0].geometry.coordinates
          const viewer = ctx.getViewer()
          if (viewer) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500_000),
              duration: 2.0,
            })
          }
        }

        const header = `**${quakes.length} earthquake${quakes.length !== 1 ? 's' : ''}** match${quakes.length === 1 ? 'es' : ''} (showing ${results.length}):\n`
        const lines = results.map((q, i) => formatQuake(q, i))
        return header + lines.join('\n')
      } catch (err) {
        console.error('[earthquake] Query failed:', err)
        return 'Failed to fetch earthquake data from USGS.'
      }
    },
  }

  const summaryCmd: CommandEntry = {
    id: 'earthquake:summary',
    name: 'Earthquake summary',
    module: 'earthquake',
    category: 'feature',
    description: 'Get a statistical summary of today\'s earthquakes: total count, magnitude range, depth range, strongest quake, regions with most activity, tsunami alerts, and felt reports.',
    patterns: [
      'earthquake summary', 'earthquake stats', 'earthquake statistics',
      'earthquake overview', 'earthquake report', 'seismic activity',
    ],
    params: [],
    handler: async () => {
      try {
        const quakes = await fetchQuakes()
        if (quakes.length === 0) return 'No recent M2.5+ earthquakes.'

        const mags = quakes.map(q => q.properties.mag)
        const depths = quakes.map(q => q.geometry.coordinates[2])
        const maxMag = Math.max(...mags)
        const minMag = Math.min(...mags)
        const avgMag = mags.reduce((a, b) => a + b, 0) / mags.length
        const maxDepth = Math.max(...depths)
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length

        const strongest = quakes.find(q => q.properties.mag === maxMag)!
        const tsunamiCount = quakes.filter(q => q.properties.tsunami).length
        const alertQuakes = quakes.filter(q => q.properties.alert)
        const feltQuakes = quakes.filter(q => q.properties.felt && q.properties.felt > 0)
        const totalFelt = feltQuakes.reduce((sum, q) => sum + (q.properties.felt || 0), 0)

        // Magnitude distribution
        const m3 = quakes.filter(q => q.properties.mag < 3).length
        const m3to4 = quakes.filter(q => q.properties.mag >= 3 && q.properties.mag < 4).length
        const m4to5 = quakes.filter(q => q.properties.mag >= 4 && q.properties.mag < 5).length
        const m5plus = quakes.filter(q => q.properties.mag >= 5).length

        const lines = [
          `**Earthquake Summary (past 24h)**`,
          ``,
          `Total: **${quakes.length}** earthquakes (M2.5+)`,
          `Magnitude: ${minMag.toFixed(1)} – ${maxMag.toFixed(1)} (avg ${avgMag.toFixed(1)})`,
          `Depth: 0 – ${maxDepth.toFixed(0)} km (avg ${avgDepth.toFixed(0)} km)`,
          ``,
          `Distribution: M2–3: ${m3} | M3–4: ${m3to4} | M4–5: ${m4to5} | M5+: ${m5plus}`,
          ``,
          `Strongest: ${formatQuake(strongest)}`,
        ]

        if (tsunamiCount > 0) lines.push(`\nTsunami flags: ${tsunamiCount} quake(s)`)
        if (alertQuakes.length > 0) {
          const alerts = alertQuakes.map(q => `${q.properties.alert}: M${q.properties.mag.toFixed(1)} ${q.properties.place}`)
          lines.push(`\nAlerts:\n  ${alerts.join('\n  ')}`)
        }
        if (feltQuakes.length > 0) {
          lines.push(`\nFelt reports: ${feltQuakes.length} quake(s), ${totalFelt} total reports`)
        }

        return lines.join('\n')
      } catch (err) {
        console.error('[earthquake] Summary failed:', err)
        return 'Failed to fetch earthquake data from USGS.'
      }
    },
  }

  const settingsCmd: CommandEntry = {
    id: 'earthquake:settings',
    name: 'Earthquake settings',
    module: 'earthquake',
    category: 'feature',
    description: 'Adjust earthquake display settings. Set label-threshold to control which quakes get labels (default 4.0).',
    patterns: ['earthquake settings', 'earthquake config'],
    params: [
      { name: 'labelThreshold', type: 'number', required: false, description: 'Minimum magnitude to show labels (e.g. 3, 4, 5)' },
    ],
    handler: async (params) => {
      if (params.labelThreshold != null) {
        labelThreshold = Number(params.labelThreshold)
        // Fully reload layer to re-run styleEntities with new threshold
        await ctx.reloadLayer(LAYER_ID)
        return `Label threshold set to M${labelThreshold.toFixed(1)}. Layer refreshed.`
      }
      return `Earthquake settings:\n  Label threshold: M${labelThreshold.toFixed(1)} (show labels for quakes ≥ this magnitude)\n\nAdjust with: earthquake settings --labelThreshold 3`
    },
  }

  const selectCmd: CommandEntry = {
    id: 'earthquake:select',
    name: 'Select earthquake',
    module: 'earthquake',
    category: 'feature',
    description: 'Select an earthquake and fly to it. With no params, selects the strongest. Use sort="magnitude" for largest, sort="time" for most recent. Use nearLat/nearLon for closest to a location.',
    patterns: [
      'select earthquake', 'pick earthquake', 'choose earthquake', 'click earthquake',
      'select strongest earthquake', 'select largest earthquake', 'select biggest earthquake',
      'select latest earthquake', 'select most recent earthquake',
    ],
    params: [
      { name: 'index', type: 'number', required: false, description: 'Index (1-based) into the sorted list' },
      { name: 'sort', type: 'string', required: false, description: 'Sort order for index: "magnitude" (default, strongest first), "time" (most recent first), "depth" (deepest first), "significance"' },
      { name: 'nearLat', type: 'number', required: false, description: 'Latitude to find nearest quake' },
      { name: 'nearLon', type: 'number', required: false, description: 'Longitude to find nearest quake' },
      { name: 'minMag', type: 'number', required: false, description: 'Minimum magnitude filter' },
    ],
    handler: async (params) => {
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      let quakes = await fetchQuakes()
      if (quakes.length === 0) return 'No earthquakes loaded'

      // Apply magnitude filter
      if (params.minMag != null) {
        quakes = quakes.filter(q => q.properties.mag >= Number(params.minMag))
      }

      let target: QuakeFeature | undefined

      // Select by proximity
      if (params.nearLat != null && params.nearLon != null) {
        const lat = Number(params.nearLat), lon = Number(params.nearLon)
        let best: QuakeFeature | undefined
        let bestDist = Infinity
        for (const q of quakes) {
          const d = haversineKm(lat, lon, q.geometry.coordinates[1], q.geometry.coordinates[0])
          if (d < bestDist) { bestDist = d; best = q }
        }
        target = best
      }
      // Select by sort + index (default: strongest, index 1)
      else {
        const sort = String(params.sort || 'magnitude')
        const sorted = [...quakes]
        switch (sort) {
          case 'time': case 'recent':
            sorted.sort((a, b) => b.properties.time - a.properties.time); break
          case 'depth':
            sorted.sort((a, b) => b.geometry.coordinates[2] - a.geometry.coordinates[2]); break
          case 'significance': case 'sig':
            sorted.sort((a, b) => b.properties.sig - a.properties.sig); break
          default: // magnitude
            sorted.sort((a, b) => b.properties.mag - a.properties.mag)
        }
        const idx = Math.max(0, Number(params.index ?? 1) - 1)
        if (idx < sorted.length) {
          target = sorted[idx]
        } else {
          return `Invalid index ${params.index}. There are ${sorted.length} earthquakes.`
        }
      }

      if (!target) return 'No matching earthquake found'

      selectQuake(target, viewer)

      // Fly to it
      const [lon, lat] = target.geometry.coordinates
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 800_000),
        duration: 1.5,
      })

      return `Selected: ${formatQuake(target)}`
    },
  }

  const selectedCmd: CommandEntry = {
    id: 'earthquake:selected',
    name: 'Get selected earthquake',
    module: 'earthquake',
    category: 'feature',
    description: 'Get details about the currently selected earthquake including its coordinates. Use this to find out what quake is selected so you can fly to it, zoom in, or answer questions about it.',
    patterns: [
      'selected earthquake', 'current earthquake', 'which earthquake',
      'what earthquake', 'earthquake info', 'earthquake details',
      'zoom to earthquake', 'go to earthquake', 'fly to earthquake',
      'zoom in on earthquake', 'zoom in on selected',
    ],
    params: [
      { name: 'flyTo', type: 'boolean', required: false, description: 'Fly to the selected earthquake (default false)' },
      { name: 'altitude', type: 'number', required: false, description: 'Fly-to altitude in km (default 800)' },
    ],
    handler: async (params) => {
      const quake = _matchedQuake
      if (!quake) return 'No earthquake is currently selected. Use "select earthquake" first, or click a quake dot on the globe.'

      const [lon, lat, depth] = quake.geometry.coordinates
      const p = quake.properties

      if (params.flyTo) {
        const alt = Number(params.altitude ?? 800) * 1000
        const viewer = ctx.getViewer()
        if (viewer) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
            duration: 1.5,
          })
        }
      }

      return [
        `**Selected: M${p.mag.toFixed(1)} — ${p.place}**`,
        `Coordinates: ${lat.toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`,
        `Depth: ${depth.toFixed(1)} km`,
        `Time: ${new Date(p.time).toLocaleString()}`,
        `Type: ${p.magType} | Significance: ${p.sig}`,
        p.felt ? `Felt reports: ${p.felt}` : null,
        p.tsunami ? 'Tsunami flag: YES' : null,
        p.alert ? `Alert level: ${p.alert.toUpperCase()}` : null,
        `\nTo fly here, use: go to ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      ].filter(Boolean).join('\n')
    },
  }

  const deselectCmd: CommandEntry = {
    id: 'earthquake:deselect',
    name: 'Deselect earthquake',
    module: 'earthquake',
    category: 'feature',
    description: 'Clear the current earthquake selection',
    patterns: ['deselect earthquake', 'clear earthquake selection', 'unselect earthquake'],
    params: [],
    handler: () => {
      const viewer = ctx.getViewer()
      if (viewer) selectQuake(null, viewer)
      return 'Earthquake selection cleared'
    },
  }

  return [showCmd, hideCmd, queryCmd, summaryCmd, settingsCmd, selectCmd, selectedCmd, deselectCmd]
}

export const earthquakeApp: WorldscopeApp = {
  id: 'earthquake',
  name: 'Earthquake Tracker',
  description: 'Real-time USGS earthquake feed (M2.5+ in the past day)',
  autoActivate: true,

  activate: (ctx: AppContext): AppResources => {
    return {
      commands: makeCommands(ctx),
      layers: [earthquakeLayer],
      welcome: 'Real-time USGS earthquake feed loaded. Say "show earthquakes" to display M2.5+ quakes on the globe, "earthquake summary" for today\'s stats, or "list earthquakes" to browse the data. Click any quake dot to see details.',
      toolbar: {
        icon: '🌍',
        label: 'Earthquakes',
        isVisible: () => isEarthquakeVisible(),
      },
    }
  },

  deactivate: () => {
    cleanupClickHandler()
    _matchedQuake = null
    _visible = false
    notify()
    console.log('[earthquake] Deactivated')
  },
}
