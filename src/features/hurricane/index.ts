/**
 * Hurricane Tracker App — Global Tropical Cyclone Monitor
 *
 * Tracks active and recent tropical cyclones worldwide using GDACS
 * (Global Disaster Alert and Coordination System). Covers all basins:
 * Atlantic, East Pacific, Central Pacific, Western Pacific, Indian Ocean,
 * and Southern Hemisphere.
 *
 * Data source: GDACS REST API (https://www.gdacs.org/gdacsapi/)
 *   - Event list: active + recent TCs as GeoJSON
 *   - Geometry: track lines, forecast cones, wind radii per storm
 *   - Sources: NHC (Americas) + JTWC (rest of world)
 *   - CORS-enabled, no API key required
 *
 * Architecture follows the Worldscope app pattern (single-file module).
 */

import * as Cesium from 'cesium'
import type { WorldscopeApp, AppContext, AppResources } from '@/apps/types'
import { showAppWelcome } from '@/apps/manager'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'

// ── Types ──

type StormCategory = 'TD' | 'TS' | 'CAT1' | 'CAT2' | 'CAT3' | 'CAT4' | 'CAT5'

export interface StormInfo {
  id: number              // GDACS event ID
  name: string            // Storm name (e.g. "FREDDY")
  basin: string           // Basin code: NA, EP, WP, NI, SI, SP, SA
  basinName: string       // Human-readable basin name
  isActive: boolean       // Currently active
  alertLevel: string      // GDACS alert: Green, Orange, Red
  lat: number             // Current/last known latitude
  lon: number             // Current/last known longitude
  windKmh: number         // Max sustained wind (km/h) from GDACS
  windKnots: number       // Converted to knots
  category: StormCategory
  startDate: string       // ISO date string
  lastUpdate: string      // ISO date string
  source: string          // NHC or JTWC
  latestEpisodeId?: number
  geometryLoaded: boolean // Has geometry been fetched?
}

interface TrackPoint {
  lat: number
  lon: number
  time?: string
  wind?: number
  category: StormCategory
  _order?: number  // sort key from GDACS feature index
}

interface StormGeometry {
  trackPoints: TrackPoint[]
  cone: Array<{ lat: number; lon: number }>
  windRadii34: Array<{ lat: number; lon: number }>
  windRadii50: Array<{ lat: number; lon: number }>
  windRadii64: Array<{ lat: number; lon: number }>
}

// ── Constants ──

const GDACS_EVENTS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
const GDACS_EVENT_DATA = 'https://www.gdacs.org/gdacsapi/api/events/geteventdata'
const GDACS_GEOMETRY = 'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry'
const LAYER_ID = 'hurricane-tracker'
const CACHE_TTL = 600_000 // 10 minutes
const MONTHS_BACK = 3     // Show storms from the last N months

// ── Category helpers ──

function windToCategory(windKnots: number): StormCategory {
  if (windKnots >= 137) return 'CAT5'
  if (windKnots >= 113) return 'CAT4'
  if (windKnots >= 96) return 'CAT3'
  if (windKnots >= 83) return 'CAT2'
  if (windKnots >= 64) return 'CAT1'
  if (windKnots >= 34) return 'TS'
  return 'TD'
}

function categoryLabel(cat: StormCategory): string {
  switch (cat) {
    case 'TD': return 'Tropical Depression'
    case 'TS': return 'Tropical Storm'
    case 'CAT1': return 'Category 1'
    case 'CAT2': return 'Category 2'
    case 'CAT3': return 'Category 3'
    case 'CAT4': return 'Category 4'
    case 'CAT5': return 'Category 5'
  }
}

function categoryShortLabel(cat: StormCategory): string {
  switch (cat) {
    case 'TD': return 'TD'
    case 'TS': return 'TS'
    default: return cat.replace('CAT', 'C')
  }
}

function categoryColor(cat: StormCategory): Cesium.Color {
  switch (cat) {
    case 'TD': return new Cesium.Color(0.35, 0.65, 1.0, 0.9)
    case 'TS': return new Cesium.Color(0.3, 0.85, 0.45, 0.9)
    case 'CAT1': return new Cesium.Color(1.0, 1.0, 0.4, 0.9)
    case 'CAT2': return new Cesium.Color(1.0, 0.7, 0.2, 0.9)
    case 'CAT3': return new Cesium.Color(1.0, 0.4, 0.2, 0.9)
    case 'CAT4': return new Cesium.Color(1.0, 0.15, 0.15, 0.9)
    case 'CAT5': return new Cesium.Color(0.85, 0.1, 0.55, 0.9)
  }
}

export function categoryCssColor(cat: StormCategory): string {
  switch (cat) {
    case 'TD': return '#5aa5ff'
    case 'TS': return '#4dd970'
    case 'CAT1': return '#ffff66'
    case 'CAT2': return '#ffb333'
    case 'CAT3': return '#ff6633'
    case 'CAT4': return '#ff2626'
    case 'CAT5': return '#d91a8c'
  }
}

// ── Basin helpers ──

function kmhToKnots(kmh: number): number {
  return Math.round(kmh / 1.852)
}

function basinFromCoords(lat: number, lon: number): { code: string; name: string } {
  if (lat >= 0) {
    if (lon >= -100 && lon < 0) return { code: 'NA', name: 'North Atlantic' }
    if (lon >= -180 && lon < -100) return { code: 'EP', name: 'East Pacific' }
    if (lon >= 100 && lon <= 180) return { code: 'WP', name: 'West Pacific' }
    if (lon >= 40 && lon < 100) return { code: 'NI', name: 'North Indian' }
  } else {
    if (lon >= 30 && lon < 90) return { code: 'SI', name: 'South Indian' }
    if (lon >= 90 && lon <= 180) return { code: 'SP', name: 'South Pacific' }
    if (lon >= -180 && lon < -90) return { code: 'SP', name: 'South Pacific' }
    if (lon >= -90 && lon < 0) return { code: 'SA', name: 'South Atlantic' }
  }
  return { code: 'UN', name: 'Unknown' }
}

export function basinLabel(code: string): string {
  const labels: Record<string, string> = {
    NA: 'ATL', EP: 'EPAC', WP: 'WPAC', NI: 'NIO', SI: 'SIO', SP: 'SPAC', SA: 'SATL',
  }
  return labels[code] || code
}

// ── State management ──

type Listener = () => void
const _listeners = new Set<Listener>()
let _storms: StormInfo[] = []
let _stormGeometry = new Map<number, StormGeometry>()
let _loading = false
let _error: string | null = null
let _shownStormIds = new Set<number>()  // storms toggled on by the user (active storms are always shown)
let _visible = false
let _panelOpen = false
let _cacheTime = 0
let _appCtx: AppContext | null = null

function notify(): void {
  for (const fn of _listeners) fn()
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

export function getStorms(): StormInfo[] { return _storms }
export function isStormShown(id: number): boolean {
  return _shownStormIds.has(id)
}
export function isHurricaneLoading(): boolean { return _loading }
export function getHurricaneError(): string | null { return _error }
export function isHurricaneVisible(): boolean { return _visible }
export function isHurricanePanelOpen(): boolean { return _panelOpen }
export function toggleHurricanePanel(): void { _panelOpen = !_panelOpen; notify() }
export function setHurricanePanelOpen(open: boolean): void { _panelOpen = open; notify() }

// ── Date helpers ──

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso.slice(0, 10) }
}

/** Compact timestamp for storm labels: "Mar 19 12:00Z" */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    const day = d.getUTCDate()
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${mon} ${day} ${hh}:${mm}Z`
  } catch { return '' }
}

// ── GDACS API fetching ──

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const text = await resp.text()
  try { return JSON.parse(text) }
  catch { throw new Error('Invalid JSON from GDACS') }
}

/** Fetch the global TC event list from GDACS (last N months). */
async function fetchEventList(): Promise<StormInfo[]> {
  const from = monthsAgo(MONTHS_BACK)
  const to = todayStr()
  const url = `${GDACS_EVENTS}?eventlist=TC&fromdate=${from}&todate=${to}&alertlevel=red;orange;green`

  console.log(`[hurricane] Fetching global TC events from ${from} to ${to}`)
  const data = await fetchJson(url)

  const features: any[] = data?.features || []
  if (features.length === 0) return []

  return features.map((f: any) => {
    const p = f.properties || {}
    const geom = f.geometry || {}
    const coords = geom.coordinates || [0, 0]
    const lon = coords[0]
    const lat = coords[1]
    const severity = p.severitydata || {}
    const windKmh = Number(severity.severity) || 0
    const windKn = kmhToKnots(windKmh)
    const { code, name: basinName } = basinFromCoords(lat, lon)

    return {
      id: Number(p.eventid) || 0,
      name: String(p.eventname || 'Unknown').trim(),
      basin: code,
      basinName,
      isActive: String(p.iscurrent) === 'true',
      alertLevel: String(p.alertlevel || 'Green'),
      lat, lon,
      windKmh,
      windKnots: windKn,
      category: windToCategory(windKn),
      startDate: String(p.fromdate || ''),
      lastUpdate: String(p.todate || ''),
      source: String(p.source || ''),
      latestEpisodeId: Number(p.episodeid) || undefined,
      geometryLoaded: false,
    } satisfies StormInfo
  }).sort((a, b) => {
    // Active storms first, then recent by date descending
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    if (a.isActive && b.isActive) return b.windKnots - a.windKnots
    // Recent storms: sort by lastUpdate date descending
    return b.lastUpdate.localeCompare(a.lastUpdate)
  })
}

/** Fetch event data to get the latest episode ID (fallback if not in event list). */
async function fetchEpisodeId(eventId: number): Promise<number | null> {
  try {
    const url = `${GDACS_EVENT_DATA}?eventtype=TC&eventid=${eventId}`
    const data = await fetchJson(url)
    // GDACS returns a GeoJSON Feature — episodeid is in properties
    const props = data?.properties || data || {}
    if (props.episodeid) return Number(props.episodeid)
    // Fallback: parse from episodes list
    const episodes: any[] = props.episodes || []
    if (episodes.length > 0) {
      // Episodes are objects with a details URL containing episodeid
      const lastUrl: string = episodes[episodes.length - 1]?.details || ''
      const match = lastUrl.match(/episodeid=(\d+)/)
      if (match) return Number(match[1])
    }
    return null
  } catch (err) {
    console.warn(`[hurricane] Failed to get episodes for event ${eventId}:`, err)
    return null
  }
}

/** Guard: returns true only if both values are finite numbers */
function validCoord(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat)
}

/** Extract a valid polygon ring as {lat,lon}[], filtering NaN/Infinity */
function extractRing(geom: any): Array<{ lat: number; lon: number }> {
  const type = geom?.type || ''
  const rawRing: number[][] = type === 'MultiPolygon'
    ? (geom.coordinates?.[0]?.[0] || [])
    : (geom.coordinates?.[0] || [])
  const result: Array<{ lat: number; lon: number }> = []
  for (const c of rawRing) {
    const lon = Number(c?.[0]), lat = Number(c?.[1])
    if (validCoord(lon, lat)) result.push({ lat, lon })
  }
  return result
}

/** Fetch storm geometry (track, cone, wind radii) from GDACS. */
async function fetchGeometry(eventId: number, episodeId: number): Promise<StormGeometry | null> {
  try {
    const url = `${GDACS_GEOMETRY}?eventtype=TC&eventid=${eventId}&episodeid=${episodeId}`
    const data = await fetchJson(url)
    const features: any[] = data?.features || []
    if (features.length === 0) return null

    const trackPoints: TrackPoint[] = []
    const cone: Array<{ lat: number; lon: number }> = []
    const windRadii34: Array<{ lat: number; lon: number }> = []
    const windRadii50: Array<{ lat: number; lon: number }> = []
    const windRadii64: Array<{ lat: number; lon: number }> = []
    let trackCoords: Array<[number, number]> = []

    for (const f of features) {
      const cls = String(f.properties?.Class || f.properties?.Name || f.properties?.name || '')
      const geom = f.geometry || {}
      const type = geom.type || ''

      if (cls.startsWith('Line_Line') && type === 'LineString') {
        const coords: number[][] = geom.coordinates || []
        for (const c of coords) {
          const lon = Number(c?.[0]), lat = Number(c?.[1])
          if (validCoord(lon, lat)) trackCoords.push([lon, lat])
        }
      } else if (cls.startsWith('Point_Polygon_Point')) {
        // Track position — GDACS returns these as Polygons (circles), not Points.
        // Compute centroid from the polygon ring to get the track point position.
        // Extract the feature index for sorting (features may arrive out of order).
        const idxMatch = cls.match(/Point_Polygon_Point_(\d+)/)
        const order = idxMatch ? Number(idxMatch[1]) : trackPoints.length
        const severity = f.properties?.severitydata || {}
        const windKmh = Number(severity.severity) || 0
        const windKn = kmhToKnots(windKmh)
        const time = String(f.properties?.polygonlabel || '')
        let lat = 0, lon = 0
        if (type === 'Polygon' && geom.coordinates?.[0]?.length > 0) {
          const ring: number[][] = geom.coordinates[0]
          let count = 0
          for (const c of ring) {
            const cLon = Number(c?.[0]), cLat = Number(c?.[1])
            if (validCoord(cLon, cLat)) { lon += cLon; lat += cLat; count++ }
          }
          if (count > 0) { lon /= count; lat /= count }
        } else if (type === 'Point') {
          lon = Number(geom.coordinates?.[0]); lat = Number(geom.coordinates?.[1])
        }
        if (validCoord(lon, lat) && (lat !== 0 || lon !== 0)) {
          trackPoints.push({ lat, lon, time, wind: windKn, category: windToCategory(windKn), _order: order })
        }
      } else if (cls === 'Poly_Cones' && (type === 'Polygon' || type === 'MultiPolygon')) {
        const pts = extractRing(geom)
        if (pts.length > 3) { cone.length = 0; cone.push(...pts) }
      } else if (cls === 'Poly_Green' && (type === 'Polygon' || type === 'MultiPolygon')) {
        const pts = extractRing(geom)
        if (pts.length > 3) { windRadii34.length = 0; windRadii34.push(...pts) }
      } else if (cls === 'Poly_Orange' && (type === 'Polygon' || type === 'MultiPolygon')) {
        const pts = extractRing(geom)
        if (pts.length > 3) { windRadii50.length = 0; windRadii50.push(...pts) }
      } else if (cls === 'Poly_Red' && (type === 'Polygon' || type === 'MultiPolygon')) {
        const pts = extractRing(geom)
        if (pts.length > 3) { windRadii64.length = 0; windRadii64.push(...pts) }
      }
    }

    // Sort track points by GDACS feature index to ensure chronological order.
    // GDACS features may arrive in arbitrary order, causing jumpy track lines.
    trackPoints.sort((a, b) => (a._order ?? 0) - (b._order ?? 0))

    // If we have track line coords but no track points, create points from the line
    if (trackPoints.length === 0 && trackCoords.length > 0) {
      for (const [lon, lat] of trackCoords) {
        trackPoints.push({ lat, lon, category: 'TS' })
      }
    }

    return { trackPoints, cone, windRadii34, windRadii50, windRadii64 }
  } catch (err) {
    console.warn(`[hurricane] Failed to fetch geometry for event ${eventId}:`, err)
    return null
  }
}

/** Load geometry for a storm (fetches episodeId if needed, then geometry). */
async function loadStormGeometry(storm: StormInfo): Promise<StormGeometry | null> {
  if (_stormGeometry.has(storm.id)) return _stormGeometry.get(storm.id)!

  let episodeId = storm.latestEpisodeId
  if (!episodeId) {
    const fetched = await fetchEpisodeId(storm.id)
    if (!fetched) return null
    episodeId = fetched
    storm.latestEpisodeId = episodeId
  }

  const geom = await fetchGeometry(storm.id, episodeId)
  if (geom) {
    _stormGeometry.set(storm.id, geom)
    storm.geometryLoaded = true
  }
  return geom
}

/** Main data fetch: get global storms from GDACS, load geometry for active ones. */
async function fetchGlobalStorms(): Promise<StormInfo[]> {
  if (_storms.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    return _storms
  }

  _loading = true
  _error = null
  notify()

  try {
    _storms = await fetchEventList()
    _cacheTime = Date.now()

    // Auto-show active storms and pre-load their geometry
    const active = _storms.filter(s => s.isActive)
    for (const s of active) _shownStormIds.add(s.id)
    if (active.length > 0) {
      const loads = active.map(s => loadStormGeometry(s))
      await Promise.allSettled(loads)
    }

    _loading = false
    notify()
    return _storms
  } catch (err) {
    console.error('[hurricane] Failed to fetch storms:', err)
    _error = 'Failed to fetch tropical cyclone data from GDACS'
    _loading = false
    notify()
    return _storms
  }
}

// ── Public actions (called by panel + commands) ──

/** Toggle a storm's visibility on the globe. */
export async function selectStorm(id: number): Promise<void> {
  const storm = _storms.find(s => s.id === id)
  if (!storm) return

  // Toggle off if already shown
  if (_shownStormIds.has(id)) {
    _shownStormIds.delete(id)
    notify()
    const viewer = _appCtx?.getViewer()
    if (viewer) renderAllStorms(viewer)
    return
  }

  _shownStormIds.add(id)
  _visible = true  // selecting a storm implicitly shows the tracker
  notify()

  if (!storm.geometryLoaded) {
    _loading = true
    notify()
    await loadStormGeometry(storm)
    _loading = false
    notify()
  }

  const viewer = _appCtx?.getViewer()
  if (viewer) {
    renderAllStorms(viewer)
    flyToStorm(viewer, storm)
  }
}

function flyToStorm(viewer: Cesium.Viewer, storm: StormInfo): void {
  // Preserve current altitude when navigating to a storm
  const currentAlt = viewer.camera.positionCartographic.height
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(storm.lon, storm.lat, currentAlt),
    duration: 2.0,
  })
}

// ── Cesium Rendering ──

let _dataSource: Cesium.CustomDataSource | null = null

function getOrCreateDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource {
  if (_dataSource) return _dataSource
  _dataSource = new Cesium.CustomDataSource('hurricane-tracker')
  viewer.dataSources.add(_dataSource)
  return _dataSource
}

function clearEntities(): void {
  _dataSource?.entities.removeAll()
}

function renderAllStorms(viewer: Cesium.Viewer): void {
  const ds = getOrCreateDataSource(viewer)
  ds.entities.removeAll()

  for (const storm of _storms) {
    if (!_shownStormIds.has(storm.id)) continue

    const geom = _stormGeometry.get(storm.id)
    if (geom) {
      renderStormFull(ds, storm, geom)
    } else {
      renderStormDot(ds, storm)
    }
  }
}

function renderStormDot(ds: Cesium.CustomDataSource, storm: StormInfo): void {
  if (!validCoord(storm.lon, storm.lat)) return
  const t0 = Date.now()
  const color = categoryColor(storm.category)
  const timestamp = formatTimestamp(storm.lastUpdate)
  const pos = Cesium.Cartesian3.fromDegrees(storm.lon, storm.lat)

  // Glow ring behind the main dot
  ds.entities.add({
    position: pos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 1.5)
        return 28 + 6 * s
      }, false) as any,
      color: color.withAlpha(0.2),
      outlineWidth: 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
    },
  })

  // Pulsing main dot
  ds.entities.add({
    position: pos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 2.0)
        return 12 * (1 + 0.25 * s)
      }, false) as any,
      color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
    },
    label: {
      text: `${storm.name}\n${categoryShortLabel(storm.category)} · ${storm.windKnots} kt\n${timestamp}`,
      font: 'bold 12px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -36),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    },
  })
}

function renderStormFull(ds: Cesium.CustomDataSource, storm: StormInfo, geom: StormGeometry): void {
  if (!validCoord(storm.lon, storm.lat)) return
  const t0 = Date.now()
  const cat = storm.category
  const color = categoryColor(cat)

  // ── Forecast cone ──
  // NOTE: Do NOT use heightReference: CLAMP_TO_GROUND on polygons —
  // Cesium's terrain clamping computes an internal bounding center that
  // produces NaN for large/complex polygons like hurricane cones.
  if (geom.cone.length > 3) {
    const validCone = geom.cone.filter(p => validCoord(p.lon, p.lat))
    if (validCone.length > 3) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            validCone.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
          ),
          material: color.withAlpha(0.22),
          outline: true,
          outlineColor: color.withAlpha(0.5),
          outlineWidth: 1,
          height: 0,
        },
      })
    }
  }

  // ── Wind radii (34kt = green, 50kt = orange, 64kt = red) ──
  const radiiLayers: Array<{ pts: Array<{ lat: number; lon: number }>; alpha: number }> = [
    { pts: geom.windRadii34, alpha: 0.12 },
    { pts: geom.windRadii50, alpha: 0.18 },
    { pts: geom.windRadii64, alpha: 0.25 },
  ]
  for (const { pts, alpha } of radiiLayers) {
    const validPts = pts.filter(p => validCoord(p.lon, p.lat))
    if (validPts.length > 3) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            validPts.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
          ),
          material: color.withAlpha(alpha),
          outline: true,
          outlineColor: color.withAlpha(alpha + 0.15),
          outlineWidth: 1,
          height: 0,
        },
      })
    }
  }

  // ── Track line (glowing in storm color) ──
  const validTrack = geom.trackPoints.filter(p => validCoord(p.lon, p.lat))
  if (validTrack.length > 1) {
    const positions = validTrack.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 500)
    )
    ds.entities.add({
      polyline: {
        positions,
        width: 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: color.withAlpha(0.7),
        }),
        clampToGround: false,
      },
    })

    // Track dots colored by intensity
    for (let i = 0; i < validTrack.length; i++) {
      const pt = validTrack[i]
      const ptColor = categoryColor(pt.category)
      const isLast = i === validTrack.length - 1
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
        point: {
          pixelSize: isLast ? 6 : 4,
          color: ptColor.withAlpha(isLast ? 0.9 : 0.5),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.3),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 5_000_000,
        },
      })
    }
  }

  // ── Current position: glow halo ──
  const eyePos = Cesium.Cartesian3.fromDegrees(storm.lon, storm.lat)
  ds.entities.add({
    position: eyePos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 1.5)
        return 40 + 10 * s
      }, false) as any,
      color: color.withAlpha(0.15),
      outlineWidth: 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
    },
  })

  // ── Current position marker (pulsing eye) ──
  const timestamp = formatTimestamp(storm.lastUpdate)
  ds.entities.add({
    position: eyePos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 2.0)
        return 18 * (1 + 0.3 * s)
      }, false) as any,
      color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 2.0)
        return 3 + 1.5 * s
      }, false) as any,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
    },
    label: {
      text: `${storm.name}\n${categoryLabel(cat)} · ${storm.windKnots} kt\n${timestamp}`,
      font: 'bold 13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -42),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    },
  })

  // ── Breathing extent halo (PointGraphics — avoids EllipseGeometry axis bugs) ──
  const baseHaloPx = Math.max(40, storm.windKnots * 0.8)
  ds.entities.add({
    position: eyePos,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const s = Math.sin(((Date.now() - t0) / 1000) * 0.8)
        return baseHaloPx * (1 + 0.15 * s)
      }, false) as any,
      color: color.withAlpha(0.12),
      outlineColor: color.withAlpha(0.35),
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: 10_000_000,
    },
  })

  // ── Orbiting cyclone indicators ──
  // Small dots rotating around the eye — direction matches hemisphere
  // (counter-clockwise in Northern, clockwise in Southern)
  const nDots = 4
  const orbitR = Math.max(80_000, storm.windKnots * 2500)
  const omega = storm.lat >= 0 ? 0.5 : -0.5  // rad/s
  const cosLat = Math.cos(storm.lat * Math.PI / 180)

  for (let i = 0; i < nDots; i++) {
    const baseAngle = (i / nDots) * Math.PI * 2
    ds.entities.add({
      position: new Cesium.CallbackProperty(() => {
        const t = (Date.now() - t0) / 1000
        const angle = baseAngle + omega * t
        const dLat = (orbitR * Math.sin(angle)) / 111_000
        const dLon = (orbitR * Math.cos(angle)) / (111_000 * cosLat)
        return Cesium.Cartesian3.fromDegrees(storm.lon + dLon, storm.lat + dLat, 200)
      }, false) as any,
      point: {
        pixelSize: 4,
        color: color.withAlpha(0.7),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
        outlineWidth: 1,
        disableDepthTestDistance: 10_000_000,
      },
    })
  }
}

// ── Formatting ──

function formatStorm(storm: StormInfo, index?: number): string {
  const prefix = index != null ? `${index + 1}. ` : ''
  const active = storm.isActive ? '🟢' : '⚪'
  const latDir = storm.lat >= 0 ? 'N' : 'S'
  const lonDir = storm.lon >= 0 ? 'E' : 'W'
  return `${prefix}${active} **${storm.name}** — ${categoryLabel(storm.category)} (${storm.windKnots} kt)\n` +
    `  ${Math.abs(storm.lat).toFixed(1)}°${latDir}, ${Math.abs(storm.lon).toFixed(1)}°${lonDir} | ` +
    `${storm.basinName} | ${storm.source} | ${formatDate(storm.lastUpdate)}`
}

// ── Commands ──

function makeCommands(ctx: AppContext): CommandEntry[] {
  const showCmd: CommandEntry = {
    id: 'hurricane:show',
    name: 'Show hurricanes',
    module: 'hurricane',
    category: 'feature',
    description: 'Fetch and display global tropical cyclones (all basins worldwide)',
    patterns: [
      'show hurricanes', 'hurricanes on', 'show tropical cyclones',
      'show storms', 'tropical storms', 'hurricane tracker',
      'show tropical weather', 'active hurricanes', 'show typhoons',
      'show cyclones', 'tropical cyclone tracker',
    ],
    params: [],
    handler: async () => {
      showAppWelcome('hurricane')
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      _visible = true
      notify() // trigger panel to show immediately
      const storms = await fetchGlobalStorms()

      if (storms.length === 0) {
        return 'No tropical cyclones reported globally in the last ' + MONTHS_BACK + ' months. ' +
          'The tracker is active and will display storms when they form.'
      }

      renderAllStorms(viewer)

      const active = storms.filter(s => s.isActive)
      notify()

      const activeCount = active.length
      const recentCount = storms.length - activeCount

      // Chat output: only list active storms (panel covers recent)
      if (activeCount > 0) {
        const lines = active.map((s, i) => formatStorm(s, i))
        return `**${activeCount} active tropical cyclone${activeCount !== 1 ? 's' : ''}** (${recentCount} recent in panel):\n${lines.join('\n')}`
      }
      // No active storms — mention the most recent one
      const latest = storms[0]
      return `No active tropical cyclones right now. ${recentCount} recent storms in the panel. ` +
        `Most recent: **${latest.name}** (${categoryLabel(latest.category)}, ${formatDate(latest.lastUpdate)})`
    },
  }

  const hideCmd: CommandEntry = {
    id: 'hurricane:hide',
    name: 'Hide hurricanes',
    module: 'hurricane',
    category: 'feature',
    description: 'Hide the hurricane tracker layer',
    patterns: ['hide hurricanes', 'hurricanes off', 'hide tropical cyclones', 'hide typhoons'],
    params: [],
    handler: () => {
      _visible = false
      clearEntities()
      notify()
      return 'Hurricane tracker hidden'
    },
  }

  const queryCmd: CommandEntry = {
    id: 'hurricane:query',
    name: 'Query hurricanes',
    module: 'hurricane',
    category: 'feature',
    description: 'Query global tropical cyclones. Filter by basin (atlantic, pacific, indian, etc.), minimum category, or active-only.',
    patterns: [
      'query hurricanes', 'list hurricanes', 'list tropical cyclones',
      'active storms', 'current hurricanes', 'hurricane status',
      'tropical cyclone status', 'how many hurricanes',
      'list typhoons', 'active typhoons', 'cyclone status',
    ],
    params: [
      { name: 'basin', type: 'string', required: false, description: 'Filter by basin: atlantic/NA, east-pacific/EP, west-pacific/WP, indian/NI, south-indian/SI, south-pacific/SP' },
      { name: 'minCategory', type: 'number', required: false, description: 'Minimum Saffir-Simpson category (1-5)' },
      { name: 'activeOnly', type: 'boolean', required: false, description: 'Show only currently active storms' },
      { name: 'flyTo', type: 'boolean', required: false, description: 'Fly to the first result' },
    ],
    handler: async (params) => {
      let storms = await fetchGlobalStorms()
      if (storms.length === 0) return 'No tropical cyclones reported globally in the last ' + MONTHS_BACK + ' months.'

      if (params.activeOnly) storms = storms.filter(s => s.isActive)

      if (params.basin) {
        const b = String(params.basin).toUpperCase()
        const basinMap: Record<string, string> = {
          ATLANTIC: 'NA', NA: 'NA', AL: 'NA', AT: 'NA',
          'EAST-PACIFIC': 'EP', EP: 'EP', 'EASTERN PACIFIC': 'EP', EPAC: 'EP',
          'WEST-PACIFIC': 'WP', WP: 'WP', 'WESTERN PACIFIC': 'WP', WPAC: 'WP',
          INDIAN: 'NI', NI: 'NI', NIO: 'NI', 'NORTH INDIAN': 'NI',
          'SOUTH-INDIAN': 'SI', SI: 'SI', SIO: 'SI',
          'SOUTH-PACIFIC': 'SP', SP: 'SP', SPAC: 'SP',
        }
        const code = basinMap[b] || b
        storms = storms.filter(s => s.basin === code)
      }

      if (params.minCategory != null) {
        const minCat = Number(params.minCategory)
        const catToNum: Record<StormCategory, number> = {
          TD: -1, TS: 0, CAT1: 1, CAT2: 2, CAT3: 3, CAT4: 4, CAT5: 5,
        }
        storms = storms.filter(s => catToNum[s.category] >= minCat)
      }

      if (storms.length === 0) return 'No storms match the given filters.'

      if (params.flyTo && storms.length > 0) {
        const viewer = ctx.getViewer()
        if (viewer) flyToStorm(viewer, storms[0])
      }

      const lines = storms.map((s, i) => formatStorm(s, i))
      return `**${storms.length} tropical cyclone${storms.length !== 1 ? 's' : ''}:**\n${lines.join('\n')}`
    },
  }

  const summaryCmd: CommandEntry = {
    id: 'hurricane:summary',
    name: 'Hurricane summary',
    module: 'hurricane',
    category: 'feature',
    description: 'Get a statistical summary of global tropical cyclone activity',
    patterns: ['hurricane summary', 'cyclone summary', 'tropical weather summary', 'storm summary'],
    params: [],
    handler: async () => {
      const storms = await fetchGlobalStorms()
      if (storms.length === 0) return 'No tropical cyclones globally in the last ' + MONTHS_BACK + ' months.'

      const active = storms.filter(s => s.isActive)
      const byBasin = new Map<string, StormInfo[]>()
      for (const s of storms) {
        const arr = byBasin.get(s.basinName) || []
        arr.push(s)
        byBasin.set(s.basinName, arr)
      }

      const strongest = storms.reduce((a, b) => a.windKnots > b.windKnots ? a : b)

      let text = `**Global Tropical Cyclone Summary** (last ${MONTHS_BACK} months)\n\n`
      text += `Total storms: ${storms.length} | Active now: ${active.length}\n`
      text += `Strongest: ${strongest.name} (${strongest.windKnots} kt, ${categoryLabel(strongest.category)})\n\n`
      text += `**By basin:**\n`
      for (const [basin, list] of byBasin) {
        const activeCount = list.filter(s => s.isActive).length
        text += `- ${basin}: ${list.length} storm${list.length !== 1 ? 's' : ''}${activeCount > 0 ? ` (${activeCount} active)` : ''}\n`
      }
      return text
    },
  }

  const refreshCmd: CommandEntry = {
    id: 'hurricane:refresh',
    name: 'Refresh hurricanes',
    module: 'hurricane',
    category: 'feature',
    description: 'Force refresh tropical cyclone data from GDACS (bypasses cache)',
    patterns: ['refresh hurricanes', 'update hurricanes', 'reload hurricanes'],
    params: [],
    handler: async () => {
      _cacheTime = 0
      _stormGeometry.clear()
      for (const s of _storms) s.geometryLoaded = false

      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      const storms = await fetchGlobalStorms()
      if (_visible) renderAllStorms(viewer)

      const active = storms.filter(s => s.isActive)
      return `Refreshed: ${storms.length} storm${storms.length !== 1 ? 's' : ''} globally (${active.length} active). Data from GDACS.`
    },
  }

  return [showCmd, hideCmd, queryCmd, summaryCmd, refreshCmd]
}

// ── Layer + App definition ──

const hurricaneLayer: LayerDef = {
  id: LAYER_ID,
  name: 'Tropical Cyclones (Global)',
  kind: 'geojson',
  category: 'hazards',
  description: 'Global tropical cyclone tracks and forecasts via GDACS (NHC + JTWC)',
  defaultOn: false,
  url: 'https://www.gdacs.org/',
}

export const hurricaneApp: WorldscopeApp = {
  id: 'hurricane',
  name: 'Tropical Cyclone Tracker',
  description: 'Global tropical cyclone monitoring via GDACS — all basins, NHC + JTWC data',
  autoActivate: true,

  activate: (ctx: AppContext): AppResources => {
    _appCtx = ctx
    return {
      commands: makeCommands(ctx),
      layers: [hurricaneLayer],
      welcome: 'Global Tropical Cyclone Tracker loaded. Say "show hurricanes" to display active cyclones worldwide. Covers all basins: Atlantic, Pacific, Indian Ocean, and Southern Hemisphere via GDACS (NHC + JTWC data).',
      toolbar: {
        icon: '🌀',
        label: 'Cyclones',
        isVisible: () => isHurricaneVisible(),
      },
    }
  },

  deactivate: () => {
    clearEntities()
    _storms = []
    _stormGeometry.clear()
    _cacheTime = 0
    _dataSource = null
    _visible = false
    _shownStormIds.clear()
    _appCtx = null
    console.log('[hurricane] Deactivated')
  },
}
