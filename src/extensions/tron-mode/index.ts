/**
 * Tron Mode — NVIDIA-inspired cyberpunk globe theme.
 *
 * Single switch that transforms the globe into green wireframe outlines
 * on a black background with green atmospheric glow, elevation contours,
 * labels, and anti-aliased lines.
 */

import * as Cesium from 'cesium'
import type { Extension, ExtensionAPI } from '@/extensions/types'
import { getViewer, getBaseMapStyle, setBaseMapStyle, type BaseMapStyle } from '@/scene/engine'
import {
  getAllLayers, showLayer, hideLayer,
  setGeoJsonProperty, getGeoJsonProperties, setLayerProperty,
} from '@/features/layers/manager'

const NVIDIA_GREEN = '#76B900'

// ── Saved state for clean deactivation ──

interface SavedState {
  baseMap: string
  bloomEnabled: boolean
  bloomUniforms: Record<string, unknown>
  globeMaterial: Cesium.Material | undefined
  globeBaseColor: Cesium.Color
  showWaterEffect: boolean
  fxaaEnabled: boolean
  atmosphere: { hueShift: number; saturationShift: number; brightnessShift: number }
  skyAtmosphere: { hueShift: number; saturationShift: number; brightnessShift: number } | null
  geoJsonColors: Map<string, { stroke: string; fill: string; width: number }>
  labelsWereVisible: boolean
  bordersWereVisible: boolean
  coastlinesWereVisible: boolean
  riversWereVisible: boolean
  glowStage: Cesium.PostProcessStage | null
}

let _savedState: SavedState | null = null

const extension: Extension = {
  id: 'tron-mode',
  name: 'Tron Mode',
  kind: 'theme',
  description: 'NVIDIA-inspired cyberpunk theme — green wireframe outlines, black globe, neon glow ring.',
  tags: ['theme', 'visual', 'nvidia', 'cyberpunk', 'neon'],
  autoActivate: false,

  async activate(api: ExtensionAPI) {
    const viewer = api.unsafe.getViewer()
    if (!viewer) {
      console.warn('[tron-mode] No viewer available')
      return { commands: [], welcome: 'Tron Mode failed — no viewer.' }
    }

    const scene = viewer.scene
    const globe = scene.globe
    const bloom = scene.postProcessStages.bloom

    // ── Save current state ──

    const savedGeoJsonColors = new Map<string, { stroke: string; fill: string; width: number }>()
    for (const layer of getAllLayers()) {
      if (layer.def.kind === 'geojson') {
        const props = getGeoJsonProperties(layer.def.id)
        if (props) savedGeoJsonColors.set(layer.def.id, {
          stroke: props.strokeColor, fill: props.fillColor, width: props.strokeWidth
        })
      }
    }

    const bordersLayer = getAllLayers().find(l => l.def.id === 'borders')
    const coastLayer = getAllLayers().find(l => l.def.id === 'coastlines')
    const riversLayer = getAllLayers().find(l => l.def.id === 'rivers')
    _savedState = {
      baseMap: getBaseMapStyle(),
      bloomEnabled: bloom.enabled,
      bloomUniforms: {
        glowOnly: bloom.uniforms.glowOnly,
        contrast: bloom.uniforms.contrast,
        brightness: bloom.uniforms.brightness,
        delta: bloom.uniforms.delta,
        sigma: bloom.uniforms.sigma,
        stepSize: bloom.uniforms.stepSize,
      },
      globeMaterial: globe.material as Cesium.Material | undefined,
      globeBaseColor: globe.baseColor.clone(),
      showWaterEffect: globe.showWaterEffect,
      fxaaEnabled: scene.postProcessStages.fxaa.enabled,
      atmosphere: {
        hueShift: scene.atmosphere.hueShift,
        saturationShift: scene.atmosphere.saturationShift,
        brightnessShift: scene.atmosphere.brightnessShift,
      },
      skyAtmosphere: scene.skyAtmosphere ? {
        hueShift: scene.skyAtmosphere.hueShift,
        saturationShift: scene.skyAtmosphere.saturationShift,
        brightnessShift: scene.skyAtmosphere.brightnessShift,
      } : null,
      geoJsonColors: savedGeoJsonColors,
      labelsWereVisible: false,
      bordersWereVisible: bordersLayer?.visible ?? false,
      coastlinesWereVisible: coastLayer?.visible ?? false,
      riversWereVisible: riversLayer?.visible ?? false,
      glowStage: null,
    }

    // ══════════════════════════════════════════
    //  APPLY TRON MODE
    // ══════════════════════════════════════════

    // 1. Black base map
    await setBaseMapStyle('blank-black')
    globe.baseColor = Cesium.Color.BLACK

    // 2. Disable water specular (we want pure black oceans)
    globe.showWaterEffect = false

    // 3. Enable FXAA for anti-aliased lines
    scene.postProcessStages.fxaa.enabled = true

    // 4. Bloom — soft glow on green elements
    bloom.enabled = true
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = 30
    bloom.uniforms.brightness = -0.25
    bloom.uniforms.delta = 1.5
    bloom.uniforms.sigma = 4.0
    bloom.uniforms.stepSize = 0.5

    // 5. Green atmosphere glow
    scene.atmosphere.hueShift = 0.33      // toward green
    scene.atmosphere.saturationShift = 0.5 // boost saturation
    scene.atmosphere.brightnessShift = 0.1 // slightly brighter glow
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = 0.33
      scene.skyAtmosphere.saturationShift = 0.5
      scene.skyAtmosphere.brightnessShift = -0.2
    }

    // 6. Custom glow ring via post-process shader
    try {
      const glowStage = new Cesium.PostProcessStage({
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform sampler2D depthTexture;
          in vec2 v_textureCoordinates;

          void main() {
            vec4 color = texture(colorTexture, v_textureCoordinates);
            float depth = texture(depthTexture, v_textureCoordinates).r;

            // Detect globe edge: where depth transitions from globe to far plane
            float isGlobe = depth < 1.0 ? 1.0 : 0.0;

            // Sample neighbors to find edge
            float texelX = 1.0 / 1920.0;
            float texelY = 1.0 / 1080.0;
            float edgeSum = 0.0;
            for (int dx = -3; dx <= 3; dx++) {
              for (int dy = -3; dy <= 3; dy++) {
                float nd = texture(depthTexture, v_textureCoordinates + vec2(float(dx) * texelX, float(dy) * texelY)).r;
                float nGlobe = nd < 1.0 ? 1.0 : 0.0;
                edgeSum += abs(nGlobe - isGlobe);
              }
            }

            // Wider glow via distance from edge
            float edge = min(edgeSum / 10.0, 1.0);

            // Add outer glow: sample further out
            float outerGlow = 0.0;
            for (int r = 4; r <= 12; r++) {
              for (int a = 0; a < 8; a++) {
                float angle = float(a) * 0.785398; // pi/4
                vec2 offset = vec2(cos(angle), sin(angle)) * float(r);
                float nd = texture(depthTexture, v_textureCoordinates + offset * vec2(texelX, texelY)).r;
                float nGlobe = nd < 1.0 ? 1.0 : 0.0;
                outerGlow += abs(nGlobe - isGlobe);
              }
            }
            outerGlow = min(outerGlow / 30.0, 1.0);

            // NVIDIA green glow
            vec3 glowColor = vec3(0.463, 0.725, 0.0); // #76B900
            float glowIntensity = max(edge * 1.5, outerGlow * 0.6);

            out_FragColor = vec4(color.rgb + glowColor * glowIntensity, color.a);
          }
        `,
      })
      scene.postProcessStages.add(glowStage)
      _savedState.glowStage = glowStage
      console.log('[tron-mode] Custom glow shader added')
    } catch (e) {
      console.warn('[tron-mode] Custom glow shader failed:', e)
    }

    // 7. No elevation contour lines — the green borders/coastlines are the wireframe

    // 8. Show borders + coastlines + rivers in green wireframe
    await showLayer('borders')
    await showLayer('coastlines')
    await showLayer('rivers')

    for (const layer of getAllLayers()) {
      if (layer.def.kind === 'geojson') {
        setGeoJsonProperty(layer.def.id, 'strokeColor', NVIDIA_GREEN)
        setGeoJsonProperty(layer.def.id, 'fillColor', 'transparent')
        setGeoJsonProperty(layer.def.id, 'strokeWidth', 2.0)
      }
    }

    // 9. Labels — don't show the imagery-based labels layer (causes 404s
    // and renders as white text). Country names are already visible via
    // the Cesium default label renderer when borders are on.

    console.log('[tron-mode] Activated')

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
      welcome: 'TRON mode active — green wireframe, neon glow, cyberpunk globe.',
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

    // Remove custom glow shader
    if (_savedState.glowStage) {
      try { scene.postProcessStages.remove(_savedState.glowStage) } catch {}
    }

    // Restore bloom
    bloom.enabled = _savedState.bloomEnabled
    for (const [k, v] of Object.entries(_savedState.bloomUniforms)) {
      bloom.uniforms[k] = v
    }

    // Restore globe
    globe.material = _savedState.globeMaterial as unknown as Cesium.Material
    globe.baseColor = _savedState.globeBaseColor
    globe.showWaterEffect = _savedState.showWaterEffect

    // Restore FXAA
    scene.postProcessStages.fxaa.enabled = _savedState.fxaaEnabled

    // Restore atmosphere
    scene.atmosphere.hueShift = _savedState.atmosphere.hueShift
    scene.atmosphere.saturationShift = _savedState.atmosphere.saturationShift
    scene.atmosphere.brightnessShift = _savedState.atmosphere.brightnessShift
    if (scene.skyAtmosphere && _savedState.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = _savedState.skyAtmosphere.hueShift
      scene.skyAtmosphere.saturationShift = _savedState.skyAtmosphere.saturationShift
      scene.skyAtmosphere.brightnessShift = _savedState.skyAtmosphere.brightnessShift
    }

    // Restore GeoJSON colors
    for (const [id, saved] of _savedState.geoJsonColors) {
      setGeoJsonProperty(id, 'strokeColor', saved.stroke)
      setGeoJsonProperty(id, 'fillColor', saved.fill)
      setGeoJsonProperty(id, 'strokeWidth', saved.width)
    }

    // Restore layer visibility
    if (!_savedState.bordersWereVisible) hideLayer('borders')
    if (!_savedState.coastlinesWereVisible) hideLayer('coastlines')
    if (!_savedState.riversWereVisible) hideLayer('rivers')
    if (!_savedState.labelsWereVisible) hideLayer('labels')

    // Restore base map
    setBaseMapStyle(_savedState.baseMap as BaseMapStyle)

    _savedState = null
    console.log('[tron-mode] Deactivated')
  },
}

export default extension
