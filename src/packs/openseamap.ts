/**
 * OpenSeaMap Nautical Chart Data Pack
 *
 * Provides a nautical chart overlay from OpenSeaMap — buoys, harbors,
 * navigation aids, depth contours, and other maritime features.
 * Free and open, no API key required.
 */

import type { DataPack } from './types'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import type { XyzSource } from '@/sources/types'
import { showLayer, hideLayer, toggleLayer, getLayer } from '@/features/layers/manager'
import { showPackWelcome } from './register'

// ── Source ──

const seamarkSource: XyzSource = {
  type: 'xyz',
  id: 'openseamap-seamark',
  name: 'OpenSeaMap Seamark Tiles',
  description: 'Nautical chart overlay tiles from OpenSeaMap',
  attribution: 'OpenSeaMap contributors',
  url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
  maximumLevel: 18,
  tilingScheme: 'webmercator',
}

// ── Layer ──

const LAYERS: LayerDef[] = [
  {
    id: 'openseamap-seamark',
    name: 'Nautical Chart',
    kind: 'imagery',
    category: 'marine',
    description: 'OpenSeaMap nautical chart overlay — buoys, harbors, navigation aids, depth contours',
    defaultOn: false,
    sourceId: 'openseamap-seamark',
  },
]

// ── Commands ──

const ALIASES: Record<string, string> = {
  'nautical chart': 'openseamap-seamark',
  'nautical': 'openseamap-seamark',
  'sea chart': 'openseamap-seamark',
  'sea map': 'openseamap-seamark',
  'seamap': 'openseamap-seamark',
  'openseamap': 'openseamap-seamark',
  'marine chart': 'openseamap-seamark',
  'marine map': 'openseamap-seamark',
  'maritime': 'openseamap-seamark',
  'buoys': 'openseamap-seamark',
  'harbors': 'openseamap-seamark',
  'navigation aids': 'openseamap-seamark',
  'nav aids': 'openseamap-seamark',
}

function resolveLayer(input: string): string | undefined {
  const q = input.toLowerCase().trim()
  if (LAYERS.some(l => l.id === q)) return q
  if (ALIASES[q]) return ALIASES[q]
  const match = LAYERS.find(l => l.name.toLowerCase().includes(q) || l.id.includes(q))
  return match?.id
}

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
  id: 'openseamap:toggle',
  name: 'Toggle OpenSeaMap layer',
  module: 'openseamap',
  category: 'data',
  description: 'Toggle the OpenSeaMap nautical chart overlay. Shows buoys, harbors, navigation aids, and depth contours.',
  patterns: buildPatterns(),
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name: nautical chart, sea map, marine chart' },
    { name: 'action', type: 'enum', required: false, description: 'Whether to show, hide, or toggle', options: ['show', 'hide', 'toggle'] },
  ],
  handler: async (params) => {
    showPackWelcome('openseamap')
    const raw = String(params._raw ?? '').toLowerCase()
    let input = String(params.layer ?? '').toLowerCase().trim()
    if (!input || input === 'undefined') {
      input = raw.replace(/^(show|hide|toggle|turn on|turn off)\s+/, '').replace(/\s+(on|off)$/, '').trim()
    }
    const layerId = resolveLayer(input)
    if (!layerId) return `Unknown OpenSeaMap layer "${input}". Available: ${LAYERS.map(l => l.name).join(', ')}`

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

// ── Pack ──

export const openseamapPack: DataPack = {
  id: 'openseamap',
  name: 'OpenSeaMap',
  description: 'Nautical chart overlay — buoys, harbors, navigation aids, depth contours',
  category: 'marine',
  sources: [seamarkSource],
  layers: LAYERS,
  commands: [toggleCmd],
  welcome: 'OpenSeaMap nautical chart available. Say "show nautical chart" to see buoys, harbors, and navigation aids.',
}
