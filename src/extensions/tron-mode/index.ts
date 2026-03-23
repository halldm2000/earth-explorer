import * as Cesium from 'cesium'
import type { Extension, ExtensionAPI } from '@/extensions/types'
import { getViewer, getBaseMapStyle, setBaseMapStyle, type BaseMapStyle } from '@/scene/engine'
import { getAllLayers, setGeoJsonProperty, getGeoJsonProperties } from '@/features/layers/manager'

const NVIDIA_GREEN = '#76B900'
const NVIDIA_GREEN_BRIGHT = '#8ACE00'

// ── Saved state for clean deactivation ──

interface SavedState {
  baseMap: string
  bloomEnabled: boolean
  bloomUniforms: {
    glowOnly: boolean
    contrast: number
    brightness: number
    delta: number
    sigma: number
    stepSize: number
  }
  globeMaterial: Cesium.Material | undefined
  showWaterEffect: boolean
  atmosphere: {
    hueShift: number
    saturationShift: number
    brightnessShift: number
  }
  geoJsonColors: Map<string, string>
  edgeStage: Cesium.PostProcessStage | null
}

let _savedState: SavedState | null = null

// ── Extension definition ──

const extension: Extension = {
  id: 'tron-mode',
  name: 'Tron Mode',
  kind: 'theme',
  description: 'NVIDIA-inspired cyberpunk theme with glowing green contour lines, bloom, and edge detection on a dark globe.',
  tags: ['theme', 'visual', 'nvidia', 'cyberpunk', 'neon'],
  autoActivate: false,

  async activate(api: ExtensionAPI) {
    const viewer = api.unsafe.getViewer()
    if (!viewer) {
      console.warn('[tron-mode] No viewer available, cannot activate')
      return { commands: [], welcome: 'Tron Mode failed — no viewer available.' }
    }

    const scene = viewer.scene
    const globe = scene.globe
    const bloom = scene.postProcessStages.bloom

    // ── Capture pre-activation state ──

    const savedGeoJsonColors = new Map<string, string>()
    for (const layer of getAllLayers()) {
      if (layer.def.kind === 'geojson' && layer.visible) {
        const props = getGeoJsonProperties(layer.def.id)
        if (props) savedGeoJsonColors.set(layer.def.id, props.strokeColor)
      }
    }

    _savedState = {
      baseMap: getBaseMapStyle(),
      bloomEnabled: bloom.enabled,
      bloomUniforms: {
        glowOnly: bloom.uniforms.glowOnly as boolean,
        contrast: bloom.uniforms.contrast as number,
        brightness: bloom.uniforms.brightness as number,
        delta: bloom.uniforms.delta as number,
        sigma: bloom.uniforms.sigma as number,
        stepSize: bloom.uniforms.stepSize as number,
      },
      globeMaterial: globe.material as Cesium.Material | undefined,
      showWaterEffect: globe.showWaterEffect,
      atmosphere: {
        hueShift: scene.atmosphere.hueShift,
        saturationShift: scene.atmosphere.saturationShift,
        brightnessShift: scene.atmosphere.brightnessShift,
      },
      geoJsonColors: savedGeoJsonColors,
      edgeStage: null,
    }

    // ── Apply Tron visual effects ──

    // Black base map
    await setBaseMapStyle('blank-black')

    // Bloom
    bloom.enabled = true
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = 128
    bloom.uniforms.brightness = -0.2
    bloom.uniforms.delta = 1.0
    bloom.uniforms.sigma = 2.0
    bloom.uniforms.stepSize = 1.0

    // Edge detection with bright green
    const edgeStage = Cesium.PostProcessStageLibrary.createEdgeDetectionStage()
    edgeStage.uniforms.color = Cesium.Color.fromCssColorString(NVIDIA_GREEN_BRIGHT)
    scene.postProcessStages.add(edgeStage)
    _savedState.edgeStage = edgeStage

    // Elevation contour material
    globe.material = Cesium.Material.fromType('ElevationContour', {
      width: 2.0,
      spacing: 500.0,
      color: Cesium.Color.fromCssColorString(NVIDIA_GREEN),
    })

    // Disable water effect
    globe.showWaterEffect = false

    // Green-tinted atmosphere
    scene.atmosphere.hueShift = 0.33
    scene.atmosphere.saturationShift = 0.2
    scene.atmosphere.brightnessShift = -0.3

    // Recolor existing GeoJSON layers
    for (const layer of getAllLayers()) {
      if (layer.def.kind === 'geojson' && layer.visible) {
        setGeoJsonProperty(layer.def.id, 'strokeColor', NVIDIA_GREEN)
      }
    }

    // ── Return commands ──

    return {
      commands: [
        {
          id: 'tron:enable',
          name: 'Enable Tron Mode',
          module: 'tron-mode',
          description: 'Activate NVIDIA Tron cyberpunk theme',
          patterns: ['tron mode', 'enable tron', 'tron on', 'cyberpunk mode'],
          params: [],
          handler: async () => 'Tron Mode is already active.',
          category: 'view',
        },
        {
          id: 'tron:disable',
          name: 'Disable Tron Mode',
          module: 'tron-mode',
          description: 'Deactivate Tron theme and restore defaults',
          patterns: ['disable tron', 'tron off', 'normal mode'],
          params: [],
          handler: async () => {
            const { deactivateExtension } = await import('@/extensions/registry')
            deactivateExtension('tron-mode')
            return 'Tron Mode deactivated.'
          },
          category: 'view',
        },
      ],
      welcome: 'TRON mode active — NVIDIA green contour lines, bloom, edge glow.',
    }
  },

  deactivate() {
    if (!_savedState) return

    const viewer = getViewer()
    if (!viewer) {
      _savedState = null
      return
    }

    const scene = viewer.scene
    const globe = scene.globe
    const bloom = scene.postProcessStages.bloom

    // Remove edge detection stage
    if (_savedState.edgeStage) {
      scene.postProcessStages.remove(_savedState.edgeStage)
    }

    // Restore bloom
    bloom.enabled = _savedState.bloomEnabled
    bloom.uniforms.glowOnly = _savedState.bloomUniforms.glowOnly
    bloom.uniforms.contrast = _savedState.bloomUniforms.contrast
    bloom.uniforms.brightness = _savedState.bloomUniforms.brightness
    bloom.uniforms.delta = _savedState.bloomUniforms.delta
    bloom.uniforms.sigma = _savedState.bloomUniforms.sigma
    bloom.uniforms.stepSize = _savedState.bloomUniforms.stepSize

    // Restore globe material
    globe.material = _savedState.globeMaterial as unknown as Cesium.Material

    // Restore water effect
    globe.showWaterEffect = _savedState.showWaterEffect

    // Restore atmosphere
    scene.atmosphere.hueShift = _savedState.atmosphere.hueShift
    scene.atmosphere.saturationShift = _savedState.atmosphere.saturationShift
    scene.atmosphere.brightnessShift = _savedState.atmosphere.brightnessShift

    // Restore base map (async, fire-and-forget)
    setBaseMapStyle(_savedState.baseMap as BaseMapStyle)

    // Restore GeoJSON stroke colors
    for (const [id, color] of _savedState.geoJsonColors) {
      setGeoJsonProperty(id, 'strokeColor', color)
    }

    _savedState = null
  },
}

export default extension
