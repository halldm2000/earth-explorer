/**
 * Shared viewer reference and scene state.
 * CesiumViewer sets this on init, commands and plugins read it.
 * Avoids fragile window globals.
 */

import * as Cesium from 'cesium'
import type { QualityPreset } from '@/store/quality'
import { setTileCacheBudget } from '@/data/tile-cache'

let _viewer: Cesium.Viewer | null = null

export function setViewer(viewer: Cesium.Viewer | null): void {
  _viewer = viewer
  console.log('[engine] Viewer', viewer ? 'set' : 'cleared')
}

export function getViewer(): Cesium.Viewer | null {
  return _viewer
}

// Building tileset management
export type BuildingMode = 'osm' | 'photorealistic'

let _osmTileset: Cesium.Cesium3DTileset | null = null
let _photoTileset: Cesium.Cesium3DTileset | null = null
let _buildingMode: BuildingMode = 'osm'
let _autoSwitch = true // altitude-based auto-switching enabled by default

// Hysteresis thresholds (meters)
const SWITCH_DOWN = 50_000   // switch to photorealistic below 50km
const SWITCH_UP   = 55_000   // switch back to OSM above 55km

export function setBuildingTilesets(osm: Cesium.Cesium3DTileset | null, photo: Cesium.Cesium3DTileset | null): void {
  _osmTileset = osm
  _photoTileset = photo
}

export function getBuildingMode(): BuildingMode {
  return _buildingMode
}

export function setBuildingMode(mode: BuildingMode): void {
  if (mode === _buildingMode) return
  _buildingMode = mode
  if (mode === 'photorealistic') {
    if (_osmTileset) _osmTileset.show = false
    if (_photoTileset) _photoTileset.show = true
    if (_viewer) _viewer.scene.globe.show = false
  } else {
    if (_photoTileset) _photoTileset.show = false
    if (_osmTileset) _osmTileset.show = true
    if (_viewer) _viewer.scene.globe.show = true
  }
  console.log(`[engine] Building mode: ${mode}`)
}

/** Toggle auto-switching on/off (manual toggle command disables auto) */
export function setAutoSwitch(enabled: boolean): void {
  _autoSwitch = enabled
}

/** Base maps where photorealistic buildings make visual sense */
const PHOTO_COMPATIBLE_MAPS: Set<BaseMapStyle> = new Set(['default', 'satellite'])

/**
 * Called every frame from the postRender callback.
 * Automatically switches building mode based on camera altitude with hysteresis.
 * Photorealistic buildings only activate on satellite-family base maps.
 */
export function updateBuildingMode(altitude: number): void {
  if (!_autoSwitch) return
  if (!_photoTileset) return // photorealistic not available

  const photoAllowed = PHOTO_COMPATIBLE_MAPS.has(_currentBaseMap)

  if (photoAllowed && _buildingMode === 'osm' && altitude < SWITCH_DOWN) {
    setBuildingMode('photorealistic')
  } else if (_buildingMode === 'photorealistic' && (altitude > SWITCH_UP || !photoAllowed)) {
    setBuildingMode('osm')
  }
}

// ── Orbit animation ──

interface OrbitState {
  targetLat: number    // degrees
  targetLon: number    // degrees
  distance: number     // meters from target
  cameraHeight: number // meters above ground
  targetHeight: number // meters above ground
  heading: number      // current heading in degrees
  speed: number        // degrees per second
  removeListener: (() => void) | null
  cleanupInput: (() => void) | null
}

let _orbit: OrbitState | null = null

export function isOrbiting(): boolean { return _orbit !== null }

export function startOrbit(opts: {
  targetLat: number
  targetLon: number
  distance: number
  cameraHeight: number
  targetHeight: number
  heading?: number
  speed?: number
}): void {
  stopOrbit()
  if (!_viewer) return

  _orbit = {
    targetLat: opts.targetLat,
    targetLon: opts.targetLon,
    distance: opts.distance,
    cameraHeight: opts.cameraHeight,
    targetHeight: opts.targetHeight,
    heading: opts.heading ?? 0,
    speed: opts.speed ?? 5,  // 5 degrees/sec = ~72 sec full rotation
    removeListener: null,
    cleanupInput: null,
  }

  // Stop orbit on any user navigation input
  const canvas = _viewer.canvas
  const cancelOrbit = () => stopOrbit()
  canvas.addEventListener('mousedown', cancelOrbit)
  canvas.addEventListener('wheel', cancelOrbit)
  canvas.addEventListener('pointerdown', cancelOrbit)
  const cancelOnKey = (e: KeyboardEvent) => {
    // Only cancel on navigation-related keys, not all keys
    const navKeys = new Set(['w','a','s','d','q','e','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','='])
    if (navKeys.has(e.key)) cancelOrbit()
  }
  document.addEventListener('keydown', cancelOnKey)

  // Gamepad: check in the tick listener below
  let lastGamepadTimestamp = 0

  _orbit.cleanupInput = () => {
    canvas.removeEventListener('mousedown', cancelOrbit)
    canvas.removeEventListener('wheel', cancelOrbit)
    canvas.removeEventListener('pointerdown', cancelOrbit)
    document.removeEventListener('keydown', cancelOnKey)
  }

  const listener = _viewer.clock.onTick.addEventListener((clock) => {
    if (!_orbit || !_viewer) return

    // Check for gamepad input
    const gamepads = navigator.getGamepads()
    for (const gp of gamepads) {
      if (!gp) continue
      if (gp.timestamp > lastGamepadTimestamp) {
        const hasInput = gp.axes.some(a => Math.abs(a) > 0.15) || gp.buttons.some(b => b.pressed)
        if (hasInput) { stopOrbit(); return }
        lastGamepadTimestamp = gp.timestamp
      }
    }

    const dt = clock.multiplier / 60 // approximate seconds per tick at 60fps
    _orbit.heading = (_orbit.heading + _orbit.speed * dt) % 360

    const headingRad = Cesium.Math.toRadians(_orbit.heading)
    const metersPerDegreeLat = 111_320
    const metersPerDegreeLon = 111_320 * Math.cos(Cesium.Math.toRadians(_orbit.targetLat))

    const latOffset = -Math.cos(headingRad) * _orbit.distance / metersPerDegreeLat
    const lonOffset = -Math.sin(headingRad) * _orbit.distance / metersPerDegreeLon

    const cameraLat = _orbit.targetLat + latOffset
    const cameraLon = _orbit.targetLon + lonOffset

    const heightDiff = _orbit.targetHeight - _orbit.cameraHeight
    const pitchRad = Math.atan2(heightDiff, _orbit.distance)

    _viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(cameraLon, cameraLat, _orbit.cameraHeight),
      orientation: {
        heading: headingRad,
        pitch: pitchRad,
        roll: 0,
      },
    })
  })

  _orbit.removeListener = () => listener()
  console.log(`[engine] Orbit started: ${_orbit.speed}°/s around (${opts.targetLat.toFixed(4)}, ${opts.targetLon.toFixed(4)})`)
}

export function stopOrbit(): void {
  if (_orbit) {
    _orbit.removeListener?.()
    _orbit.cleanupInput?.()
    _orbit = null
    console.log('[engine] Orbit stopped')
  }
}

// ── Base map imagery styles ──

export type BaseMapStyle = 'default' | 'satellite' | 'dark' | 'light' | 'road' | 'voyager' | 'topo' | 'blank-black' | 'blank-white'

interface BaseMapDef {
  name: string
  description: string
  create: () => Promise<Cesium.ImageryProvider> | Cesium.ImageryProvider
}

/** Create a 1×1 solid-color imagery provider that covers the whole globe. */
function solidColorProvider(cssColor: string): Cesium.SingleTileImageryProvider {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  return new Cesium.SingleTileImageryProvider({
    url: canvas.toDataURL(),
    rectangle: Cesium.Rectangle.MAX_VALUE,
    tileWidth: 1,
    tileHeight: 1,
  })
}

const BASE_MAPS: Record<BaseMapStyle, BaseMapDef> = {
  default: {
    name: 'Default',
    description: 'Satellite imagery with labels',
    create: () => Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    }),
  },
  satellite: {
    name: 'Satellite',
    description: 'Satellite imagery (no labels)',
    create: () => Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.AERIAL,
    }),
  },
  dark: {
    name: 'Dark',
    description: 'CartoDB Dark Matter',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      credit: new Cesium.Credit('CartoDB'),
      maximumLevel: 18,
    }),
  },
  light: {
    name: 'Light',
    description: 'CartoDB Positron (light political)',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      credit: new Cesium.Credit('CartoDB'),
      maximumLevel: 18,
    }),
  },
  road: {
    name: 'Road',
    description: 'Road map with labels',
    create: () => Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.ROAD,
    }),
  },
  // NOTE: Sentinel-2 (3954), Blue Marble (3845), Earth at Night (3812) require
  // adding these assets to your Ion account from the Asset Depot first. Removed
  // because they 404 with default Ion tokens.
  voyager: {
    name: 'Voyager',
    description: 'CartoDB Voyager — colorful street map',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      credit: new Cesium.Credit('CartoDB'),
      maximumLevel: 18,
    }),
  },
  topo: {
    name: 'Topographic',
    description: 'OpenTopoMap — topographic contour map',
    create: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      credit: new Cesium.Credit('OpenTopoMap'),
      maximumLevel: 17,
    }),
  },
  'blank-black': {
    name: 'Blank (Black)',
    description: 'Solid black — useful for testing overlays',
    create: () => solidColorProvider('#000000'),
  },
  'blank-white': {
    name: 'Blank (White)',
    description: 'Solid white — useful for testing overlays',
    create: () => solidColorProvider('#ffffff'),
  },
}

let _currentBaseMap: BaseMapStyle = 'default'

export function getBaseMapStyle(): BaseMapStyle { return _currentBaseMap }
export function getBaseMapStyles(): { id: BaseMapStyle; name: string; description: string }[] {
  return Object.entries(BASE_MAPS).map(([id, def]) => ({
    id: id as BaseMapStyle,
    name: def.name,
    description: def.description,
  }))
}

export async function setBaseMapStyle(style: BaseMapStyle): Promise<boolean> {
  if (!_viewer) return false
  const def = BASE_MAPS[style]
  if (!def) return false
  if (style === _currentBaseMap) return true

  const provider = await def.create()

  // Replace the base imagery layer (index 0)
  const layers = _viewer.imageryLayers
  if (layers.length > 0) {
    layers.remove(layers.get(0), true)
  }
  layers.addImageryProvider(provider, 0)
  _currentBaseMap = style

  // Force OSM buildings if new base map isn't compatible with photorealistic
  if (_buildingMode === 'photorealistic' && !PHOTO_COMPATIBLE_MAPS.has(style)) {
    setBuildingMode('osm')
  }

  console.log(`[engine] Base map: ${def.name}`)
  return true
}

// ── Quality presets ──

interface QualityConfig {
  shadows: boolean
  shadowSize: number
  softShadows: boolean
  shadowDarkness: number
  bloom: boolean
  bloomContrast: number
  bloomBrightness: number
  bloomDelta: number
  bloomSigma: number
  bloomStepSize: number
  ambientOcclusion: boolean
  aoIntensity: number
  aoBias: number
  aoLengthCap: number
  aoStepSize: number
  fxaa: boolean
  resolutionScale: number
  tilesCacheBytes: number
}

const QUALITY_CONFIGS: Record<QualityPreset, QualityConfig> = {
  performance: {
    shadows: false,
    shadowSize: 2048,
    softShadows: false,
    shadowDarkness: 0.3,
    bloom: false,
    bloomContrast: 128,
    bloomBrightness: -0.3,
    bloomDelta: 1.0,
    bloomSigma: 3.78,
    bloomStepSize: 5,
    ambientOcclusion: false,
    aoIntensity: 3.0,
    aoBias: 0.1,
    aoLengthCap: 0.03,
    aoStepSize: 1,
    fxaa: false,
    resolutionScale: 1.0,
    tilesCacheBytes: 512 * 1024 * 1024,
  },
  quality: {
    shadows: true,
    shadowSize: 4096,
    softShadows: true,
    shadowDarkness: 0.4,
    bloom: false,
    bloomContrast: 128,
    bloomBrightness: -0.2,
    bloomDelta: 1.0,
    bloomSigma: 1.5,
    bloomStepSize: 1.0,
    ambientOcclusion: false,
    aoIntensity: 2.0,
    aoBias: 0.25,
    aoLengthCap: 0.01,
    aoStepSize: 2.0,
    fxaa: true,
    resolutionScale: 1.25,
    tilesCacheBytes: 1024 * 1024 * 1024,
  },
  ultra: {
    shadows: true,
    shadowSize: 8192,
    softShadows: true,
    shadowDarkness: 0.4,
    bloom: true,
    bloomContrast: 128,
    bloomBrightness: -0.2,
    bloomDelta: 1.0,
    bloomSigma: 1.5,
    bloomStepSize: 1.0,
    ambientOcclusion: true,
    aoIntensity: 2.0,
    aoBias: 0.25,
    aoLengthCap: 0.01,
    aoStepSize: 2.0,
    fxaa: true,
    resolutionScale: 1.5,
    tilesCacheBytes: 1536 * 1024 * 1024,
  },
}

let _currentPreset: QualityPreset = 'quality'

export function getQualityPreset(): QualityPreset { return _currentPreset }

/**
 * Apply a quality preset to the viewer. Configures shadows, post-processing
 * (bloom, AO, FXAA), resolution scale, and 3D tiles memory budget.
 */
export function applyQualityPreset(preset: QualityPreset): void {
  if (!_viewer) return
  const cfg = QUALITY_CONFIGS[preset]
  _currentPreset = preset
  const scene = _viewer.scene

  // Shadows
  _viewer.shadows = cfg.shadows
  if (_viewer.shadowMap) {
    _viewer.shadowMap.size = cfg.shadowSize
    _viewer.shadowMap.softShadows = cfg.softShadows
    _viewer.shadowMap.darkness = cfg.shadowDarkness
  }

  // Post-processing: bloom
  const bloom = scene.postProcessStages.bloom
  bloom.enabled = cfg.bloom
  if (cfg.bloom) {
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = cfg.bloomContrast
    bloom.uniforms.brightness = cfg.bloomBrightness
    bloom.uniforms.delta = cfg.bloomDelta
    bloom.uniforms.sigma = cfg.bloomSigma
    bloom.uniforms.stepSize = cfg.bloomStepSize
  }

  // Post-processing: ambient occlusion (SSAO)
  const ao = scene.postProcessStages.ambientOcclusion
  ao.enabled = cfg.ambientOcclusion
  if (cfg.ambientOcclusion) {
    ao.uniforms.intensity = cfg.aoIntensity
    ao.uniforms.bias = cfg.aoBias
    ao.uniforms.lengthCap = cfg.aoLengthCap
    ao.uniforms.stepSize = cfg.aoStepSize
  }

  // Post-processing: FXAA
  scene.postProcessStages.fxaa.enabled = cfg.fxaa

  // Resolution scale (supersampling)
  _viewer.resolutionScale = cfg.resolutionScale

  // 3D tiles memory budget
  if (_osmTileset) {
    _osmTileset.cacheBytes = cfg.tilesCacheBytes
    _osmTileset.maximumCacheOverflowBytes = cfg.tilesCacheBytes / 2
  }
  if (_photoTileset) {
    _photoTileset.cacheBytes = cfg.tilesCacheBytes
    _photoTileset.maximumCacheOverflowBytes = cfg.tilesCacheBytes / 2
  }

  // Adjust in-memory tile cache budget to match quality tier
  setTileCacheBudget(preset)

  console.log(`[engine] Quality preset: ${preset} (resolution ${cfg.resolutionScale}x, shadows ${cfg.shadows ? 'on' : 'off'})`)
}
