/**
 * Satellite Tracker App
 *
 * Tracks orbiting satellites in real-time using CelesTrak GP (General
 * Perturbations) data. Orbit propagation runs in a Web Worker to keep
 * the Cesium render loop free of heavy math.
 *
 * Data source: CelesTrak GP JSON API (https://celestrak.org)
 *   - No API key required, CORS-enabled
 *   - Groups: stations (ISS, Tiangong), visual (100 brightest)
 *
 * Orbital mechanics: Two-body Keplerian propagation with Newton-Raphson
 * solver for Kepler's equation. Accurate to ~1° for LEO over a few hours
 * from epoch — sufficient for visual display.
 */

import * as Cesium from 'cesium'
import type { WorldscopeApp, AppContext, AppResources } from '@/apps/types'
import { showAppWelcome } from '@/apps/manager'
import type { CommandEntry } from '@/ai/types'
import type {
  WorkerRequest,
  WorkerResponse,
  OrbitalElementsWire,
  GeoPosition,
} from './orbit-worker'

// ── Constants ──

const CELESTRAK_GP = 'https://celestrak.org/NORAD/elements/gp.php'
const LAYER_ID = 'satellite-tracker'
const CACHE_TTL = 600_000 // 10 minutes
const MU = 398600.4418   // Earth gravitational parameter (km³/s²)
const RE = 6371.0         // Earth mean radius (km)
const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI

// Worker update intervals
const POSITION_UPDATE_INTERVAL = 500  // ms — update all positions every 500ms
const TRAIL_UPDATE_INTERVAL = 2_000   // ms — recompute trails every 2s

// ── Types ──

interface OrbitalElements {
  name: string
  noradId: number
  epoch: number           // ms since Unix epoch
  meanMotion: number      // revolutions per day
  eccentricity: number
  inclination: number     // degrees
  raan: number            // right ascension of ascending node (degrees)
  argPerigee: number      // argument of perigee (degrees)
  meanAnomaly: number     // degrees
  semiMajorAxis: number   // km (computed from mean motion)
  period: number          // seconds
  altitudeKm: number      // approximate altitude (a - RE)
  orbitType: 'LEO' | 'MEO' | 'GEO' | 'HEO'
}

// ── Minimal main-thread propagation (for infrequent single-satellite queries) ──

function solveKepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 30; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
    E += dE
    if (Math.abs(dE) < 1e-10) break
  }
  return E
}

function gmst(date: Date): number {
  const JD = date.getTime() / 86400000 + 2440587.5
  const T = (JD - 2451545.0) / 36525.0
  const theta = 280.46061837 + 360.98564736629 * (JD - 2451545.0) +
    T * T * (0.000387933 - T / 38710000)
  return ((theta % 360 + 360) % 360) * DEG
}

/**
 * Main-thread propagation — used only for infrequent one-off queries
 * (click-to-track flyTo, format, getTrackedPosition). The hot path
 * (CallbackProperty evaluations) reads from the worker position cache.
 */
function propagate(elem: OrbitalElements, date: Date): GeoPosition {
  const n = elem.meanMotion * TWO_PI / 86400
  const a = elem.semiMajorAxis
  const e = elem.eccentricity
  const dt = (date.getTime() - elem.epoch) / 1000

  const M = ((elem.meanAnomaly * DEG + n * dt) % TWO_PI + TWO_PI) % TWO_PI
  const E = solveKepler(M, e)

  const sinV = Math.sqrt(1 - e * e) * Math.sin(E) / (1 - e * Math.cos(E))
  const cosV = (Math.cos(E) - e) / (1 - e * Math.cos(E))
  const v = Math.atan2(sinV, cosV)

  const r = a * (1 - e * Math.cos(E))
  const xOrb = r * Math.cos(v)
  const yOrb = r * Math.sin(v)

  const w = elem.argPerigee * DEG
  const i = elem.inclination * DEG
  const O = elem.raan * DEG

  const cosW = Math.cos(w), sinW = Math.sin(w)
  const cosI = Math.cos(i), sinI = Math.sin(i)
  const cosO = Math.cos(O), sinO = Math.sin(O)

  const xECI = xOrb * (cosW * cosO - sinW * sinO * cosI) - yOrb * (sinW * cosO + cosW * sinO * cosI)
  const yECI = xOrb * (cosW * sinO + sinW * cosO * cosI) - yOrb * (sinW * sinO - cosW * cosO * cosI)
  const zECI = xOrb * sinW * sinI + yOrb * cosW * sinI

  const g = gmst(date)
  const cosG = Math.cos(g), sinG = Math.sin(g)
  const xECEF = xECI * cosG + yECI * sinG
  const yECEF = -xECI * sinG + yECI * cosG
  const zECEF = zECI

  const lon = Math.atan2(yECEF, xECEF) / DEG
  const lat = Math.atan2(zECEF, Math.sqrt(xECEF * xECEF + yECEF * yECEF)) / DEG
  const alt = Math.sqrt(xECEF * xECEF + yECEF * yECEF + zECEF * zECEF) - RE

  return { lat, lon, alt }
}

// ── Color/sizing by orbit type ──

function orbitType(altKm: number): 'LEO' | 'MEO' | 'GEO' | 'HEO' {
  if (altKm < 2000) return 'LEO'
  if (altKm > 34000 && altKm < 37000) return 'GEO'
  if (altKm >= 37000) return 'HEO'
  return 'MEO'
}

function orbitColor(type: string): Cesium.Color {
  switch (type) {
    case 'LEO': return new Cesium.Color(0.3, 0.7, 1.0, 0.9)   // blue
    case 'MEO': return new Cesium.Color(0.3, 0.9, 0.5, 0.9)   // green
    case 'GEO': return new Cesium.Color(1.0, 0.75, 0.2, 0.9)  // amber
    case 'HEO': return new Cesium.Color(0.9, 0.3, 0.6, 0.9)   // magenta
    default:    return new Cesium.Color(0.8, 0.8, 0.8, 0.9)    // gray
  }
}

/** Notable satellites that get special labels */
const NOTABLE: Record<number, string> = {
  25544: 'ISS',
  48274: 'CSS (Tiangong)',
  20580: 'Hubble',
  43013: 'NOAA-20',
  27424: 'XMM-Newton',
  28654: 'NOAA-18',
  33591: 'NOAA-19',
  29155: 'CLOUDSAT',
  40069: 'Meteor-M2',
  28376: 'Aura',
  27386: 'Aqua',
  25994: 'Terra',
}

// ── CelesTrak data fetching ──

interface GPRecord {
  OBJECT_NAME: string
  NORAD_CAT_ID: number
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
}

function gpToElements(gp: GPRecord): OrbitalElements {
  const n = gp.MEAN_MOTION // rev/day
  const nRad = n * TWO_PI / 86400 // rad/s
  const a = Math.pow(MU / (nRad * nRad), 1 / 3) // km
  const alt = a - RE
  const type = orbitType(alt)

  return {
    name: gp.OBJECT_NAME,
    noradId: gp.NORAD_CAT_ID,
    epoch: new Date(gp.EPOCH).getTime(),
    meanMotion: n,
    eccentricity: gp.ECCENTRICITY,
    inclination: gp.INCLINATION,
    raan: gp.RA_OF_ASC_NODE,
    argPerigee: gp.ARG_OF_PERICENTER,
    meanAnomaly: gp.MEAN_ANOMALY,
    semiMajorAxis: a,
    period: 86400 / n,
    altitudeKm: alt,
    orbitType: type,
  }
}

let _satellites: OrbitalElements[] = []
let _cacheTime = 0

async function fetchGroup(group: string): Promise<GPRecord[]> {
  const url = `${CELESTRAK_GP}?GROUP=${group}&FORMAT=json`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`CelesTrak HTTP ${resp.status}`)
  return resp.json()
}

async function fetchSatellites(): Promise<OrbitalElements[]> {
  if (_satellites.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    return _satellites
  }

  console.log('[satellite] Fetching satellite data from CelesTrak')

  // Fetch stations (ISS, Tiangong, etc.) and 100 brightest
  const [stations, visual] = await Promise.all([
    fetchGroup('stations').catch(() => [] as GPRecord[]),
    fetchGroup('visual').catch(() => [] as GPRecord[]),
  ])

  // Deduplicate by NORAD ID
  const seen = new Set<number>()
  const all: GPRecord[] = []
  for (const gp of [...stations, ...visual]) {
    if (!seen.has(gp.NORAD_CAT_ID)) {
      seen.add(gp.NORAD_CAT_ID)
      all.push(gp)
    }
  }

  _satellites = all.map(gpToElements)
  _cacheTime = Date.now()
  console.log(`[satellite] Loaded ${_satellites.length} satellites`)
  return _satellites
}

// ── Web Worker management ──

let _worker: Worker | null = null
let _positionTimer: ReturnType<typeof setInterval> | null = null
let _trailTimer: ReturnType<typeof setInterval> | null = null

/** Cached positions from worker — keyed by NORAD ID */
const _positionCache = new Map<number, GeoPosition>()

/** Cached trail points from worker — keyed by NORAD ID */
const _trailPointsCache = new Map<number, GeoPosition[]>()

function createWorker(): Worker {
  if (_worker) return _worker
  _worker = new Worker(
    new URL('./orbit-worker.ts', import.meta.url),
    { type: 'module' },
  )
  _worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data
    switch (msg.type) {
      case 'positions':
        for (const p of msg.positions) {
          _positionCache.set(p.noradId, { lat: p.lat, lon: p.lon, alt: p.alt })
        }
        break
      case 'trails':
        for (const t of msg.trails) {
          _trailPointsCache.set(t.noradId, t.points)
        }
        break
    }
  }
  _worker.onerror = (err) => {
    console.error('[satellite] Worker error:', err)
  }
  return _worker
}

function sendToWorker(msg: WorkerRequest): void {
  if (!_worker) return
  _worker.postMessage(msg)
}

/** Send orbital elements to the worker */
function syncElementsToWorker(): void {
  const wire: OrbitalElementsWire[] = _satellites.map(s => ({
    name: s.name,
    noradId: s.noradId,
    epoch: s.epoch,
    meanMotion: s.meanMotion,
    eccentricity: s.eccentricity,
    inclination: s.inclination,
    raan: s.raan,
    argPerigee: s.argPerigee,
    meanAnomaly: s.meanAnomaly,
    semiMajorAxis: s.semiMajorAxis,
    period: s.period,
    altitudeKm: s.altitudeKm,
    orbitType: s.orbitType,
  }))
  sendToWorker({ type: 'set-elements', elements: wire })
}

/** Request all satellite positions from worker */
function requestPositions(): void {
  sendToWorker({ type: 'propagate-all', timeMs: Date.now() })
}

/** Request trail points from worker for all visible satellites */
function requestTrails(): void {
  const satellites = _satellites.map(s => ({
    noradId: s.noradId,
    numPoints: 100,
    trailFraction: 0.75,
  }))
  sendToWorker({ type: 'compute-trails', timeMs: Date.now(), satellites })
}

/** Start periodic worker updates */
function startWorkerUpdates(): void {
  stopWorkerUpdates()
  // Initial immediate computation
  requestPositions()
  requestTrails()
  // Periodic updates
  _positionTimer = setInterval(requestPositions, POSITION_UPDATE_INTERVAL)
  _trailTimer = setInterval(requestTrails, TRAIL_UPDATE_INTERVAL)
}

/** Stop periodic worker updates */
function stopWorkerUpdates(): void {
  if (_positionTimer) { clearInterval(_positionTimer); _positionTimer = null }
  if (_trailTimer) { clearInterval(_trailTimer); _trailTimer = null }
}

/** Terminate the worker entirely */
function terminateWorker(): void {
  stopWorkerUpdates()
  if (_worker) {
    _worker.terminate()
    _worker = null
  }
  _positionCache.clear()
  _trailPointsCache.clear()
}

/**
 * Get a cached position for a satellite. Falls back to main-thread
 * propagation if the worker hasn't delivered results yet.
 */
function getCachedPosition(sat: OrbitalElements): GeoPosition {
  const cached = _positionCache.get(sat.noradId)
  if (cached) return cached
  // Fallback: compute on main thread (only happens before first worker response)
  return propagate(sat, new Date())
}

// ── State management ──

type Listener = () => void
const _listeners = new Set<Listener>()
let _visible = false
let _loading = false
let _error: string | null = null
let _tracked: number | null = null // NORAD ID of tracked satellite
let _isolateOrbits = false           // only show tracked satellite's orbit
let _clickHandler: Cesium.ScreenSpaceEventHandler | null = null
let _appCtx: AppContext | null = null
let _following = false
let _followUnsub: (() => void) | null = null
let _followInputHandler: Cesium.ScreenSpaceEventHandler | null = null

function notify(): void { for (const fn of _listeners) fn() }
export function subscribe(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}
export function getSatellites(): OrbitalElements[] { return _satellites }
export function isSatelliteLoading(): boolean { return _loading }
export function getSatelliteError(): string | null { return _error }
export function isSatelliteVisible(): boolean { return _visible }
export function isFollowingSatellite(): boolean { return _following }
export function getTrackedSatellite(): OrbitalElements | null {
  if (!_tracked) return null
  return _satellites.find(s => s.noradId === _tracked) ?? null
}
export function clearTrackedSatellite(): void {
  stopFollowing()
  _tracked = null
  const viewer = _appCtx?.getViewer()
  if (viewer) renderSatellites(viewer)
  notify()
}
export function getTrackedPosition(): { lat: number; lon: number; alt: number } | null {
  const sat = getTrackedSatellite()
  if (!sat) return null
  const pos = getCachedPosition(sat)
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null
  return pos
}

// ── Click-to-track ──

function setupClickHandler(viewer: Cesium.Viewer): void {
  if (_clickHandler) return
  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  _clickHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position)
    if (!picked?.id?.id) return
    const id = String(picked.id.id)
    if (!id.startsWith('sat-')) return
    const noradId = Number(id.slice(4))
    if (isNaN(noradId)) return

    _tracked = noradId
    notify()
    renderSatellites(viewer)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

function cleanupClickHandler(): void {
  if (_clickHandler) {
    _clickHandler.destroy()
    _clickHandler = null
  }
}

function startFollowing(viewer: Cesium.Viewer, sat: OrbitalElements, ctx: AppContext): void {
  stopFollowing()
  _following = true
  const camOffset = Math.max(sat.altitudeKm * 0.5, 300) // km above satellite

  _followUnsub = ctx.onTick(() => {
    if (!_following) return
    const pos = getCachedPosition(sat)
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        pos.lon, pos.lat,
        (Math.max(pos.alt, 100) + camOffset) * 1000,
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    })
  })

  // Stop following on any user input
  _followInputHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  const stop = () => stopFollowing()
  _followInputHandler.setInputAction(stop, Cesium.ScreenSpaceEventType.LEFT_DOWN)
  _followInputHandler.setInputAction(stop, Cesium.ScreenSpaceEventType.RIGHT_DOWN)
  _followInputHandler.setInputAction(stop, Cesium.ScreenSpaceEventType.MIDDLE_DOWN)
  _followInputHandler.setInputAction(stop, Cesium.ScreenSpaceEventType.WHEEL)
  _followInputHandler.setInputAction(stop, Cesium.ScreenSpaceEventType.PINCH_START)
  notify()
}

export function stopFollowing(): void {
  _following = false
  if (_followUnsub) {
    _followUnsub()
    _followUnsub = null
  }
  if (_followInputHandler) {
    _followInputHandler.destroy()
    _followInputHandler = null
  }
  notify()
}

// ── Cesium Rendering ──

let _dataSource: Cesium.CustomDataSource | null = null

/**
 * Build Cartesian3 trail segments from cached trail points.
 * The worker gives us flat GeoPosition[] arrays; we split them into
 * numSegments pieces and convert to Cesium Cartesian3 on the main thread.
 */
function getTrailSegments(sat: OrbitalElements, numSegments: number): Cesium.Cartesian3[][] {
  const points = _trailPointsCache.get(sat.noradId)
  if (!points || points.length === 0) return Array.from({ length: numSegments }, () => [])

  // Convert to Cartesian3 (filtering invalid positions)
  const trailPositions: Cesium.Cartesian3[] = []
  for (const p of points) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.alt)) {
      trailPositions.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.alt, 100) * 1000))
    }
  }

  const pointsPerSeg = Math.floor(trailPositions.length / numSegments)
  const segments: Cesium.Cartesian3[][] = []
  for (let s = 0; s < numSegments; s++) {
    const start = s * pointsPerSeg
    const end = Math.min(start + pointsPerSeg + 1, trailPositions.length)
    const seg = trailPositions.slice(start, end)
    if (seg.length >= 2) segments.push(seg)
    else segments.push([])
  }

  return segments
}

/** Snap the newest trail segment's endpoint to the satellite's live cached position */
function trailWithLiveTip(segments: Cesium.Cartesian3[][], segIdx: number, sat: OrbitalElements): Cesium.Cartesian3[] {
  const seg = segments[segIdx]
  if (!seg || seg.length === 0) return []
  // Only the last segment gets the live tip
  if (segIdx < segments.length - 1) return seg
  const pos = getCachedPosition(sat)
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return seg
  const tip = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, Math.max(pos.alt, 100) * 1000)
  return [...seg, tip]
}

function getOrCreateDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource {
  if (_dataSource) return _dataSource
  _dataSource = new Cesium.CustomDataSource('satellite-tracker')

  // Configure entity clustering (off by default — toggle via layers:set-clustering)
  _dataSource.clustering.enabled = false
  _dataSource.clustering.pixelRange = 40
  _dataSource.clustering.minimumClusterSize = 5
  _dataSource.clustering.clusterBillboards = true
  _dataSource.clustering.clusterLabels = true
  _dataSource.clustering.clusterPoints = true

  // Style cluster labels to show entity count
  _dataSource.clustering.clusterEvent.addEventListener(
    (clusteredEntities: Cesium.Entity[], cluster: { billboard: Cesium.Billboard; label: Cesium.Label; point: Cesium.PointPrimitive }) => {
      cluster.label.show = true
      cluster.label.text = clusteredEntities.length.toString()
      cluster.label.font = '14px sans-serif'
      cluster.label.fillColor = Cesium.Color.WHITE
      cluster.label.outlineColor = Cesium.Color.BLACK
      cluster.label.outlineWidth = 2
      cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER
      cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER
      cluster.billboard.show = false
      cluster.point.show = false
    }
  )

  viewer.dataSources.add(_dataSource)
  return _dataSource
}

function renderSatellites(viewer: Cesium.Viewer): void {
  const ds = getOrCreateDataSource(viewer)
  ds.entities.removeAll()
  const t0 = Date.now()

  const TRACKED_COLOR = new Cesium.Color(1.0, 0.95, 0.2, 0.95)

  for (const sat of _satellites) {
    const baseColor = orbitColor(sat.orbitType)
    const isNotable = NOTABLE[sat.noradId] != null
    const isTracked = sat.noradId === _tracked
    const dotColor = isTracked
      ? new Cesium.Color(1.0, 1.0, 1.0, 1.0)
      : new Cesium.Color(0.92, 0.92, 0.95, 0.9)

    // ── Past trail (fading, using worker-computed trail points) ──
    const showOrbit = isTracked || !_isolateOrbits
    if (showOrbit) {
      const segments = isTracked ? 8 : 5

      for (let s = 0; s < segments; s++) {
        const t = (s + 1) / segments
        const fade = t * t * t

        if (isTracked) {
          const alpha = fade * 0.9
          if (alpha < 0.02) continue
          const segIdx = s
          ds.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => {
                const segs = getTrailSegments(sat, segments)
                return trailWithLiveTip(segs, segIdx, sat)
              }, false) as any,
              width: 4,
              material: new Cesium.ColorMaterialProperty(TRACKED_COLOR.withAlpha(alpha)),
              clampToGround: false,
            },
          })
        } else {
          const alpha = fade * 0.35
          if (alpha < 0.02) continue
          const segIdx = s
          ds.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => {
                const segs = getTrailSegments(sat, segments)
                return trailWithLiveTip(segs, segIdx, sat)
              }, false) as any,
              width: 1.5,
              material: new Cesium.ColorMaterialProperty(baseColor.withAlpha(alpha)),
              clampToGround: false,
            },
          })
        }
      }
    }

    // ── Animated satellite position (pulsing dot) — reads from worker cache ──
    if (isNotable || isTracked) {
      ds.entities.add({
        id: `sat-halo-${sat.noradId}`,
        position: new Cesium.CallbackProperty(() => {
          const pos = getCachedPosition(sat)
          if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return Cesium.Cartesian3.ZERO
          return Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, Math.max(pos.alt, 100) * 1000)
        }, false) as any,
        point: {
          pixelSize: new Cesium.CallbackProperty(() => {
            const s = Math.sin(((Date.now() - t0) / 1000) * 1.5)
            return (isTracked ? 30 : 22) + 8 * s
          }, false) as any,
          color: dotColor.withAlpha(isTracked ? 0.2 : 0.15),
          outlineWidth: 0,
          disableDepthTestDistance: 0,
        },
      })
    }

    // Main dot (clickable) — reads from worker cache
    ds.entities.add({
      id: `sat-${sat.noradId}`,
      position: new Cesium.CallbackProperty(() => {
        const pos = getCachedPosition(sat)
        if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return Cesium.Cartesian3.ZERO
        return Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, Math.max(pos.alt, 100) * 1000)
      }, false) as any,
      point: {
        pixelSize: new Cesium.CallbackProperty(() => {
          const base = isTracked ? 12 : isNotable ? 8 : 5
          const s = Math.sin(((Date.now() - t0) / 1000) * 2.5)
          return base * (1 + 0.25 * s)
        }, false) as any,
        color: dotColor,
        outlineColor: baseColor.withAlpha(isNotable ? 0.7 : 0.4),
        outlineWidth: isNotable ? 2 : 1,
        disableDepthTestDistance: 0,
      },
      label: (isNotable || isTracked) ? {
        text: NOTABLE[sat.noradId] || sat.name,
        font: isTracked ? 'bold 14px sans-serif' : '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, 0),
        disableDepthTestDistance: 0,
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      } : undefined,
    })

    // ── Ground track line for tracked sat ──
    if (isTracked) {
      ds.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const pos = getCachedPosition(sat)
            if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return []
            return [
              Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, Math.max(pos.alt, 100) * 1000),
              Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0),
            ]
          }, false) as any,
          width: 1.5,
          material: TRACKED_COLOR.withAlpha(0.5),
          clampToGround: false,
        },
      })
    }
  }
}

// ── Formatting ──

function formatSat(sat: OrbitalElements, index?: number): string {
  const prefix = index != null ? `${index + 1}. ` : ''
  const notable = NOTABLE[sat.noradId] ? ` (${NOTABLE[sat.noradId]})` : ''
  const pos = getCachedPosition(sat)
  const latDir = pos.lat >= 0 ? 'N' : 'S'
  const lonDir = pos.lon >= 0 ? 'E' : 'W'
  return `${prefix}**${sat.name}**${notable} — ${sat.orbitType}\n` +
    `  Alt: ${sat.altitudeKm.toFixed(0)} km | Period: ${(sat.period / 60).toFixed(1)} min | ` +
    `Incl: ${sat.inclination.toFixed(1)}° | ` +
    `Pos: ${Math.abs(pos.lat).toFixed(1)}°${latDir}, ${Math.abs(pos.lon).toFixed(1)}°${lonDir}`
}

// ── Commands ──

function makeCommands(ctx: AppContext): CommandEntry[] {
  const showCmd: CommandEntry = {
    id: 'satellite:show',
    name: 'Show satellites',
    module: 'satellite',
    category: 'feature',
    description: 'Show orbiting satellites on the globe with real-time positions and orbital tracks',
    patterns: [
      'show satellites', 'satellites on', 'satellite tracker',
      'show orbits', 'track satellites', 'show iss',
      'space station', 'show space', 'satellite positions',
    ],
    params: [],
    handler: async () => {
      showAppWelcome('satellite')
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      _visible = true
      _loading = true
      notify()

      try {
        await fetchSatellites()
        _loading = false
        notify()

        // Start the worker and send it the orbital elements
        createWorker()
        syncElementsToWorker()
        startWorkerUpdates()

        renderSatellites(viewer)
        setupClickHandler(viewer)

        const notable = _satellites.filter(s => NOTABLE[s.noradId])
        return `**${_satellites.length} satellites** loaded with real-time orbital tracking.\n` +
          `Notable: ${notable.map(s => NOTABLE[s.noradId]).join(', ')}\n` +
          `Say "track ISS" to follow a specific satellite.`
      } catch (err) {
        _error = 'Failed to fetch satellite data from CelesTrak'
        _loading = false
        notify()
        console.error('[satellite] Fetch failed:', err)
        return _error
      }
    },
  }

  const hideCmd: CommandEntry = {
    id: 'satellite:hide',
    name: 'Hide satellites',
    module: 'satellite',
    category: 'feature',
    description: 'Hide the satellite tracker layer',
    patterns: ['hide satellites', 'satellites off', 'hide orbits'],
    params: [],
    handler: () => {
      _visible = false
      _tracked = null
      cleanupClickHandler()

      stopFollowing()
      terminateWorker()
      _dataSource?.entities.removeAll()
      notify()
      return 'Satellite tracker hidden'
    },
  }

  const trackCmd: CommandEntry = {
    id: 'satellite:track',
    name: 'Track satellite',
    module: 'satellite',
    category: 'feature',
    description: 'Focus on and track a specific satellite by name. Shows enhanced orbit path and ground track line. Use isolate=true (or say "show X orbit") to hide all other satellite orbits.',
    patterns: [
      'track satellite', 'track iss', 'follow satellite',
      'track hubble', 'where is iss', 'find satellite',
      'track tiangong', 'track space station',
      'show iss orbit', 'show hubble orbit', 'show satellite orbit',
      'show tiangong orbit', 'show terra orbit',
    ],
    params: [
      { name: 'name', type: 'string', required: false, description: 'Satellite name or NORAD ID to track (e.g. "ISS", "Hubble", "25544")' },
      { name: 'isolate', type: 'boolean', required: false, description: 'If true, hide all other satellite orbits (default true when user says "show X orbit")' },
    ],
    handler: async (params) => {
      if (_satellites.length === 0) {
        try { await fetchSatellites() } catch { return 'Failed to fetch satellite data' }
      }

      const query = String(params.name || 'ISS').toLowerCase().trim()

      // Try NORAD ID first
      const noradId = Number(query)
      let sat: OrbitalElements | undefined
      if (!isNaN(noradId)) {
        sat = _satellites.find(s => s.noradId === noradId)
      }

      // Try name match
      if (!sat) {
        sat = _satellites.find(s => s.name.toLowerCase().includes(query))
      }
      // Try notable alias
      if (!sat) {
        for (const [id, alias] of Object.entries(NOTABLE)) {
          if (alias.toLowerCase().includes(query)) {
            sat = _satellites.find(s => s.noradId === Number(id))
            break
          }
        }
      }

      if (!sat) return `No satellite found matching "${params.name}". Try "query satellites" to search.`

      _tracked = sat.noradId
      _visible = true

      // Auto-isolate when user says "show X orbit" or passes isolate=true
      const rawText = String(params._raw || '').toLowerCase()
      const wantsIsolate = params.isolate === true || params.isolate === 'true' as any
        || rawText.includes('orbit')
      if (wantsIsolate) {
        _isolateOrbits = true
      }

      notify()

      // Ensure worker is running
      if (!_worker) {
        createWorker()
        syncElementsToWorker()
        startWorkerUpdates()
      }

      const viewer = ctx.getViewer()
      if (viewer) {
        setupClickHandler(viewer)
        renderSatellites(viewer)
        const pos = propagate(sat, new Date())
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, sat.altitudeKm * 3000),
          duration: 2.0,
        })
      }

      const isolated = _isolateOrbits ? ' (other orbits hidden)' : ''
      return `Tracking **${sat.name}** (NORAD ${sat.noradId})${isolated}\n${formatSat(sat)}`
    },
  }

  const queryCmd: CommandEntry = {
    id: 'satellite:query',
    name: 'Query satellites',
    module: 'satellite',
    category: 'feature',
    description: 'Search and filter loaded satellites by name, orbit type (LEO/MEO/GEO), or altitude.',
    patterns: [
      'query satellites', 'list satellites', 'search satellites',
      'how many satellites', 'satellite list', 'satellite info',
    ],
    params: [
      { name: 'name', type: 'string', required: false, description: 'Search by name' },
      { name: 'type', type: 'string', required: false, description: 'Filter by orbit type: LEO, MEO, GEO, HEO' },
      { name: 'limit', type: 'number', required: false, description: 'Max results (default 10)' },
    ],
    handler: async (params) => {
      if (_satellites.length === 0) {
        try { await fetchSatellites() } catch { return 'Failed to fetch satellite data' }
      }

      let results = [..._satellites]

      if (params.name) {
        const q = String(params.name).toLowerCase()
        results = results.filter(s => s.name.toLowerCase().includes(q))
      }
      if (params.type) {
        const t = String(params.type).toUpperCase()
        results = results.filter(s => s.orbitType === t)
      }

      // Sort: notable first, then by altitude
      results.sort((a, b) => {
        const aN = NOTABLE[a.noradId] ? 0 : 1
        const bN = NOTABLE[b.noradId] ? 0 : 1
        if (aN !== bN) return aN - bN
        return a.altitudeKm - b.altitudeKm
      })

      const limit = Number(params.limit ?? 10)
      const shown = results.slice(0, limit)

      if (shown.length === 0) return 'No satellites match the given filters.'

      const header = `**${results.length} satellite${results.length !== 1 ? 's' : ''}** found (showing ${shown.length}):\n`
      return header + shown.map((s, i) => formatSat(s, i)).join('\n')
    },
  }

  const isolateCmd: CommandEntry = {
    id: 'satellite:isolate',
    name: 'Isolate satellite orbits',
    module: 'satellite',
    category: 'feature',
    description: 'Toggle showing only the tracked satellite orbit vs all orbits. Automatically shows satellites and tracks ISS if needed. When isolated, only the tracked satellite orbit line is visible.',
    patterns: [
      'isolate orbits', 'hide other orbits', 'show only tracked orbit',
      'show all orbits', 'toggle orbits', 'isolate satellite',
    ],
    params: [
      { name: 'show_all', type: 'boolean', required: false, description: 'If true, show all orbits; if false or omitted, toggle current state' },
    ],
    handler: async (params) => {
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      // Auto-show satellites if not visible
      if (!_visible) {
        _visible = true
        _loading = true
        notify()
        try {
          await fetchSatellites()
          _loading = false

          createWorker()
          syncElementsToWorker()
          startWorkerUpdates()

          renderSatellites(viewer)
          setupClickHandler(viewer)

        } catch {
          _loading = false
          return 'Failed to load satellite data'
        }
      }

      // Auto-track ISS if nothing is tracked (isolate needs a tracked satellite)
      if (!_tracked && params.show_all === undefined) {
        const iss = _satellites.find(s => s.noradId === 25544)
        if (iss) {
          _tracked = iss.noradId
          const pos = propagate(iss, new Date())
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, iss.altitudeKm * 3000),
            duration: 2.0,
          })
        }
      }

      if (params.show_all !== undefined) {
        _isolateOrbits = !params.show_all
      } else {
        _isolateOrbits = !_isolateOrbits
      }
      renderSatellites(viewer)
      notify()
      return _isolateOrbits
        ? 'Showing only tracked satellite orbit. Say "show all orbits" to restore.'
        : 'Showing all satellite orbits.'
    },
  }

  const followCmd: CommandEntry = {
    id: 'satellite:follow',
    name: 'Follow satellite',
    module: 'satellite',
    category: 'feature',
    description: 'Lock the camera directly above a satellite and follow it as it moves. The camera stops following when you navigate (pan, zoom, rotate).',
    patterns: [
      'follow satellite', 'follow iss', 'lock on satellite',
      'camera follow', 'follow from above', 'nadir view satellite',
    ],
    params: [
      { name: 'name', type: 'string', required: false, description: 'Satellite name or NORAD ID (defaults to currently tracked satellite)' },
    ],
    handler: async (params) => {
      if (_satellites.length === 0) {
        try { await fetchSatellites() } catch { return 'Failed to fetch satellite data' }
      }

      let sat: OrbitalElements | undefined

      if (params.name) {
        const query = String(params.name).toLowerCase().trim()
        const noradId = Number(query)
        if (!isNaN(noradId)) sat = _satellites.find(s => s.noradId === noradId)
        if (!sat) sat = _satellites.find(s => s.name.toLowerCase().includes(query))
        if (!sat) {
          for (const [id, alias] of Object.entries(NOTABLE)) {
            if (alias.toLowerCase().includes(query)) {
              sat = _satellites.find(s => s.noradId === Number(id))
              break
            }
          }
        }
      } else if (_tracked) {
        sat = _satellites.find(s => s.noradId === _tracked)
      }

      if (!sat) return 'No satellite to follow. Track one first with "track ISS" or specify a name.'

      _tracked = sat.noradId
      _visible = true
      const viewer = ctx.getViewer()
      if (!viewer) return 'Viewer not available'

      // Ensure worker is running
      if (!_worker) {
        createWorker()
        syncElementsToWorker()
        startWorkerUpdates()
      }

      renderSatellites(viewer)
      setupClickHandler(viewer)
      startFollowing(viewer, sat, ctx)

      return `Following **${sat.name}** from above. Navigate (pan/zoom/scroll) to stop following.`
    },
  }

  return [showCmd, hideCmd, trackCmd, queryCmd, isolateCmd, followCmd]
}

// ── App definition ──

export const satelliteApp: WorldscopeApp = {
  id: 'satellite',
  name: 'Satellite Tracker',
  description: 'Real-time satellite tracking with orbital mechanics (CelesTrak data)',
  autoActivate: true,

  activate: (ctx: AppContext): AppResources => {
    _appCtx = ctx
    return {
      commands: makeCommands(ctx),
      layers: [{
        id: LAYER_ID,
        name: 'Satellites (Orbiting)',
        kind: 'geojson',
        category: 'space',
        description: 'Real-time satellite positions and orbital tracks via CelesTrak',
        defaultOn: false,
        url: 'https://celestrak.org/',
      }],
      welcome: 'Satellite Tracker loaded. Say "show satellites" to display real-time orbital tracks for 100+ satellites including ISS, Hubble, and Tiangong. Say "track ISS" to follow a specific satellite.',
      toolbar: {
        icon: '🛰',
        label: 'Satellites',
        isVisible: () => isSatelliteVisible(),
      },
    }
  },

  deactivate: () => {
    cleanupClickHandler()
    stopFollowing()
    terminateWorker()
    _dataSource?.entities.removeAll()
    _satellites = []
    _cacheTime = 0
    _dataSource = null
    _visible = false
    _tracked = null
    _isolateOrbits = false
    _appCtx = null
    console.log('[satellite] Deactivated')
  },
}
