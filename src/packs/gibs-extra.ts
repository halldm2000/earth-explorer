/**
 * NASA GIBS Extra Satellite Imagery Data Pack
 *
 * Provides additional GIBS layers beyond the core set in gibs.ts:
 * MODIS NDVI (vegetation), snow cover, aerosol optical depth, and
 * land surface temperature.
 *
 * Layers use imageryProvider factories that read the global GIBS date at
 * invocation time, enabling the time slider to reload layers for different dates.
 */

import * as Cesium from 'cesium'
import type { DataPack } from './types'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import type { WmtsSource } from '@/sources/types'
import { showLayer, hideLayer, toggleLayer, getLayer } from '@/features/layers/manager'
import { showPackWelcome } from './register'
import { getGlobalDate } from '@/data/gibs-layer-factory'

// ── GIBS WMTS configuration ──

const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

/** Build tile matrix labels: level numbers "0", "1", "2", ... */
function matrixLabels(maxLevel: number): string[] {
  return Array.from({ length: maxLevel + 1 }, (_, i) => String(i))
}

interface GibsExtraConfig {
  layer: string
  format: 'png' | 'jpeg'
  maxLevel: number
  /** Optional latitude bounds to prevent 404s on tiles outside coverage. */
  latRange?: [number, number]
}

/**
 * Returns a provider factory that reads the global date at invocation time.
 * This means reloading a layer after setGlobalDate() shows the new date's imagery.
 */
function gibsExtraProvider(cfg: GibsExtraConfig): () => Cesium.ImageryProvider {
  const ext = cfg.format === 'jpeg' ? 'jpg' : 'png'
  const tileMatrixSet = `GoogleMapsCompatible_Level${cfg.maxLevel}`
  const labels = matrixLabels(cfg.maxLevel)
  const rectangle = cfg.latRange
    ? Cesium.Rectangle.fromDegrees(-180, cfg.latRange[0], 180, cfg.latRange[1])
    : undefined
  return () => {
    const date = getGlobalDate()
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

// ── Sources (kept for backward compatibility with source catalog) ──

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

interface GibsSourceConfig {
  id: string
  name: string
  description: string
  layer: string
  date: string
  format: 'png' | 'jpeg'
  maxLevel: number
}

function makeWmtsSource(cfg: GibsSourceConfig): WmtsSource {
  const ext = cfg.format === 'jpeg' ? 'jpg' : 'png'
  const tileMatrixSet = `GoogleMapsCompatible_Level${cfg.maxLevel}`
  return {
    type: 'wmts',
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    attribution: 'NASA GIBS',
    url: `${GIBS_BASE}/${cfg.layer}/default/${cfg.date}/${tileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`,
    layer: cfg.layer,
    style: 'default',
    tileMatrixSetID: tileMatrixSet,
    tileMatrixLabels: matrixLabels(cfg.maxLevel),
    maximumLevel: cfg.maxLevel,
    format: `image/${cfg.format}`,
    tilingScheme: 'webmercator',
  }
}

const SOURCES: WmtsSource[] = [
  makeWmtsSource({
    id: 'gibs-ndvi-src',
    name: 'MODIS NDVI',
    description: '8-day composite Normalized Difference Vegetation Index from MODIS Terra',
    layer: 'MODIS_Terra_NDVI_8Day',
    date: daysAgo(10),
    format: 'png',
    maxLevel: 9,
  }),
  makeWmtsSource({
    id: 'gibs-snow-src',
    name: 'MODIS Snow Cover',
    description: 'Daily snow and ice cover from MODIS Terra',
    layer: 'MODIS_Terra_NDSI_Snow_Cover',
    date: daysAgo(2),
    format: 'png',
    maxLevel: 8,
  }),
  makeWmtsSource({
    id: 'gibs-aerosol-src',
    name: 'MODIS Aerosol Optical Depth',
    description: 'Aerosol optical depth at 3km resolution from MODIS Terra (air quality proxy)',
    layer: 'MODIS_Terra_Aerosol',
    date: daysAgo(2),
    format: 'png',
    maxLevel: 6,
  }),
  makeWmtsSource({
    id: 'gibs-lst-src',
    name: 'MODIS Land Surface Temperature',
    description: 'Daytime land surface temperature from MODIS Terra',
    layer: 'MODIS_Terra_Land_Surface_Temp_Day',
    date: daysAgo(2),
    format: 'png',
    maxLevel: 7,
  }),
]

// ── Layer definitions ──
// Layers use imageryProvider factories that read the global date at invocation time.
// This enables the time slider to reload layers for different dates.

const GIBS_EXTRA_LAYERS: LayerDef[] = [
  {
    id: 'gibs-ndvi',
    name: 'Vegetation (NDVI)',
    kind: 'imagery',
    category: 'satellite',
    description: 'MODIS Terra 8-day NDVI composite — vegetation health and density',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsExtraProvider({
      layer: 'MODIS_Terra_NDVI_8Day', format: 'png', maxLevel: 9,
      latRange: [-80, 86], // No NDVI data over Antarctic ice
    }),
    legend: {
      type: 'gradient',
      title: 'Vegetation Index (NDVI)',
      colorStops: [
        { value: 0.0, color: '#8B4513', label: '0.0' },
        { value: 0.2, color: '#a67c52' },
        { value: 0.4, color: '#c2b280' },
        { value: 0.6, color: '#7cba3f' },
        { value: 0.8, color: '#3a8c1f' },
        { value: 1.0, color: '#0a5e00', label: '1.0' },
      ],
    },
  },
  {
    id: 'gibs-snow',
    name: 'Snow Cover',
    kind: 'imagery',
    category: 'satellite',
    description: 'MODIS Terra daily snow and ice cover',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsExtraProvider({
      layer: 'MODIS_Terra_NDSI_Snow_Cover', format: 'png', maxLevel: 8,
    }),
    legend: {
      type: 'gradient',
      title: 'Snow Cover',
      units: '%',
      colorStops: [
        { value: 0,   color: 'rgba(200,200,255,0.0)', label: '0' },
        { value: 25,  color: 'rgba(200,210,255,0.35)' },
        { value: 50,  color: 'rgba(180,200,250,0.55)' },
        { value: 75,  color: 'rgba(210,225,255,0.8)' },
        { value: 100, color: '#ffffff', label: '100' },
      ],
    },
  },
  {
    id: 'gibs-aerosol',
    name: 'Aerosol (Air Quality)',
    kind: 'imagery',
    category: 'satellite',
    description: 'MODIS Terra aerosol optical depth 3km — air quality and haze proxy',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsExtraProvider({
      layer: 'MODIS_Terra_Aerosol', format: 'png', maxLevel: 6,
      latRange: [-80, 80], // No aerosol data over polar ice
    }),
    legend: {
      type: 'gradient',
      title: 'Aerosol Optical Depth',
      colorStops: [
        { value: 0.0, color: '#ffffb2', label: '0.0' },
        { value: 1.0, color: '#f5c842' },
        { value: 2.0, color: '#e87530' },
        { value: 3.0, color: '#d62f27' },
        { value: 4.0, color: '#9e1a63' },
        { value: 5.0, color: '#4a0057', label: '5.0' },
      ],
    },
  },
  {
    id: 'gibs-lst',
    name: 'Land Surface Temperature',
    kind: 'imagery',
    category: 'satellite',
    description: 'MODIS Terra daytime land surface temperature',
    defaultOn: false,
    temporal: true,
    imageryProvider: gibsExtraProvider({
      layer: 'MODIS_Terra_Land_Surface_Temp_Day', format: 'png', maxLevel: 7,
    }),
    legend: {
      type: 'gradient',
      title: 'Land Surface Temperature',
      units: '\u00B0C',
      colorStops: [
        { value: -20, color: '#2166ac', label: '-20' },
        { value: 0,   color: '#67a9cf' },
        { value: 15,  color: '#d1e5f0' },
        { value: 25,  color: '#fddbc7' },
        { value: 40,  color: '#ef8a62' },
        { value: 60,  color: '#b2182b', label: '60' },
      ],
    },
  },
]

// ── Helper: resolve a GIBS extra layer by fuzzy name ──

const LAYER_ALIASES: Record<string, string> = {
  // NDVI / Vegetation
  'vegetation': 'gibs-ndvi',
  'ndvi': 'gibs-ndvi',
  'greenness': 'gibs-ndvi',
  'plant cover': 'gibs-ndvi',
  'vegetation index': 'gibs-ndvi',
  'green cover': 'gibs-ndvi',

  // Snow Cover
  'snow': 'gibs-snow',
  'snow cover': 'gibs-snow',
  'ice cover': 'gibs-snow',
  'snow map': 'gibs-snow',
  'snowfall': 'gibs-snow',

  // Aerosol / Air Quality
  'aerosol': 'gibs-aerosol',
  'aerosols': 'gibs-aerosol',
  'air quality': 'gibs-aerosol',
  'aod': 'gibs-aerosol',
  'haze': 'gibs-aerosol',
  'smog': 'gibs-aerosol',
  'pollution': 'gibs-aerosol',
  'dust': 'gibs-aerosol',

  // Land Surface Temperature
  'land temperature': 'gibs-lst',
  'land temp': 'gibs-lst',
  'land surface temperature': 'gibs-lst',
  'ground temperature': 'gibs-lst',
  'ground temp': 'gibs-lst',
  'surface temp': 'gibs-lst',
}

function resolveGibsExtraLayer(input: string): string | undefined {
  const q = input.toLowerCase().trim()
  // Direct ID match
  if (GIBS_EXTRA_LAYERS.some(l => l.id === q)) return q
  // Alias match
  if (LAYER_ALIASES[q]) return LAYER_ALIASES[q]
  // Partial match against layer names
  const match = GIBS_EXTRA_LAYERS.find(
    l => l.name.toLowerCase().includes(q) || l.id.includes(q),
  )
  return match?.id
}

// ── Commands ──

function buildPatterns(): string[] {
  const verbs = ['show', 'hide', 'toggle', 'turn on', 'turn off']
  const patterns: string[] = []

  for (const alias of Object.keys(LAYER_ALIASES)) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${alias}`)
    }
  }

  for (const def of GIBS_EXTRA_LAYERS) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${def.name.toLowerCase()}`)
    }
  }

  return patterns
}

const toggleCmd: CommandEntry = {
  id: 'gibs-extra:toggle',
  name: 'Toggle GIBS extra layer',
  module: 'gibs-extra',
  category: 'data',
  description: 'Toggle a NASA GIBS extra imagery layer. Layers: vegetation/NDVI, snow cover, aerosol/air quality, land surface temperature.',
  patterns: buildPatterns(),
  params: [
    {
      name: 'layer',
      type: 'string',
      required: true,
      description: 'GIBS extra layer name: vegetation/ndvi, snow, aerosol/air quality, land temp',
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
    showPackWelcome('gibs-extra')
    const raw = String(params._raw ?? '').toLowerCase()

    let input = String(params.layer ?? '').toLowerCase().trim()
    if (!input || input === 'undefined') {
      input = raw
        .replace(/^(show|hide|toggle|turn on|turn off)\s+/, '')
        .replace(/\s+(on|off)$/, '')
        .trim()
    }

    const layerId = resolveGibsExtraLayer(input)
    if (!layerId) {
      const available = GIBS_EXTRA_LAYERS.map(l => l.name).join(', ')
      return `Unknown GIBS extra layer "${input}". Available: ${available}`
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

const listCmd: CommandEntry = {
  id: 'gibs-extra:list',
  name: 'List GIBS extra layers',
  module: 'gibs-extra',
  category: 'data',
  description: 'List available NASA GIBS extra satellite imagery layers',
  patterns: [
    'list gibs extra layers',
    'gibs extra layers',
    'extra satellite layers',
    'modis layers',
    'vegetation layers',
    'environmental layers',
  ],
  params: [],
  handler: () => {
    const lines = GIBS_EXTRA_LAYERS.map(def => {
      const live = getLayer(def.id)
      const dot = live?.visible ? '●' : '○'
      return `${dot} ${def.name} — ${def.description}`
    })
    return `**NASA GIBS Extra Layers** (${GIBS_EXTRA_LAYERS.length} layers)\n\n${lines.join('\n')}\n\nSay "show vegetation" for NDVI, "show snow" for snow cover, "show aerosol" for air quality, or "show land temp" for surface temperature.`
  },
}

// ── Data Pack definition ──

export const gibsExtraPack: DataPack = {
  id: 'gibs-extra',
  name: 'NASA GIBS Extra Layers',
  description: 'Additional NASA satellite imagery layers (NDVI vegetation, snow cover, aerosol optical depth, land surface temperature)',
  category: 'satellite',
  sources: SOURCES,
  layers: GIBS_EXTRA_LAYERS,
  commands: [toggleCmd, listCmd],
  welcome: 'Extra NASA satellite layers available. Say "show vegetation" for NDVI, "show snow" for snow cover, "show aerosol" for air quality, or "show land temp" for surface temperature.',
}
