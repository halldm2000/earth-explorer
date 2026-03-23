import * as Cesium from 'cesium'
import { getViewer } from '@/scene/engine'
import type { LayerDef, LiveLayer, GeoJsonStyle, LayerProperties, GeoJsonProperties } from './types'
import { DEFAULT_LAYER_PROPERTIES, DEFAULT_GEOJSON_PROPERTIES } from './types'
import { getSource } from '@/sources/catalog'
import { createImageryProvider, createGeoJsonDataSource } from '@/sources/provider-factory'
import { isGeoJsonSource } from '@/sources/types'
import { consumePrefetchedLayer, cancelPrefetches, clearAllPrefetches } from './prefetch'

/**
 * Layer manager: loads, shows, hides, and tracks all data layers.
 * Lazy-loads GeoJSON on first toggle (no upfront fetch for layers that stay off).
 */

const _layers = new Map<string, LiveLayer>()

/** Bump the Zustand layerRevision counter so React re-renders. Lazy import avoids circular deps. */
function notifyUI(): void {
  import('@/store').then(({ useStore }) => {
    useStore.getState().bumpLayerRevision()
  }).catch(() => {})
}

// ── Registration ──

export function registerLayer(def: LayerDef): void {
  if (_layers.has(def.id)) return
  const layer: LiveLayer = { def, visible: false, properties: { ...DEFAULT_LAYER_PROPERTIES } }
  // Initialize GeoJSON properties from the layer definition's style
  if (def.kind === 'geojson') {
    layer.geoJsonProperties = {
      strokeColor: def.style?.stroke ?? DEFAULT_GEOJSON_PROPERTIES.strokeColor,
      strokeWidth: def.style?.strokeWidth ?? DEFAULT_GEOJSON_PROPERTIES.strokeWidth,
      alpha: DEFAULT_GEOJSON_PROPERTIES.alpha,
    }
  }
  _layers.set(def.id, layer)
}

export function getLayer(id: string): LiveLayer | undefined {
  return _layers.get(id)
}

export function getAllLayers(): LiveLayer[] {
  return Array.from(_layers.values())
}

export function getLayersByCategory(category: string): LiveLayer[] {
  return getAllLayers().filter(l => l.def.category === category)
}

// ── Properties ──

/** Apply visual properties from a LiveLayer onto its Cesium ImageryLayer. */
function applyProperties(layer: LiveLayer): void {
  if (!layer.imageryLayer) return
  const p = layer.properties
  layer.imageryLayer.alpha = p.alpha
  layer.imageryLayer.brightness = p.brightness
  layer.imageryLayer.contrast = p.contrast
  layer.imageryLayer.saturation = p.saturation
  layer.imageryLayer.hue = p.hue
  layer.imageryLayer.gamma = p.gamma
  if (p.colorToAlpha?.enabled && p.colorToAlpha.color) {
    layer.imageryLayer.colorToAlpha = Cesium.Color.fromCssColorString(p.colorToAlpha.color)
    layer.imageryLayer.colorToAlphaThreshold = p.colorToAlpha.threshold
  } else {
    ;(layer.imageryLayer as any).colorToAlpha = undefined
  }
}

// ── Toggle ──

export async function showLayer(id: string): Promise<boolean> {
  const layer = _layers.get(id)
  if (!layer) return false
  const viewer = getViewer()
  if (!viewer) return false

  // Lazy-load on first show
  if (layer.def.kind === 'geojson' && !layer.datasource) {
    await loadGeoJson(layer, viewer)
  }
  if (layer.def.kind === 'imagery' && !layer.imageryLayer) {
    await loadImagery(layer, viewer)
  }

  // Apply visual properties to imagery layers (ensures they survive hide/show cycles)
  applyProperties(layer)

  // Make visible
  if (layer.datasource) layer.datasource.show = true
  if (layer.imageryLayer) layer.imageryLayer.show = true
  if (layer.tileset) layer.tileset.show = true
  layer.visible = true
  notifyUI()
  return true
}

export function hideLayer(id: string): boolean {
  const layer = _layers.get(id)
  if (!layer) return false

  if (layer.datasource) layer.datasource.show = false
  if (layer.imageryLayer) layer.imageryLayer.show = false
  if (layer.tileset) layer.tileset.show = false
  layer.visible = false
  notifyUI()
  return true
}

export async function toggleLayer(id: string): Promise<boolean> {
  const layer = _layers.get(id)
  if (!layer) return false
  if (layer.visible) {
    hideLayer(id)
  } else {
    await showLayer(id)
  }
  return true
}

// ── Reload (remove + re-fetch, re-running styleEntities) ──

export async function reloadLayer(id: string): Promise<boolean> {
  const layer = _layers.get(id)
  if (!layer) return false
  const viewer = getViewer()
  if (!viewer) return false

  // Remove existing datasource/imagery
  if (layer.datasource) {
    viewer.dataSources.remove(layer.datasource, true)
    layer.datasource = undefined
  }
  if (layer.imageryLayer) {
    viewer.imageryLayers.remove(layer.imageryLayer, true)
    layer.imageryLayer = undefined
  }

  // Re-load and show
  return showLayer(id)
}

// ── Double-buffered reload (inspired by e2-healpix-viewer) ──
//
// Instead of remove→add (which blanks the globe), this keeps the old layer
// visible while the new one loads underneath. Once new tiles arrive, it
// swaps instantly. Abort tokens let rapid scrubbing cancel stale swaps.

/** Active abort controllers for pending buffered reloads, keyed by layer ID. */
const _pendingSwaps = new Map<string, AbortController>()

/**
 * Reload an imagery layer without blanking the globe.
 * Adds the new layer behind the old one, waits for tiles to load,
 * then removes the old layer. Cancels any previous pending swap.
 */
export async function reloadLayerBuffered(id: string): Promise<boolean> {
  const layer = _layers.get(id)
  if (!layer) return false
  const viewer = getViewer()
  if (!viewer) return false

  // Only imagery layers with a provider factory can be double-buffered
  if (layer.def.kind !== 'imagery' || !layer.def.imageryProvider || !layer.imageryLayer) {
    return reloadLayer(id)
  }

  // Cancel any pending swap for this layer
  const prev = _pendingSwaps.get(id)
  if (prev) prev.abort()

  const abort = new AbortController()
  _pendingSwaps.set(id, abort)

  const oldImagery = layer.imageryLayer

  try {
    // Create new provider with the updated date/params
    const result = layer.def.imageryProvider()
    const provider = result instanceof Promise ? await result : result
    if (!provider || abort.signal.aborted) return false

    // Suppress 404s on the new provider (same as loadImagery)
    suppressTileErrors(provider)

    // Add new layer — initially near-invisible so tiles start loading
    const newImagery = viewer.imageryLayers.addImageryProvider(provider)
    newImagery.alpha = 0.001
    newImagery.show = true

    // Copy visual properties from current layer state
    const p = layer.properties
    newImagery.brightness = p.brightness
    newImagery.contrast = p.contrast
    newImagery.saturation = p.saturation
    newImagery.hue = p.hue
    newImagery.gamma = p.gamma

    // Wait for new tiles to load (or timeout)
    // Use shorter timeout during playback for smoother animation
    await waitForTiles(viewer, abort.signal, 800)

    if (abort.signal.aborted) {
      // A newer reload superseded us — clean up the new layer we created
      viewer.imageryLayers.remove(newImagery, true)
      return false
    }

    // Swap: show new layer at full opacity, wait one frame, then remove old
    // This prevents a flash where neither layer is visible
    newImagery.alpha = p.alpha
    layer.imageryLayer = newImagery

    // Defer old layer removal to next render frame
    await new Promise<void>(r => requestAnimationFrame(() => {
      viewer.imageryLayers.remove(oldImagery, true)
      r()
    }))

    return true
  } catch {
    return false
  } finally {
    // Clean up abort controller if we're still the active one
    if (_pendingSwaps.get(id) === abort) {
      _pendingSwaps.delete(id)
    }
  }
}

/**
 * Prefetch-aware buffered reload for temporal imagery layers.
 *
 * Checks if the target date already exists in the prefetch cache. If so,
 * swaps instantly (no network wait). Otherwise falls back to the standard
 * double-buffered reload.
 *
 * @param targetDate — the YYYY-MM-DD date to reload for (used to look up prefetch cache)
 */
export async function reloadLayerBufferedWithPrefetch(
  id: string,
  targetDate: string,
): Promise<boolean> {
  const layer = _layers.get(id)
  if (!layer) return false
  const viewer = getViewer()
  if (!viewer) return false

  // Only imagery layers can use the prefetch path
  if (layer.def.kind !== 'imagery' || !layer.imageryLayer) {
    return reloadLayerBuffered(id)
  }

  // Check the prefetch cache
  const cached = consumePrefetchedLayer(id, targetDate)
  if (cached) {
    // Cancel any pending buffered reload for this layer
    const prev = _pendingSwaps.get(id)
    if (prev) prev.abort()

    const oldImagery = layer.imageryLayer

    // Apply visual properties to the cached layer
    const p = layer.properties
    cached.alpha = p.alpha
    cached.brightness = p.brightness
    cached.contrast = p.contrast
    cached.saturation = p.saturation
    cached.hue = p.hue
    cached.gamma = p.gamma
    if (p.colorToAlpha?.enabled && p.colorToAlpha.color) {
      cached.colorToAlpha = Cesium.Color.fromCssColorString(p.colorToAlpha.color)
      cached.colorToAlphaThreshold = p.colorToAlpha.threshold
    }
    cached.show = true
    layer.imageryLayer = cached

    // Defer old layer removal to next render frame to prevent flash
    await new Promise<void>(r => requestAnimationFrame(() => {
      viewer.imageryLayers.remove(oldImagery, true)
      r()
    }))

    return true
  }

  // No prefetch hit — fall back to standard double-buffered reload
  return reloadLayerBuffered(id)
}

/**
 * Wait for globe tiles to finish loading, or abort/timeout.
 * Uses requestAnimationFrame polling with a minimum initial delay
 * to give the new imagery provider time to issue tile requests.
 */
function waitForTiles(
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

      // Minimum 3 frames (let provider issue requests), then check tilesLoaded
      if (frameCount >= 3 && viewer.scene.globe.tilesLoaded) {
        resolve()
        return
      }

      // Timeout: swap regardless
      if (elapsed >= maxMs) {
        resolve()
        return
      }

      requestAnimationFrame(check)
    }

    requestAnimationFrame(check)
  })
}

// ── Cleanup ──

export function removeLayer(id: string): void {
  const layer = _layers.get(id)
  if (!layer) return
  const viewer = getViewer()
  // Cancel any pending prefetches for this layer
  cancelPrefetches(id)
  if (layer.datasource && viewer) {
    viewer.dataSources.remove(layer.datasource, true)
  }
  if (layer.imageryLayer && viewer) {
    viewer.imageryLayers.remove(layer.imageryLayer, true)
  }
  if (layer.tileset && viewer) {
    viewer.scene.primitives.remove(layer.tileset)
  }
  _layers.delete(id)
  notifyUI()
}

export function removeAllLayers(): void {
  const viewer = getViewer()
  // Cancel all pending prefetches and clear the cache
  clearAllPrefetches()
  for (const layer of _layers.values()) {
    if (layer.datasource && viewer) {
      viewer.dataSources.remove(layer.datasource, true)
    }
    if (layer.imageryLayer && viewer) {
      viewer.imageryLayers.remove(layer.imageryLayer, true)
    }
    if (layer.tileset && viewer) {
      viewer.scene.primitives.remove(layer.tileset)
    }
  }
  _layers.clear()
  notifyUI()
}

// ── Per-layer property controls ──

/** Set a numeric property on a layer's imagery. Returns false for non-imagery layers. */
export function setLayerProperty(
  id: string,
  prop: keyof Omit<LayerProperties, 'colorToAlpha'>,
  value: number,
): boolean {
  const layer = _layers.get(id)
  if (!layer || layer.def.kind !== 'imagery') return false
  layer.properties[prop] = value
  if (layer.imageryLayer) {
    layer.imageryLayer[prop] = value
  }
  notifyUI()
  return true
}

/** Toggle color-to-alpha on a layer. */
export function setLayerColorToAlpha(
  id: string,
  enabled: boolean,
  color?: string,
  threshold?: number,
): boolean {
  const layer = _layers.get(id)
  if (!layer || layer.def.kind !== 'imagery') return false

  layer.properties.colorToAlpha = {
    enabled,
    color: color ?? layer.properties.colorToAlpha?.color ?? '#000000',
    threshold: threshold ?? layer.properties.colorToAlpha?.threshold ?? 0.004,
  }

  if (layer.imageryLayer) {
    if (enabled && layer.properties.colorToAlpha.color) {
      layer.imageryLayer.colorToAlpha = Cesium.Color.fromCssColorString(
        layer.properties.colorToAlpha.color,
      )
      layer.imageryLayer.colorToAlphaThreshold = layer.properties.colorToAlpha.threshold
    } else {
      ;(layer.imageryLayer as any).colorToAlpha = undefined
    }
  }
  notifyUI()
  return true
}

/** Move an imagery layer to a new position in the stack. Index 0 = bottom (above base map). */
export function reorderLayer(id: string, newIndex: number): boolean {
  const layer = _layers.get(id)
  if (!layer?.imageryLayer) return false
  const viewer = getViewer()
  if (!viewer) return false

  const layers = viewer.imageryLayers
  // Find the current position of this imagery layer
  let currentIndex = -1
  for (let i = 0; i < layers.length; i++) {
    if (layers.get(i) === layer.imageryLayer) {
      currentIndex = i
      break
    }
  }
  if (currentIndex === -1) return false

  // User indices are offset by 1 (index 0 in user space = index 1 in Cesium, since base map is 0)
  const targetCesiumIndex = newIndex + 1
  const clampedTarget = Math.max(1, Math.min(targetCesiumIndex, layers.length - 1))

  if (currentIndex < clampedTarget) {
    for (let i = currentIndex; i < clampedTarget; i++) {
      layers.raise(layer.imageryLayer)
    }
  } else if (currentIndex > clampedTarget) {
    for (let i = currentIndex; i > clampedTarget; i--) {
      layers.lower(layer.imageryLayer)
    }
  }
  notifyUI()
  return true
}

/** Get the ordered list of imagery layer IDs (bottom to top). */
export function getLayerOrder(): string[] {
  const viewer = getViewer()
  if (!viewer) return []

  const layers = viewer.imageryLayers
  const result: string[] = []

  // Skip index 0 (base map), iterate user imagery layers
  for (let i = 1; i < layers.length; i++) {
    const cesiumLayer = layers.get(i)
    // Find the matching LiveLayer by its imageryLayer reference
    for (const [id, live] of _layers) {
      if (live.imageryLayer === cesiumLayer) {
        result.push(id)
        break
      }
    }
  }
  return result
}

/** Get current properties for a layer. */
export function getLayerProperties(id: string): LayerProperties | undefined {
  const layer = _layers.get(id)
  if (!layer) return undefined
  return { ...layer.properties }
}

/** Reset a layer's properties to defaults. */
export function resetLayerProperties(id: string): boolean {
  const layer = _layers.get(id)
  if (!layer) return false
  layer.properties = { ...DEFAULT_LAYER_PROPERTIES }
  applyProperties(layer)
  // Reset GeoJSON properties to original style
  if (layer.def.kind === 'geojson' && layer.geoJsonProperties) {
    layer.geoJsonProperties = {
      strokeColor: layer.def.style?.stroke ?? DEFAULT_GEOJSON_PROPERTIES.strokeColor,
      strokeWidth: layer.def.style?.strokeWidth ?? DEFAULT_GEOJSON_PROPERTIES.strokeWidth,
      alpha: DEFAULT_GEOJSON_PROPERTIES.alpha,
    }
    applyGeoJsonProperties(layer)
  }
  notifyUI()
  return true
}

// ── GeoJSON property controls ──

/** Apply GeoJSON visual properties (color, width, opacity) to all entities in a datasource. */
function applyGeoJsonProperties(layer: LiveLayer): void {
  if (!layer.datasource || !layer.geoJsonProperties) return
  const p = layer.geoJsonProperties
  const baseColor = Cesium.Color.fromCssColorString(p.strokeColor).withAlpha(p.alpha)
  const material = new Cesium.ColorMaterialProperty(baseColor)

  for (const entity of layer.datasource.entities.values) {
    if (entity.polyline) {
      entity.polyline.material = material
      entity.polyline.width = new Cesium.ConstantProperty(p.strokeWidth)
    }
    if (entity.polygon) {
      entity.polygon.outlineColor = new Cesium.ConstantProperty(baseColor)
      entity.polygon.outlineWidth = new Cesium.ConstantProperty(p.strokeWidth)
    }
  }
}

/** Set a GeoJSON property on a layer. Returns false for non-geojson layers. */
export function setGeoJsonProperty(
  id: string,
  prop: keyof GeoJsonProperties,
  value: string | number,
): boolean {
  const layer = _layers.get(id)
  if (!layer || layer.def.kind !== 'geojson' || !layer.geoJsonProperties) return false
  ;(layer.geoJsonProperties as any)[prop] = value
  applyGeoJsonProperties(layer)
  notifyUI()
  return true
}

/** Get current GeoJSON properties for a layer. */
export function getGeoJsonProperties(id: string): GeoJsonProperties | undefined {
  return _layers.get(id)?.geoJsonProperties
}

/** Toggle entity clustering on a GeoJSON layer. Returns false for non-GeoJSON layers. */
export function setLayerClustering(id: string, enabled: boolean): boolean {
  const layer = _layers.get(id)
  if (!layer || !layer.datasource) return false
  layer.datasource.clustering.enabled = enabled
  layer.clusteringEnabled = enabled
  notifyUI()
  return true
}

// ── Internal loaders ──

async function loadGeoJson(layer: LiveLayer, viewer: Cesium.Viewer): Promise<void> {
  const def = layer.def

  // Resolve URL: explicit url field, or look up source from catalog
  let url = def.url
  let clampToGround = true
  if (!url && def.sourceId) {
    const source = getSource(def.sourceId)
    if (source && isGeoJsonSource(source)) {
      url = source.url
      clampToGround = source.clampToGround ?? true
    }
  }
  if (!url) return

  const style = def.style ?? { stroke: '#ffffff', strokeWidth: 1 }

  const ds = await Cesium.GeoJsonDataSource.load(url, {
    stroke: Cesium.Color.fromCssColorString(style.stroke),
    strokeWidth: style.strokeWidth,
    fill: style.fill
      ? Cesium.Color.fromCssColorString(style.fill)
      : Cesium.Color.TRANSPARENT,
    clampToGround,
  })

  // Override entity materials for consistent look (GeoJsonDataSource
  // sometimes ignores the constructor options for polylines)
  // Use current geoJsonProperties if available, otherwise fall back to def.style
  const p = layer.geoJsonProperties
  const color = p
    ? Cesium.Color.fromCssColorString(p.strokeColor).withAlpha(p.alpha)
    : Cesium.Color.fromCssColorString(style.stroke)
  const width = p ? p.strokeWidth : style.strokeWidth
  const material = new Cesium.ColorMaterialProperty(color)

  for (const entity of ds.entities.values) {
    if (entity.polyline) {
      entity.polyline.material = material
      entity.polyline.width = new Cesium.ConstantProperty(width)
    }
    if (entity.polygon) {
      entity.polygon.outlineColor = new Cesium.ConstantProperty(color)
      entity.polygon.outlineWidth = new Cesium.ConstantProperty(width)
      entity.polygon.material = style.fill
        ? new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(style.fill))
        : new Cesium.ColorMaterialProperty(Cesium.Color.TRANSPARENT)
    }
  }

  // Custom entity styling (e.g. earthquake magnitude circles)
  if (def.styleEntities) {
    def.styleEntities(ds.entities)
  }

  // Enable entity clustering for performance with dense point layers
  ds.clustering.enabled = true
  ds.clustering.pixelRange = 45
  ds.clustering.minimumClusterSize = 3
  ds.clustering.clusterBillboards = true
  ds.clustering.clusterLabels = true
  ds.clustering.clusterPoints = true

  // Style cluster labels to show entity count
  ds.clustering.clusterEvent.addEventListener(
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

  layer.clusteringEnabled = true

  viewer.dataSources.add(ds)
  layer.datasource = ds
}

async function loadImagery(layer: LiveLayer, viewer: Cesium.Viewer): Promise<void> {
  const def = layer.def

  let provider: Cesium.ImageryProvider | undefined
  if (def.imageryProvider) {
    // Embedded provider factory — may return a Promise (e.g. Ion assets)
    const result = def.imageryProvider()
    provider = result instanceof Promise ? await result : result
  } else if (def.sourceId) {
    // New: resolve from source catalog
    const source = getSource(def.sourceId)
    if (source && (source.type === 'wmts' || source.type === 'wms' || source.type === 'xyz')) {
      provider = createImageryProvider(source)
    }
  }
  if (!provider) return

  // Suppress tile 404 errors — many sources (especially GIBS) return 404
  // for tiles with no data instead of transparent tiles. Without this,
  // Cesium floods the console with "Failed to obtain image" errors and
  // retries indefinitely, which also blocks tilesLoaded from ever becoming true.
  suppressTileErrors(provider)

  const imageryLayer = viewer.imageryLayers.addImageryProvider(provider)
  layer.imageryLayer = imageryLayer
}

/** Tell Cesium not to retry failed tile requests. Prevents console spam and stalled tile loading. */
function suppressTileErrors(provider: Cesium.ImageryProvider): void {
  provider.errorEvent.addEventListener((err: any) => {
    err.retry = false
  })
}
