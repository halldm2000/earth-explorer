/**
 * Orbit Propagation Web Worker
 *
 * Offloads Keplerian orbit math from the main thread. Receives orbital
 * elements and time parameters, returns geodetic {lat, lon, alt} arrays.
 * No Cesium imports — pure math only.
 */

// ── Constants ──

const MU = 398600.4418   // Earth gravitational parameter (km^3/s^2)
const RE = 6371.0         // Earth mean radius (km)
const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI

// ── Types (mirrored from main thread, kept minimal) ──

export interface OrbitalElementsWire {
  name: string
  noradId: number
  epoch: number           // ms since Unix epoch
  meanMotion: number      // revolutions per day
  eccentricity: number
  inclination: number     // degrees
  raan: number            // degrees
  argPerigee: number      // degrees
  meanAnomaly: number     // degrees
  semiMajorAxis: number   // km
  period: number          // seconds
  altitudeKm: number
  orbitType: string
}

export interface GeoPosition {
  lat: number
  lon: number
  alt: number
}

/** Messages sent TO the worker */
export type WorkerRequest =
  | { type: 'set-elements'; elements: OrbitalElementsWire[] }
  | { type: 'propagate-all'; timeMs: number }
  | { type: 'compute-trails'; timeMs: number; satellites: TrailRequest[] }

export interface TrailRequest {
  noradId: number
  numPoints: number
  trailFraction: number   // fraction of period for trail duration (e.g. 0.75)
}

/** Messages sent FROM the worker */
export type WorkerResponse =
  | { type: 'positions'; timeMs: number; positions: Map_Position[] }
  | { type: 'trails'; timeMs: number; trails: Map_Trail[] }

export interface Map_Position {
  noradId: number
  lat: number
  lon: number
  alt: number
}

export interface Map_Trail {
  noradId: number
  points: GeoPosition[]
}

// ── Orbital mechanics (self-contained, no Cesium) ──

function solveKepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 30; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
    E += dE
    if (Math.abs(dE) < 1e-10) break
  }
  return E
}

function gmst(timeMs: number): number {
  const JD = timeMs / 86400000 + 2440587.5
  const T = (JD - 2451545.0) / 36525.0
  const theta = 280.46061837 + 360.98564736629 * (JD - 2451545.0) +
    T * T * (0.000387933 - T / 38710000)
  return ((theta % 360 + 360) % 360) * DEG
}

function propagate(elem: OrbitalElementsWire, timeMs: number): GeoPosition {
  const n = elem.meanMotion * TWO_PI / 86400
  const a = elem.semiMajorAxis
  const e = elem.eccentricity
  const dt = (timeMs - elem.epoch) / 1000

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

  const g = gmst(timeMs)
  const cosG = Math.cos(g), sinG = Math.sin(g)
  const xECEF = xECI * cosG + yECI * sinG
  const yECEF = -xECI * sinG + yECI * cosG
  const zECEF = zECI

  const lon = Math.atan2(yECEF, xECEF) / DEG
  const lat = Math.atan2(zECEF, Math.sqrt(xECEF * xECEF + yECEF * yECEF)) / DEG
  const alt = Math.sqrt(xECEF * xECEF + yECEF * yECEF + zECEF * zECEF) - RE

  return { lat, lon, alt }
}

// ── Worker state ──

let elements: OrbitalElementsWire[] = []
const elemMap = new Map<number, OrbitalElementsWire>()

// Worker global scope — typed for postMessage
declare const self: DedicatedWorkerGlobalScope

// ── Message handler ──

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  switch (msg.type) {
    case 'set-elements': {
      elements = msg.elements
      elemMap.clear()
      for (const e of elements) {
        elemMap.set(e.noradId, e)
      }
      break
    }

    case 'propagate-all': {
      const positions: Map_Position[] = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i]
        const pos = propagate(elem, msg.timeMs)
        positions[i] = { noradId: elem.noradId, lat: pos.lat, lon: pos.lon, alt: pos.alt }
      }
      const posResponse: WorkerResponse = {
        type: 'positions',
        timeMs: msg.timeMs,
        positions,
      }
      self.postMessage(posResponse)
      break
    }

    case 'compute-trails': {
      const trails: Map_Trail[] = new Array(msg.satellites.length)
      for (let s = 0; s < msg.satellites.length; s++) {
        const req = msg.satellites[s]
        const elem = elemMap.get(req.noradId)
        if (!elem) {
          trails[s] = { noradId: req.noradId, points: [] }
          continue
        }

        const trailDuration = elem.period * req.trailFraction * 1000 // ms
        const nPoints = req.numPoints
        const points: GeoPosition[] = new Array(nPoints + 1)
        const startMs = msg.timeMs - trailDuration

        for (let j = 0; j <= nPoints; j++) {
          const t = startMs + (j / nPoints) * trailDuration
          const pos = propagate(elem, t)
          points[j] = pos
        }

        trails[s] = { noradId: req.noradId, points }
      }
      const trailResponse: WorkerResponse = {
        type: 'trails',
        timeMs: msg.timeMs,
        trails,
      }
      self.postMessage(trailResponse)
      break
    }
  }
}
