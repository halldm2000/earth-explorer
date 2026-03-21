/**
 * Flight Data Processing Web Worker
 *
 * Offloads JSON parsing, state vector iteration, diff computation,
 * and altitude color calculation from the main thread so the Cesium
 * render loop stays within 16 ms frame budget.
 */

// ── Constants (mirrored from main module) ──

const MAX_AIRCRAFT = 6000
const FT_PER_METER = 3.28084

// ── Types ──

export interface AircraftData {
  icao24: string
  callsign: string
  country: string
  lat: number
  lon: number
  altitude: number   // meters
  velocity: number   // m/s
  heading: number    // degrees clockwise from north
  verticalRate: number
  onGround: false
  /** RGBA color components [r, g, b, a] for altitude band */
  color: [number, number, number, number]
}

export interface FlightDiff {
  /** Aircraft to add (new icao24 not previously known) */
  add: AircraftData[]
  /** Aircraft to update (icao24 already exists) */
  update: AircraftData[]
  /** icao24 keys to remove (no longer in feed) */
  remove: string[]
  /** Timestamp of the processing */
  timestamp: number
}

export type WorkerRequest =
  | { type: 'process'; states: any[][]; knownIcaos: string[] }

export type WorkerResponse =
  | { type: 'result'; diff: FlightDiff }
  | { type: 'error'; message: string }

// ── Altitude color (pure math, no Cesium dependency) ──

function altitudeColorRGBA(altMeters: number): [number, number, number, number] {
  const altFt = altMeters * FT_PER_METER
  if (altFt < 5000)  return [0.2, 0.9, 0.3, 0.85]   // green  - low/approach
  if (altFt < 15000) return [0.9, 0.85, 0.2, 0.85]   // yellow - climbing
  if (altFt < 30000) return [0.3, 0.8, 1.0, 0.85]    // cyan   - mid-cruise
  if (altFt < 40000) return [0.7, 0.85, 1.0, 0.85]   // light blue - cruise
  return [0.95, 0.95, 1.0, 0.85]                      // white  - high altitude
}

// ── Parse OpenSky state vectors ──
// Indices: 0=icao24, 1=callsign, 2=origin_country, 5=lon, 6=lat,
//          7=baro_altitude, 8=on_ground, 9=velocity, 10=true_track,
//          11=vertical_rate, 13=geo_altitude

function parseStates(states: any[][]): AircraftData[] {
  const aircraft: AircraftData[] = []
  for (const s of states) {
    if (s[8] as boolean) continue // skip ground traffic

    const lat = s[6] as number | null
    const lon = s[5] as number | null
    const alt = (s[7] as number | null) ?? (s[13] as number | null)
    if (lat == null || lon == null || alt == null) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    aircraft.push({
      icao24: String(s[0] || '').trim(),
      callsign: String(s[1] || '').trim(),
      country: String(s[2] || ''),
      lat,
      lon,
      altitude: alt,
      velocity: (s[9] as number) || 0,
      heading: (s[10] as number) || 0,
      verticalRate: (s[11] as number) || 0,
      onGround: false,
      color: altitudeColorRGBA(alt),
    })

    if (aircraft.length >= MAX_AIRCRAFT) break
  }
  return aircraft
}

// ── Diff computation ──

function computeDiff(aircraft: AircraftData[], knownIcaos: string[]): FlightDiff {
  const knownSet = new Set(knownIcaos)
  const newSet = new Set<string>()

  const add: AircraftData[] = []
  const update: AircraftData[] = []

  for (const ac of aircraft) {
    newSet.add(ac.icao24)
    if (knownSet.has(ac.icao24)) {
      update.push(ac)
    } else {
      add.push(ac)
    }
  }

  const remove: string[] = []
  for (const icao of knownIcaos) {
    if (!newSet.has(icao)) {
      remove.push(icao)
    }
  }

  return { add, update, remove, timestamp: Date.now() }
}

// ── Message handler ──

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'process') {
      const aircraft = parseStates(msg.states)
      const diff = computeDiff(aircraft, msg.knownIcaos)
      const response: WorkerResponse = { type: 'result', diff }
      postMessage(response)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const response: WorkerResponse = { type: 'error', message }
    postMessage(response)
  }
}
