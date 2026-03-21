/**
 * Vite plugin: AISStream WebSocket→HTTP bridge.
 *
 * Connects to AISStream.io from the Node.js dev server (bypassing
 * browser WebSocket restrictions / corporate firewalls) and serves
 * accumulated vessel positions via a local HTTP endpoint that the
 * browser can poll with regular fetch().
 *
 * Endpoints:
 *   GET /__ais/locations  — JSON array of current vessel positions
 *   GET /__ais/status     — connection status + vessel count
 */

import type { Plugin } from 'vite'
import { WebSocket } from 'ws'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const AISSTREAM_WS = 'wss://stream.aisstream.io/v0/stream'
const STALE_TIMEOUT = 1_800_000 // 30 min — prune stale entries

interface AISVessel {
  mmsi: number
  name: string
  lat: number
  lon: number
  sog: number
  cog: number
  heading: number
  navStatus: number
  timestamp: number
}

export function aisBridgePlugin(): Plugin {
  const ships = new Map<number, AISVessel>()
  let ws: WebSocket | null = null
  let connected = false
  let error: string | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  return {
    name: 'ais-bridge',
    apply: 'serve', // dev mode only

    configureServer(server) {
      // Read API key directly from .env (process.env may not be loaded yet)
      let apiKey = process.env.VITE_AISSTREAM_API_KEY
      if (!apiKey) {
        try {
          const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
          const match = envFile.match(/^VITE_AISSTREAM_API_KEY=(.+)$/m)
          apiKey = match?.[1]?.trim()
        } catch { /* no .env file */ }
      }
      if (!apiKey) {
        console.log('[AIS Bridge] No VITE_AISSTREAM_API_KEY in .env, bridge inactive')
        return
      }
      console.log('[AIS Bridge] API key found, starting bridge...')

      // ── WebSocket connection to AISStream ──

      function connect() {
        if (ws) { ws.close(); ws = null }

        console.log('[AIS Bridge] Connecting to AISStream...')
        ws = new WebSocket(AISSTREAM_WS)

        ws.on('open', () => {
          console.log('[AIS Bridge] Connected! Subscribing to global AIS...')
          connected = true
          error = null

          ws!.send(JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [[[-90, -180], [90, 180]]],
            FilterMessageTypes: [
              'PositionReport',                    // Class A (types 1,2,3)
              'StandardClassBPositionReport',       // Class B (type 18)
              'ExtendedClassBPositionReport',       // Class B extended (type 19)
            ],
          }))
        })

        ws.on('message', (raw) => {
          try {
            const data = JSON.parse(raw.toString())

            if (data.error || data.ERROR) {
              error = String(data.error || data.ERROR)
              console.error('[AIS Bridge] Server error:', error)
              return
            }

            const meta = data.MetaData
            if (!meta) return

            // Extract position data from whichever message type arrived
            const msg = data.Message
            const pos = msg?.PositionReport
              || msg?.StandardClassBPositionReport
              || msg?.ExtendedClassBPositionReport
              || msg?.LongRangeAISBroadcastMessage
            if (!pos) return

            const mmsi = meta.MMSI as number
            const lat = (pos.Latitude ?? meta.latitude) as number
            const lon = (pos.Longitude ?? meta.longitude) as number
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
            if (lat === 0 && lon === 0) return

            const rawHeading = (pos.TrueHeading ?? pos.Heading ?? 511) as number
            const cog = (pos.Cog ?? pos.CourseOverGround ?? 0) as number
            const heading = rawHeading === 511 ? cog : rawHeading

            ships.set(mmsi, {
              mmsi,
              name: String(meta.ShipName || '').trim(),
              lat,
              lon,
              sog: (pos.Sog ?? pos.SpeedOverGround ?? 0) as number,
              cog,
              heading: Number.isFinite(heading) ? heading : 0,
              navStatus: (pos.NavigationalStatus ?? pos.NavStatus ?? 15) as number,
              timestamp: Date.now(),
            })

            // Log milestones
            if (ships.size <= 10 || ships.size % 500 === 0) {
              console.log(`[AIS Bridge] ${ships.size} vessels tracked`)
            }
          } catch {
            // ignore individual parse errors
          }
        })

        ws.on('error', (err) => {
          console.warn('[AIS Bridge] WebSocket error:', err.message)
          error = err.message
          connected = false
        })

        ws.on('close', () => {
          console.log('[AIS Bridge] WebSocket closed, reconnecting in 5s...')
          connected = false
          ws = null
          reconnectTimer = setTimeout(connect, 5000)
        })
      }

      connect()

      // ── Periodic prune of stale vessels ──

      const pruneInterval = setInterval(() => {
        const now = Date.now()
        for (const [mmsi, v] of ships) {
          if (now - v.timestamp > STALE_TIMEOUT) ships.delete(mmsi)
        }
      }, 60_000)

      // ── HTTP endpoints ──

      server.middlewares.use((req, res, next) => {
        if (req.url === '/__ais/locations') {
          const vessels = [...ships.values()]
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(JSON.stringify({ count: vessels.length, vessels }))
          return
        }

        if (req.url === '/__ais/status') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            connected,
            error,
            vesselCount: ships.size,
            source: 'AISStream.io (global)',
          }))
          return
        }

        next()
      })

      // ── Cleanup ──

      server.httpServer?.on('close', () => {
        clearInterval(pruneInterval)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        if (ws) { ws.close(); ws = null }
      })
    },
  }
}
