import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { useStore } from '@/store'
import { getViewer, setViewer, setBuildingTilesets, hideAllBuildings, restoreBuildings, updateBuildingMode, applyQualityPreset } from './engine'
import { playRumble } from '@/audio/sounds'

const MAX_ALTITUDE = 40_000_000 // 40,000 km — enough to see full globe in any aspect ratio
const HOME = { lon: 10, lat: 30, height: 20_000_000, heading: 0, pitch: -90 }

// ── Scene toggle state (exported for Toolbar) ──
let _lighting = true
let _atmosphere = true
const _sceneListeners = new Set<() => void>()
function notifyScene() { for (const fn of _sceneListeners) fn() }
export function getSceneToggles() { return { lighting: _lighting, atmosphere: _atmosphere } }
export function subscribeScene(fn: () => void): () => void {
  _sceneListeners.add(fn)
  return () => _sceneListeners.delete(fn)
}
export function toggleSceneLighting(): void {
  const viewer = getViewer()
  if (!viewer) return
  const on = !viewer.scene.globe.enableLighting
  viewer.scene.globe.enableLighting = on
  _lighting = on; notifyScene()
}
export function toggleSceneAtmosphere(): void {
  const viewer = getViewer()
  if (!viewer) return
  const scene = viewer.scene
  const on = !scene.fog.enabled
  scene.fog.enabled = on
  scene.globe.showGroundAtmosphere = on
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = on
  _atmosphere = on; notifyScene()
}

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const cesiumToken = useStore(s => s.cesiumToken)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current || !cesiumToken) return
    let disposed = false

    async function init() {
      Cesium.Ion.defaultAccessToken = cesiumToken!

      const viewer = new Cesium.Viewer(containerRef.current!, {
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement('div'),
        msaaSamples: 4,
      })

      if (disposed) { viewer.destroy(); return }
      viewerRef.current = viewer
      setViewer(viewer)

      // Terrain — standard Cesium World Terrain (asset 1)
      // NOTE: Bathymetry (asset 2426648) also available if added to Ion account from Asset Depot
      try {
        viewer.scene.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1)
      } catch (e) { console.warn('Terrain init failed:', e) }
      if (disposed) return

      // Load both building tilesets; OSM visible by default, photorealistic available via command
      let osmTileset: Cesium.Cesium3DTileset | null = null
      let photoTileset: Cesium.Cesium3DTileset | null = null

      try {
        osmTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188)
        osmTileset.preloadFlightDestinations = true
        viewer.scene.primitives.add(osmTileset)
      } catch (e) { console.warn('OSM Buildings failed:', e) }

      try {
        photoTileset = await Cesium.createGooglePhotorealistic3DTileset()
        photoTileset.show = false
        photoTileset.preloadWhenHidden = true
        photoTileset.preloadFlightDestinations = true
        viewer.scene.primitives.add(photoTileset)
      } catch (e) { console.warn('Photorealistic 3D Tiles failed:', e) }

      setBuildingTilesets(osmTileset, photoTileset)
      if (disposed) return

      // Scene config
      const scene = viewer.scene
      scene.globe.enableLighting = true
      scene.fog.enabled = true
      scene.fog.density = 2.0e-4
      scene.globe.showGroundAtmosphere = true
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0c12')
      scene.globe.depthTestAgainstTerrain = true

      // Apply quality preset (shadows, bloom, AO, FXAA, resolution scale)
      const initialPreset = useStore.getState().qualityPreset
      applyQualityPreset(initialPreset)

      // Time
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date())
      viewer.clock.shouldAnimate = true
      viewer.clock.multiplier = 1

      // Initial camera
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
        orientation: {
          heading: Cesium.Math.toRadians(HOME.heading),
          pitch: Cesium.Math.toRadians(HOME.pitch),
          roll: 0,
        },
      })

      // Camera status sync + altitude clamp
      scene.postRender.addEventListener(() => {
        const c = viewer.camera.positionCartographic
        if (c && c.latitude != null && c.longitude != null) {
          // Enforce max altitude
          if (c.height > MAX_ALTITUDE) {
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, MAX_ALTITUDE),
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: viewer.camera.roll,
              },
            })
          }
          // Auto-switch building tilesets based on altitude
          updateBuildingMode(c.height)
        }
      })

      // Keyboard fly controls
      setupKeyboard(viewer)

      // Gamepad support
      setupGamepad(viewer)

      setLoading(false)
    }

    init()

    return () => {
      disposed = true
      setViewer(null)
      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [cesiumToken])

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />

      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-deep)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, margin: '0 auto 16px',
              border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading Earth...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================
// Keyboard: flight controls + shortcuts
//
// Arrow keys / WASD = move forward/back/left/right
// Q / E = move down / up
// Shift + arrows = look (rotate heading/pitch)
// R = reset view
//
// Movement rate scales with altitude (same as gamepad),
// so it feels proportional at any height.
// ============================================

function setupKeyboard(viewer: Cesium.Viewer) {
  const keysDown = new Set<string>()

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    const key = e.key.toLowerCase()

    // Track held keys for continuous movement
    keysDown.add(key)
    if (e.shiftKey) keysDown.add('shift')

    // Prevent arrow keys and WASD from scrolling the page
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
      e.preventDefault()
    }

    // R = reset view (one-shot, not continuous)
    if (key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      playRumble()
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
        orientation: {
          heading: Cesium.Math.toRadians(HOME.heading),
          pitch: Cesium.Math.toRadians(HOME.pitch),
          roll: 0,
        },
        duration: 2.0,
      })
    }

    // View mode shortcuts: 1=2.5D, 2=2D, 3=3D
    // Hide ALL 3D Tiles (buildings) in non-3D modes — they crash Cesium's 2D projection
    if (key === '2' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      hideAllBuildings()
      viewer.scene.morphTo2D(1.0)
    }
    if (key === '1' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      hideAllBuildings()
      viewer.scene.morphToColumbusView(1.0)
    }
    if (key === '3' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      viewer.scene.morphTo3D(1.0)
      restoreBuildings()
    }
  })

  document.addEventListener('keyup', (e) => {
    keysDown.delete(e.key.toLowerCase())
    if (!e.shiftKey) keysDown.delete('shift')
  })

  // Clear keys on blur (prevents stuck keys when tabbing away)
  window.addEventListener('blur', () => keysDown.clear())

  // Continuous movement driven by the render clock
  viewer.clock.onTick.addEventListener(() => {
    if (keysDown.size === 0) return

    const camera = viewer.camera
    const carto = camera.positionCartographic
    if (!carto || carto.height == null) return
    const height = carto.height
    const isShift = keysDown.has('shift')

    // Scale movement to altitude: fast at high altitude, precise at ground level
    const moveRate = Math.max(height / 30, 0.5) // min 0.5m per tick
    const lookRate = 0.02

    if (isShift) {
      // Shift held: arrow keys rotate the camera (look around)
      if (keysDown.has('arrowleft') || keysDown.has('a'))  camera.lookLeft(lookRate)
      if (keysDown.has('arrowright') || keysDown.has('d')) camera.lookRight(lookRate)
      if (keysDown.has('arrowup') || keysDown.has('w'))    camera.lookUp(lookRate)
      if (keysDown.has('arrowdown') || keysDown.has('s'))  camera.lookDown(lookRate)
    } else {
      // No modifier: arrow keys translate the camera (fly around)
      if (keysDown.has('arrowup') || keysDown.has('w'))    camera.moveForward(moveRate)
      if (keysDown.has('arrowdown') || keysDown.has('s'))  camera.moveBackward(moveRate)
      if (keysDown.has('arrowleft') || keysDown.has('a'))  camera.moveLeft(moveRate)
      if (keysDown.has('arrowright') || keysDown.has('d')) camera.moveRight(moveRate)
    }

    // Q/E = altitude (always available, regardless of shift)
    if (keysDown.has('q')) camera.moveDown(moveRate)
    if (keysDown.has('e')) camera.moveUp(moveRate)
  })
}

// ============================================
// Gamepad: left stick = move, right stick = look
// ============================================

function setupGamepad(viewer: Cesium.Viewer) {
  const deadzone = 0.15

  function applyDeadzone(val: number): number {
    return Math.abs(val) < deadzone ? 0 : val
  }

  viewer.clock.onTick.addEventListener(() => {
    const gamepads = navigator.getGamepads()
    if (!gamepads) return

    for (const gp of gamepads) {
      if (!gp) continue

      const camera = viewer.camera
      const gpCarto = camera.positionCartographic
      if (!gpCarto || gpCarto.height == null) continue
      const height = gpCarto.height
      const moveRate = height / 30
      const lookRate = 0.03

      // Left stick: move
      const lx = applyDeadzone(gp.axes[0] || 0)
      const ly = applyDeadzone(gp.axes[1] || 0)
      if (lx !== 0) camera.moveRight(lx * moveRate)
      if (ly !== 0) camera.moveForward(-ly * moveRate)

      // Right stick: look
      const rx = applyDeadzone(gp.axes[2] || 0)
      const ry = applyDeadzone(gp.axes[3] || 0)
      if (rx !== 0) camera.twistRight(rx * lookRate)
      if (ry !== 0) camera.lookUp(-ry * lookRate)

      // Triggers: altitude
      const lt = gp.buttons[6]?.value || 0  // descend
      const rt = gp.buttons[7]?.value || 0  // ascend
      if (rt > 0.1) camera.moveUp(rt * moveRate)
      if (lt > 0.1) camera.moveDown(lt * moveRate)

      // Only process first connected gamepad
      break
    }
  })
}
