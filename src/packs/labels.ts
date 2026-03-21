/**
 * Labels Overlay Data Pack
 *
 * Provides a labels-only imagery overlay (roads, cities, place names)
 * via Bing Maps Labels Only from Cesium Ion (asset 2411391).
 * Useful as a transparent overlay on top of any base map.
 */

import * as Cesium from 'cesium'
import type { DataPack } from './types'
import type { CommandEntry } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import { showLayer, hideLayer, toggleLayer, getLayer } from '@/features/layers/manager'
import { showPackWelcome } from './register'

// ── Layer ──

const LAYERS: LayerDef[] = [
  {
    id: 'labels',
    name: 'Labels (Roads & Cities)',
    kind: 'imagery',
    category: 'overlay',
    description: 'Bing Maps labels overlay — road names, city names, and place labels',
    defaultOn: false,
    imageryProvider: () => Cesium.IonImageryProvider.fromAssetId(2411391),
  },
]

// ── Commands ──

const ALIASES: Record<string, string> = {
  'labels': 'labels',
  'label': 'labels',
  'road labels': 'labels',
  'city labels': 'labels',
  'place names': 'labels',
  'place labels': 'labels',
  'street names': 'labels',
  'road names': 'labels',
  'city names': 'labels',
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
  id: 'labels:toggle',
  name: 'Toggle labels overlay',
  module: 'labels',
  category: 'data',
  description: 'Toggle the labels overlay. Shows road names, city names, and place labels.',
  patterns: buildPatterns(),
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name: labels, road labels, city labels' },
    { name: 'action', type: 'enum', required: false, description: 'Whether to show, hide, or toggle', options: ['show', 'hide', 'toggle'] },
  ],
  handler: async (params) => {
    showPackWelcome('labels')
    const raw = String(params._raw ?? '').toLowerCase()
    let input = String(params.layer ?? '').toLowerCase().trim()
    if (!input || input === 'undefined') {
      input = raw.replace(/^(show|hide|toggle|turn on|turn off)\s+/, '').replace(/\s+(on|off)$/, '').trim()
    }
    const layerId = resolveLayer(input)
    if (!layerId) return `Unknown labels layer "${input}". Available: ${LAYERS.map(l => l.name).join(', ')}`

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

export const labelsPack: DataPack = {
  id: 'labels',
  name: 'Labels',
  description: 'Labels overlay — road names, city names, and place labels',
  category: 'overlay',
  layers: LAYERS,
  commands: [toggleCmd],
  welcome: 'Labels overlay available. Say "show labels" to see road and city names.',
}
