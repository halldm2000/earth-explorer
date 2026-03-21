/**
 * NASA FIRMS Active Fire Detection Data Pack
 *
 * Provides fire detection overlays from NASA's Fire Information for Resource
 * Management System (FIRMS) via GIBS WMTS tiles. Two layers:
 *   - MODIS Terra Thermal Anomalies (1km resolution)
 *   - VIIRS SNPP Thermal Anomalies (375m resolution)
 *
 * Both are transparent overlays showing red/orange dots where fires are detected.
 * Data is daily with a ~2-day processing delay.
 */

import type { DataPack } from './types'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import type { WmtsSource } from '@/sources/types'
import { showLayer, hideLayer, toggleLayer, getLayer } from '@/features/layers/manager'
import { showPackWelcome } from './register'

// ── GIBS WMTS configuration ──

const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

/** N days ago — GIBS imagery has a processing delay (1–2 days for daily products) */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Build tile matrix labels: just level numbers "0", "1", "2", ... */
function matrixLabels(maxLevel: number): string[] {
  return Array.from({ length: maxLevel + 1 }, (_, i) => String(i))
}

// ── Sources ──

const modisDate = daysAgo(2)
const viirsDate = daysAgo(2)

const modisThermalSource: WmtsSource = {
  type: 'wmts',
  id: 'firms-modis-thermal',
  name: 'MODIS Terra Thermal Anomalies',
  description: 'Fire hotspots detected by MODIS Terra (1km resolution)',
  attribution: 'NASA FIRMS / GIBS',
  url: `${GIBS_BASE}/MODIS_Terra_Thermal_Anomalies_All/default/${modisDate}/GoogleMapsCompatible_Level7/{TileMatrix}/{TileRow}/{TileCol}.png`,
  layer: 'MODIS_Terra_Thermal_Anomalies_All',
  style: 'default',
  tileMatrixSetID: 'GoogleMapsCompatible_Level7',
  tileMatrixLabels: matrixLabels(7),
  maximumLevel: 7,
  format: 'image/png',
  tilingScheme: 'webmercator',
}

const viirsThermalSource: WmtsSource = {
  type: 'wmts',
  id: 'firms-viirs-thermal',
  name: 'VIIRS SNPP Thermal Anomalies 375m',
  description: 'Fire hotspots detected by VIIRS SNPP (375m resolution)',
  attribution: 'NASA FIRMS / GIBS',
  url: `${GIBS_BASE}/VIIRS_SNPP_Thermal_Anomalies_375m_All/default/${viirsDate}/GoogleMapsCompatible_Level9/{TileMatrix}/{TileRow}/{TileCol}.png`,
  layer: 'VIIRS_SNPP_Thermal_Anomalies_375m_All',
  style: 'default',
  tileMatrixSetID: 'GoogleMapsCompatible_Level9',
  tileMatrixLabels: matrixLabels(9),
  maximumLevel: 9,
  format: 'image/png',
  tilingScheme: 'webmercator',
}

// ── Layers ──

const LAYERS: LayerDef[] = [
  {
    id: 'firms-modis-thermal',
    name: 'MODIS Fire Hotspots',
    kind: 'imagery',
    category: 'fire',
    description: 'MODIS Terra thermal anomalies — fire hotspots at 1km resolution from NASA FIRMS',
    defaultOn: false,
    sourceId: 'firms-modis-thermal',
  },
  {
    id: 'firms-viirs-thermal',
    name: 'VIIRS Fire Hotspots',
    kind: 'imagery',
    category: 'fire',
    description: 'VIIRS SNPP thermal anomalies — fire hotspots at 375m resolution from NASA FIRMS',
    defaultOn: false,
    sourceId: 'firms-viirs-thermal',
  },
]

// ── Aliases ──

const ALIASES: Record<string, string> = {
  // General fire terms → VIIRS (higher resolution, better default)
  'fire': 'firms-viirs-thermal',
  'fires': 'firms-viirs-thermal',
  'fire hotspots': 'firms-viirs-thermal',
  'active fires': 'firms-viirs-thermal',
  'wildfire': 'firms-viirs-thermal',
  'wildfires': 'firms-viirs-thermal',
  'fire detection': 'firms-viirs-thermal',
  'burning': 'firms-viirs-thermal',
  'hotspots': 'firms-viirs-thermal',
  'firms': 'firms-viirs-thermal',
  'thermal anomalies': 'firms-viirs-thermal',

  // VIIRS-specific
  'viirs fire': 'firms-viirs-thermal',
  'viirs fires': 'firms-viirs-thermal',
  'viirs hotspots': 'firms-viirs-thermal',
  'viirs thermal': 'firms-viirs-thermal',
  'viirs fire hotspots': 'firms-viirs-thermal',

  // MODIS-specific
  'modis fire': 'firms-modis-thermal',
  'modis fires': 'firms-modis-thermal',
  'modis hotspots': 'firms-modis-thermal',
  'modis thermal': 'firms-modis-thermal',
  'modis fire hotspots': 'firms-modis-thermal',
  'modis thermal anomalies': 'firms-modis-thermal',
}

function resolveLayer(input: string): string | undefined {
  const q = input.toLowerCase().trim()
  if (LAYERS.some(l => l.id === q)) return q
  if (ALIASES[q]) return ALIASES[q]
  const match = LAYERS.find(l => l.name.toLowerCase().includes(q) || l.id.includes(q))
  return match?.id
}

// ── Commands ──

function buildPatterns(): string[] {
  const verbs = ['show', 'hide', 'toggle', 'turn on', 'turn off']
  const patterns: string[] = []
  for (const alias of Object.keys(ALIASES)) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${alias}`)
    }
  }
  for (const def of LAYERS) {
    for (const verb of verbs) {
      patterns.push(`${verb} ${def.name.toLowerCase()}`)
    }
  }
  return patterns
}

const toggleCmd: CommandEntry = {
  id: 'firms:toggle',
  name: 'Toggle FIRMS fire layer',
  module: 'firms',
  category: 'data',
  description: 'Toggle a NASA FIRMS fire detection layer. Layers: MODIS fire hotspots (1km), VIIRS fire hotspots (375m). Shows active fires, wildfires, and thermal anomalies.',
  patterns: buildPatterns(),
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Fire layer name: fire, fires, hotspots, modis fire, viirs fire' },
    { name: 'action', type: 'enum', required: false, description: 'Whether to show, hide, or toggle', options: ['show', 'hide', 'toggle'] },
  ],
  handler: async (params) => {
    showPackWelcome('firms')
    const raw = String(params._raw ?? '').toLowerCase()
    let input = String(params.layer ?? '').toLowerCase().trim()
    if (!input || input === 'undefined') {
      input = raw.replace(/^(show|hide|toggle|turn on|turn off)\s+/, '').replace(/\s+(on|off)$/, '').trim()
    }
    const layerId = resolveLayer(input)
    if (!layerId) return `Unknown FIRMS layer "${input}". Available: ${LAYERS.map(l => l.name).join(', ')}`

    const action = String(params.action ?? '').toLowerCase()
    const wantsHide = action === 'hide' || raw.startsWith('hide') || raw.startsWith('turn off') || raw.endsWith('off')
    const wantsShow = action === 'show' || raw.startsWith('show') || raw.startsWith('turn on') || raw.endsWith(' on')

    if (wantsHide) hideLayer(layerId)
    else if (wantsShow) await showLayer(layerId)
    else await toggleLayer(layerId)

    const live = getLayer(layerId)
    return `${live?.def.name ?? layerId}: ${live?.visible ? 'on' : 'off'}`
  },
}

const listCmd: CommandEntry = {
  id: 'firms:list',
  name: 'List FIRMS fire layers',
  module: 'firms',
  category: 'data',
  description: 'List available NASA FIRMS fire detection layers',
  patterns: [
    'list fire layers',
    'fire layers',
    'firms layers',
    'available fire layers',
    'what fire layers',
    'fire data',
    'fire detection layers',
  ],
  params: [],
  handler: () => {
    const lines = LAYERS.map(def => {
      const live = getLayer(def.id)
      const dot = live?.visible ? '●' : '○'
      return `${dot} ${def.name} — ${def.description}`
    })
    return `**NASA FIRMS Fire Detection** (${LAYERS.length} layers)\n\n${lines.join('\n')}\n\nSay "show fires" for VIIRS 375m hotspots or "show modis fire" for MODIS 1km hotspots.`
  },
}

// ── Pack ──

export const firmsPack: DataPack = {
  id: 'firms',
  name: 'NASA FIRMS Fire Detection',
  description: 'Active fire detection overlays — MODIS (1km) and VIIRS (375m) thermal anomalies from NASA FIRMS',
  category: 'fire',
  sources: [modisThermalSource, viirsThermalSource],
  layers: LAYERS,
  commands: [toggleCmd, listCmd],
  welcome: 'NASA FIRMS fire detection available. Say "show fires" for VIIRS 375m fire hotspots, or "show modis fire" for MODIS 1km fire hotspots.',
}
