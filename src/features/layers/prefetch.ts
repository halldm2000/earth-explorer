/**
 * Temporal tile prefetch engine for GIBS imagery layers.
 *
 * When the user views a temporal layer at date D, this module prefetches
 * imagery for adjacent dates (D-1, D+1, etc.) as hidden Cesium imagery layers.
 * When the user scrubs to a prefetched date, the cached layer is swapped in
 * instantly instead of waiting for a full tile reload.
 *
 * Memory management: keeps a configurable window of prefetched dates per layer.
 * The oldest entries are evicted when the window fills up.
 */

import * as Cesium from 'cesium'
import { getViewer } from '@/scene/engine'
import type { LiveLayer } from './types'

// ── Configuration ──

/** Maximum number of prefetched dates to keep per layer (idle mode). */
const MAX_PREFETCH_WINDOW_IDLE = 3

/** Maximum number of prefetched dates to keep per layer (playback mode). */
const MAX_PREFETCH_WINDOW_PLAYBACK = 10

/** Dates to prefetch relative to the current date when idle (offsets in days). */
const PREFETCH_OFFSETS_IDLE = [-1, 1]

/** Dates to prefetch ahead in the playback direction (offsets 1..8). */
const PREFETCH_OFFSETS_FORWARD = [1, 2, 3, 4, 5, 6, 7, 8]
const PREFETCH_OFFSETS_BACKWARD = [-1, -2, -3, -4, -5, -6, -7, -8]

/** Ready timeout: coarse LOD tiles load fast enough for animation. */
const PREFETCH_READY_TIMEOUT_MS = 1500

// ── Types ──

interface PrefetchedEntry {
  date: string
  imageryLayer: Cesium.ImageryLayer
  ready: boolean
}

/** Per-layer prefetch cache, keyed by layer ID. */
const _cache = new Map<string, PrefetchedEntry[]>()

/** Active prefetch abort controllers, keyed by `${layerId}:${date}`. */
const _pending = new Map<string, AbortController>()

// ── Playback state ──

let _playbackDirection: 0 | 1 | -1 = 0  // 0=idle, 1=forward, -1=backward
let _playbackSpeedMs: number = 1500

/** Update playback state so the prefetch engine can adapt its strategy. */
export function setPlaybackState(direction: 0 | 1 | -1, speedMs: number): void {
  _playbackDirection = direction
  _playbackSpeedMs = speedMs
}

/** Get the current playback direction (0=idle, 1=forward, -1=backward). */
export function getPlaybackDirection(): 0 | 1 | -1 { return _playbackDirection }

// ── Loading progress tracking ──

let _loadingCount = 0
let _totalCount = 0
let _onProgressChange: ((loading: number, total: number) => void) | null = null

/** Register a callback for loading progress changes. */
export function onPrefetchProgress(
  cb: (loading: number, total: number) => void,
): () => void {
  _onProgressChange = cb
  return () => { _onProgressChange = null }
}

function updateProgress(delta: number): void {
  _loadingCount = Math.max(0, _loadingCount + delta)
  _onProgressChange?.(_loadingCount, _totalCount)
}

// ── Date helpers ──

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // noon UTC avoids timezone boundary issues
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// ── Core API ──

/**
 * Check if we have a ready prefetched layer for the given date.
 * Returns the cached Cesium.ImageryLayer if available, or undefined.
 */
export function getPrefetchedLayer(
  layerId: string,
  date: string,
): Cesium.ImageryLayer | undefined {
  const entries = _cache.get(layerId)
  if (!entries) return undefined
  const entry = entries.find(e => e.date === date && e.ready)
  return entry?.imageryLayer
}

/**
 * Check if a specific date is ready (prefetched and tiles loaded) for a layer.
 */
export function isPrefetchReady(layerId: string, date: string): boolean {
  const entries = _cache.get(layerId)
  return entries?.some(e => e.date === date && e.ready) ?? false
}

/**
 * Consume a prefetched layer: removes it from the cache and returns it.
 * The caller takes ownership of the Cesium.ImageryLayer (must manage its lifecycle).
 */
export function consumePrefetchedLayer(
  layerId: string,
  date: string,
): Cesium.ImageryLayer | undefined {
  const entries = _cache.get(layerId)
  if (!entries) return undefined

  const idx = entries.findIndex(e => e.date === date && e.ready)
  if (idx === -1) return undefined

  const [entry] = entries.splice(idx, 1)
  if (entries.length === 0) _cache.delete(layerId)

  return entry.imageryLayer
}

/**
 * Prefetch adjacent dates for all given temporal layers at the specified date.
 * Creates hidden imagery layers (alpha=0) that load tiles in the background.
 *
 * Playback-aware: when playing forward, prefetches 8 dates ahead; when playing
 * backward, prefetches 8 dates behind. When idle, prefetches D-1 and D+1.
 */
export function prefetchAdjacentDates(
  layers: LiveLayer[],
  currentDate: string,
): void {
  const viewer = getViewer()
  if (!viewer) return

  // Choose offsets and window based on playback state
  let offsets: number[]
  if (_playbackDirection === 1) {
    offsets = PREFETCH_OFFSETS_FORWARD
  } else if (_playbackDirection === -1) {
    offsets = PREFETCH_OFFSETS_BACKWARD
  } else {
    offsets = PREFETCH_OFFSETS_IDLE
  }

  for (const layer of layers) {
    if (!layer.def.temporal || layer.def.kind !== 'imagery' || !layer.def.imageryProvider) {
      continue
    }

    // During playback, evict dates behind the playback direction first
    if (_playbackDirection !== 0) {
      evictBehindPlayback(layer.def.id, currentDate, viewer)
    }

    // Fire all prefetch requests in parallel (non-blocking)
    for (const offset of offsets) {
      const targetDate = shiftDate(currentDate, offset)
      prefetchDate(layer, targetDate, viewer)
    }
  }
}

/**
 * Prefetch a single date for a single layer.
 * Skips if already cached or already being fetched.
 */
function prefetchDate(
  layer: LiveLayer,
  date: string,
  viewer: Cesium.Viewer,
): void {
  const layerId = layer.def.id
  const cacheKey = `${layerId}:${date}`

  // Already cached?
  const entries = _cache.get(layerId) ?? []
  if (entries.some(e => e.date === date)) return

  // Already fetching?
  if (_pending.has(cacheKey)) return

  // Evict oldest if cache is full
  evictIfNeeded(layerId, viewer)

  const abort = new AbortController()
  _pending.set(cacheKey, abort)

  _totalCount++
  _loadingCount++
  _onProgressChange?.(_loadingCount, _totalCount)

  // Async: create provider and add hidden layer
  void (async () => {
    try {
      if (abort.signal.aborted) return

      // Temporarily override the date returned by getGlobalDate() so the
      // provider factory creates tiles for the target date, not the current one.
      // Uses setDateOverride (not setGlobalDate) to avoid mutating the real
      // global date or the _dateExplicitlySet flag.
      const { setDateOverride } = await import('@/data/gibs-layer-factory')
      setDateOverride(date)

      const result = layer.def.imageryProvider!()
      const provider = result instanceof Promise ? await result : result

      // Clear the override immediately after provider creation
      setDateOverride(null)

      if (!provider || abort.signal.aborted) return

      // Suppress 404 errors
      provider.errorEvent.addEventListener((err: any) => {
        err.retry = false
      })

      // Add as a completely hidden layer
      const imageryLayer = viewer.imageryLayers.addImageryProvider(provider)
      imageryLayer.alpha = 0
      imageryLayer.show = false

      if (abort.signal.aborted) {
        viewer.imageryLayers.remove(imageryLayer, true)
        return
      }

      const entry: PrefetchedEntry = {
        date,
        imageryLayer,
        ready: false,
      }

      // Add to cache
      const layerEntries = _cache.get(layerId) ?? []
      layerEntries.push(entry)
      _cache.set(layerId, layerEntries)

      // Wait for tiles to load in the background
      await waitForPrefetchTiles(viewer, abort.signal, PREFETCH_READY_TIMEOUT_MS)

      if (abort.signal.aborted) {
        // Clean up if aborted during tile loading
        const updatedEntries = _cache.get(layerId)
        if (updatedEntries) {
          const idx = updatedEntries.indexOf(entry)
          if (idx !== -1) updatedEntries.splice(idx, 1)
          if (updatedEntries.length === 0) _cache.delete(layerId)
        }
        viewer.imageryLayers.remove(imageryLayer, true)
        return
      }

      entry.ready = true
    } catch {
      // Silently fail — prefetch is best-effort
    } finally {
      _pending.delete(cacheKey)
      updateProgress(-1)
    }
  })()
}

/**
 * Evict the oldest cache entry if the cache is at capacity.
 */
function evictIfNeeded(layerId: string, viewer: Cesium.Viewer): void {
  const maxWindow = _playbackDirection !== 0
    ? MAX_PREFETCH_WINDOW_PLAYBACK
    : MAX_PREFETCH_WINDOW_IDLE
  const entries = _cache.get(layerId)
  if (!entries || entries.length < maxWindow) return

  // Remove the oldest entry
  const oldest = entries.shift()!
  viewer.imageryLayers.remove(oldest.imageryLayer, true)
}

/**
 * During playback, evict cached dates that are behind the current position
 * relative to the playback direction. This frees cache slots for upcoming dates.
 */
function evictBehindPlayback(
  layerId: string,
  currentDate: string,
  viewer: Cesium.Viewer,
): void {
  const entries = _cache.get(layerId)
  if (!entries) return

  const toEvict: number[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    // Forward playback: evict dates before current
    // Backward playback: evict dates after current
    if (_playbackDirection === 1 && entry.date < currentDate) {
      toEvict.push(i)
    } else if (_playbackDirection === -1 && entry.date > currentDate) {
      toEvict.push(i)
    }
  }

  // Remove in reverse index order to avoid shifting
  for (let i = toEvict.length - 1; i >= 0; i--) {
    const idx = toEvict[i]
    const [entry] = entries.splice(idx, 1)
    viewer.imageryLayers.remove(entry.imageryLayer, true)
  }

  if (entries.length === 0) _cache.delete(layerId)
}

/**
 * Wait for globe tiles to finish loading (prefetch variant with longer timeout).
 */
function waitForPrefetchTiles(
  viewer: Cesium.Viewer,
  signal: AbortSignal,
  maxMs: number,
): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now()
    let frameCount = 0

    const check = () => {
      if (signal.aborted) { resolve(); return }

      frameCount++
      const elapsed = performance.now() - start

      if (frameCount >= 5 && viewer.scene.globe.tilesLoaded) {
        resolve()
        return
      }

      if (elapsed >= maxMs) {
        resolve()
        return
      }

      requestAnimationFrame(check)
    }

    requestAnimationFrame(check)
  })
}

/**
 * Cancel all pending prefetches for a specific layer.
 */
export function cancelPrefetches(layerId: string): void {
  for (const [key, abort] of _pending) {
    if (key.startsWith(`${layerId}:`)) {
      abort.abort()
      _pending.delete(key)
    }
  }
}

/**
 * Cancel all pending prefetches and clear the entire cache.
 */
export function clearAllPrefetches(): void {
  const viewer = getViewer()

  // Cancel all pending
  for (const abort of _pending.values()) {
    abort.abort()
  }
  _pending.clear()

  // Remove all cached imagery layers
  if (viewer) {
    for (const entries of _cache.values()) {
      for (const entry of entries) {
        viewer.imageryLayers.remove(entry.imageryLayer, true)
      }
    }
  }
  _cache.clear()

  _loadingCount = 0
  _totalCount = 0
  _onProgressChange?.(0, 0)
}

/**
 * Get cache stats for debugging / UI display.
 */
export function getPrefetchStats(): {
  cachedDates: number
  pendingFetches: number
  layerIds: string[]
} {
  let cachedDates = 0
  for (const entries of _cache.values()) {
    cachedDates += entries.filter(e => e.ready).length
  }
  return {
    cachedDates,
    pendingFetches: _pending.size,
    layerIds: Array.from(_cache.keys()),
  }
}
