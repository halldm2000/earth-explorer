/**
 * NASA GIBS Satellite Imagery Data Pack
 *
 * Provides access to NASA's Global Imagery Browse Services (GIBS) via WMTS.
 * Four imagery layers: VIIRS true color, VIIRS night lights, sea surface
 * temperature, and cloud cover.
 *
 * This was originally a full app but needs no lifecycle or behavior —
 * just tile URLs and AI commands. Data pack is the right abstraction.
 */

import * as Cesium from 'cesium'
import type { DataPack } from './types'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import { showLayer, hideLayer, toggleLayer, getLayer } from '@/features/layers/manager'
import { showPackWelcome } from './register'
import { getGlobalDate } from '@/data/gibs-layer-factory'

// ── GIBS WMTS configuration ──
//
// Uses the EPSG:3857 (Web Mercator) endpoint. This is critical because GIBS's
// EPSG:4326 endpoint uses non-standard tile grids for 250m/500m products
// (512×512 tiles with non-power-of-2 subdivisions like 3×2 at level 1) which
// are incompatible with Cesium's GeographicTilingScheme. The EPSG:3857 endpoint
// uses standard 256×256 tiles with Google Maps-compatible power-of-2 tiling,
// which works natively with Cesium's WebMercatorTilingScheme.

const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

/** Build tile matrix labels: just level numbers "0", "1", "2", ... */
function matrixLabels(maxLevel: number): string[] {
  return Array.from({ length: maxLevel + 1 }, (_, i) => String(i))
}

interface GibsConfig {
  layer: string
  /** Static date string, or 'global' to read from the time slider's global date */
  date: string | 'global'
  format: 'jpeg' | 'png'
  /** Maximum zoom level for this product */
  maxLevel: number
  /**
   * Optional latitude coverage bounds (degrees). GIBS returns 404 for tiles
   * outside a product's coverage (e.g. SST has no data over polar ice caps).
   * Setting this prevents Cesium from requesting those tiles at all, which
   * eliminates browser-level 404 console spam that can't be suppressed from JS.
   */
  latRange?: [number, number]
}

/**
 * Returns a provider factory that resolves the date at invocation time.
 * When date is 'global', reads the current global date from the time slider.
 * This means reloading a layer after setGlobalDate() picks up the new date.
 */
function gibsProvider(cfg: GibsConfig): () => Cesium.ImageryProvider {
  const ext = cfg.format === 'jpeg' ? 'jpg' : 'png'
  const tileMatrixSet = `GoogleMapsCompatible_Level${cfg.maxLevel}`
  const labels = matrixLabels(cfg.maxLevel)

  // Coverage rectangle (defaults to full globe)
  const rectangle = cfg.latRange
    ? Cesium.Rectangle.fromDegrees(-180, cfg.latRange[0], 180, cfg.latRange[1])
    : undefined

  return () => {
    const date = cfg.date === 'global' ? getGlobalDate() : cfg.date
    const url = `${GIBS_BASE}/${cfg.layer}/default/${date}/${tileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`
    return new Cesium.WebMapTileServiceImageryProvider({
      url,
      layer: cfg.layer,
      style: 'default',
      tileMatrixSetID: tileMatrixSet,
      tileMatrixLabels: labels,
      maximumLevel: cfg.maxLevel,
      format: `image/${cfg.format}`,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      credit: new Cesium.Credit('NASA GIBS'),
      rectangle,
    })
  }
}

// ── Layer definitions ──

const GIBS_LAYERS: LayerDef[] = [
  {
    id: 'gibs-modis-truecolor',
    name: 'Satellite View',
    kind: 'imagery',
    category: 'satellite',
    description: 'VIIRS SNPP corrected reflectance true color satellite imagery from NASA GIBS',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsProvider({
      layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
      date: 'global', format: 'jpeg', maxLevel: 9,
    }),
  },
  {
    id: 'gibs-viirs-nightlights',
    name: 'Night Lights (VIIRS)',
    kind: 'imagery',
    category: 'satellite',
    description: 'VIIRS Black Marble night lights composite from NASA GIBS',
    defaultOn: false,
    // Night lights is a static composite — not temporal
    imageryProvider: gibsProvider({
      layer: 'VIIRS_Black_Marble',
      date: '2016-01-01', format: 'png', maxLevel: 8,
    }),
  },
  {
    id: 'gibs-sst',
    name: 'Sea Surface Temperature',
    kind: 'imagery',
    category: 'satellite',
    description: 'GHRSST L4 MUR sea surface temperature analysis from NASA GIBS',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsProvider({
      layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
      date: 'global', format: 'png', maxLevel: 7,
      latRange: [-79, 85], // No SST data over polar ice caps
    }),
    legend: {
      type: 'gradient',
      title: 'Sea Surface Temperature',
      units: '\u00B0C',
      colorStops: [
        { value: -2, color: '#04136b', label: '-2' },
        { value: 5,  color: '#1a5dab' },
        { value: 12, color: '#3e9fd3' },
        { value: 18, color: '#6fd0a7' },
        { value: 24, color: '#c8e64e' },
        { value: 30, color: '#f5a623' },
        { value: 35, color: '#d62f27', label: '35' },
      ],
    },
  },
  {
    id: 'gibs-cloud-cover',
    name: 'Cloud Cover',
    kind: 'imagery',
    category: 'satellite',
    description: 'MODIS Terra cloud top temperature (night) from NASA GIBS',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsProvider({
      layer: 'MODIS_Terra_Cloud_Top_Temp_Night',
      date: 'global', format: 'png', maxLevel: 6,
    }),
    legend: {
      type: 'gradient',
      title: 'Cloud Top Temperature',
      units: 'K',
      colorStops: [
        { value: 180, color: '#ffffff', label: '180' },
        { value: 200, color: '#d0d0e8' },
        { value: 220, color: '#9898c8' },
        { value: 240, color: '#6060a0' },
        { value: 260, color: '#303078' },
        { value: 280, color: '#101050', label: '280' },
      ],
    },
  },
]

// ── Helper: resolve a GIBS layer by fuzzy name ──

const LAYER_ALIASES: Record<string, string> = {
  'true color': 'gibs-modis-truecolor',
  'truecolor': 'gibs-modis-truecolor',
  'modis': 'gibs-modis-truecolor',
  'satellite': 'gibs-modis-truecolor',
  'satellite view': 'gibs-modis-truecolor',
  'sat view': 'gibs-modis-truecolor',
  'sat': 'gibs-modis-truecolor',
  'satellite imagery': 'gibs-modis-truecolor',
  'sat imagery': 'gibs-modis-truecolor',
  'earth view': 'gibs-modis-truecolor',
  'earth imagery': 'gibs-modis-truecolor',
  'terra': 'gibs-modis-truecolor',
  'night lights': 'gibs-viirs-nightlights',
  'nightlights': 'gibs-viirs-nightlights',
  'night': 'gibs-viirs-nightlights',
  'viirs': 'gibs-viirs-nightlights',
  'black marble': 'gibs-viirs-nightlights',
  'city lights': 'gibs-viirs-nightlights',
  'lights at night': 'gibs-viirs-nightlights',
  'lights': 'gibs-viirs-nightlights',
  'sea surface temperature': 'gibs-sst',
  'sea temperature': 'gibs-sst',
  'sea temp': 'gibs-sst',
  'sst': 'gibs-sst',
  'ocean temperature': 'gibs-sst',
  'ocean temp': 'gibs-sst',
  'water temperature': 'gibs-sst',
  'water temp': 'gibs-sst',
  'cloud cover': 'gibs-cloud-cover',
  'clouds': 'gibs-cloud-cover',
  'cloud': 'gibs-cloud-cover',
  'cloud top': 'gibs-cloud-cover',
  'cloud temperature': 'gibs-cloud-cover',
}

function resolveGibsLayer(input: string): string | undefined {
  const q = input.toLowerCase().trim()
  // Direct ID match
  if (GIBS_LAYERS.some(l => l.id === q)) return q
  // Alias match
  if (LAYER_ALIASES[q]) return LAYER_ALIASES[q]
  // Partial match against layer names
  const match = GIBS_LAYERS.find(
    l => l.name.toLowerCase().includes(q) || l.id.includes(q),
  )
  return match?.id
}

// ── Commands ──

function buildGibsPatterns(): string[] {
  const verbs = ['show', 'hide', 'toggle', 'turn on', 'turn off']
  const patterns: string[] = []

  // Explicit alias patterns
  for (const alias of Object.keys(LAYER_ALIASES)) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${alias}`)
    }
  }

  // Layer name patterns
  for (const def of GIBS_LAYERS) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${def.name.toLowerCase()}`)
    }
  }

  return patterns
}

const toggleGibsCmd: CommandEntry = {
  id: 'gibs:toggle',
  name: 'Toggle GIBS layer',
  module: 'gibs',
  category: 'data',
  description: 'Toggle a NASA GIBS satellite imagery layer. Layers: satellite/sat view (MODIS true color), night lights/city lights, sea/ocean temperature (SST), clouds/cloud cover.',
  patterns: buildGibsPatterns(),
  params: [
    {
      name: 'layer',
      type: 'string',
      required: true,
      description: 'GIBS layer name: satellite/sat view, night lights, sea temperature/sst, clouds',
    },
    {
      name: 'action',
      type: 'enum',
      required: false,
      description: 'Whether to show, hide, or toggle the layer',
      options: ['show', 'hide', 'toggle'],
    },
  ],
  handler: async (params) => {
    showPackWelcome('gibs')
    const raw = String(params._raw ?? '').toLowerCase()

    let input = String(params.layer ?? '').toLowerCase().trim()
    if (!input || input === 'undefined') {
      input = raw
        .replace(/^(show|hide|toggle|turn on|turn off)\s+/, '')
        .replace(/\s+(on|off)$/, '')
        .trim()
    }

    const layerId = resolveGibsLayer(input)
    if (!layerId) {
      const available = GIBS_LAYERS.map(l => l.name).join(', ')
      return `Unknown GIBS layer "${input}". Available: ${available}`
    }

    const action = String(params.action ?? '').toLowerCase()
    const wantsHide = action === 'hide' || raw.startsWith('hide') || raw.startsWith('turn off') || raw.endsWith('off')
    const wantsShow = action === 'show' || raw.startsWith('show') || raw.startsWith('turn on') || raw.endsWith(' on')

    if (wantsHide) {
      hideLayer(layerId)
    } else if (wantsShow) {
      await showLayer(layerId)
    } else {
      await toggleLayer(layerId)
    }

    const live = getLayer(layerId)
    const state = live?.visible ? 'on' : 'off'
    const name = live?.def.name ?? layerId
    return `${name}: ${state}`
  },
}

const listGibsCmd: CommandEntry = {
  id: 'gibs:list',
  name: 'List GIBS layers',
  module: 'gibs',
  category: 'data',
  description: 'List available NASA GIBS satellite imagery layers',
  patterns: [
    'list gibs layers',
    'gibs layers',
    'satellite layers',
    'nasa imagery',
    'available satellite imagery',
    'what satellite layers',
  ],
  params: [],
  handler: () => {
    const lines = GIBS_LAYERS.map(def => {
      const live = getLayer(def.id)
      const dot = live?.visible ? '●' : '○'
      return `${dot} ${def.name} — ${def.description}`
    })
    return `**NASA GIBS Satellite Imagery** (${GIBS_LAYERS.length} layers)\n\n${lines.join('\n')}\n\nSay "show night lights" or "show satellite view" to enable a layer.`
  },
}

// ── Data Pack definition ──

export const gibsPack: DataPack = {
  id: 'gibs',
  name: 'NASA GIBS Imagery',
  description: 'NASA satellite imagery layers (VIIRS true color, night lights, sea surface temperature, clouds)',
  category: 'satellite',
  layers: GIBS_LAYERS,
  commands: [toggleGibsCmd, listGibsCmd],
  welcome: 'NASA satellite imagery available. Say "show night lights" for VIIRS city lights, "show satellite view" for VIIRS true color, "show sea temperature" for ocean data, or "show clouds" for cloud cover.',
}
