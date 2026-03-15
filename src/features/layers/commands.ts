/**
 * Layer feature commands.
 *
 * Registered with the AI command system so users can
 * toggle data layers with natural language.
 */

import type { CommandEntry } from '@/ai/types'
import { getAllLayers, toggleLayer, showLayer, hideLayer } from './manager'
import { BUILTIN_LAYERS } from './sources'
import { playPing } from '@/audio/sounds'

// ── Build explicit patterns for each known layer ──
// Explicit patterns like "show borders" score higher than generic "show {variable}"
// in the router, preventing collisions with the weather feature.

function buildLayerPatterns(): string[] {
  const verbs = ['show', 'hide', 'toggle', 'turn on', 'turn off']
  const patterns: string[] = []
  for (const def of BUILTIN_LAYERS) {
    const names = [def.id, def.name.toLowerCase()]
    for (const verb of verbs) {
      for (const name of names) {
        patterns.push(`${verb} ${name}`)
      }
    }
    patterns.push(`${def.id} on`, `${def.id} off`)
  }
  // Keep generic fallback for layers added at runtime
  patterns.push('toggle {layer}', 'show {layer}', 'hide {layer}')
  return patterns
}

// ── Toggle a specific layer by name ──

const toggleLayerCmd: CommandEntry = {
  id: 'layers:toggle',
  name: 'Toggle layer',
  module: 'layers',
  category: 'data',
  description: 'Toggle a data layer on or off (borders, coastlines, rivers)',
  patterns: buildLayerPatterns(),
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id (borders, coastlines, rivers)' },
    { name: 'action', type: 'enum', required: false, description: 'Whether to show, hide, or toggle the layer', options: ['show', 'hide', 'toggle'] },
  ],
  handler: async (params) => {
    const raw = String(params._raw ?? '').toLowerCase()

    // Extract the layer name: try the extracted param first, then parse from raw input
    let input = String(params.layer ?? '').toLowerCase().trim()

    // If the param is empty (exact pattern match, no {layer} placeholder),
    // parse the layer name from the raw command text
    if (!input || input === 'undefined') {
      // Strip verb prefix to find the layer name
      input = raw
        .replace(/^(show|hide|toggle|turn on|turn off)\s+/, '')
        .replace(/\s+(on|off)$/, '')
        .trim()
    }

    // Find the layer by fuzzy match against id and name
    const all = getAllLayers()
    const match = all.find(l =>
      l.def.id === input ||
      l.def.name.toLowerCase() === input ||
      l.def.name.toLowerCase().includes(input) ||
      l.def.id.includes(input)
    )

    if (!match) {
      const available = all.map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    // Determine intent: from explicit action param (AI tool use), or from raw command text
    const action = String(params.action ?? '').toLowerCase()
    const wantsHide = action === 'hide' || raw.startsWith('hide') || raw.startsWith('turn off') || raw.endsWith('off')
    const wantsShow = action === 'show' || raw.startsWith('show') || raw.startsWith('turn on') || raw.endsWith(' on')

    if (wantsHide) {
      hideLayer(match.def.id)
    } else if (wantsShow) {
      await showLayer(match.def.id)
    } else {
      await toggleLayer(match.def.id)
    }

    playPing()
    const state = match.visible ? 'on' : 'off'
    return `${match.def.name}: ${state}`
  },
}

// ── Show all layers / list available ──

const listLayersCmd: CommandEntry = {
  id: 'layers:list',
  name: 'List layers',
  module: 'layers',
  category: 'data',
  description: 'List all available data layers and their status',
  patterns: [
    'list layers',
    'show layers',
    'available layers',
    'what layers',
    'data layers',
    'layers',
  ],
  params: [],
  handler: () => {
    const all = getAllLayers()
    const lines = all.map(l => {
      const dot = l.visible ? '●' : '○'
      return `${dot} ${l.def.name} — ${l.def.description}`
    })
    const output = `**Data Layers** (${all.length} available)\n\n${lines.join('\n')}\n\nSay "show borders" or "toggle rivers" to control layers.`
    ;(listLayersCmd as any)._lastOutput = output
  },
}

// ── Hide all layers at once ──

const hideAllLayersCmd: CommandEntry = {
  id: 'layers:hide-all',
  name: 'Hide all layers',
  module: 'layers',
  category: 'data',
  description: 'Turn off all data layers',
  patterns: [
    'hide all layers',
    'clear layers',
    'layers off',
    'turn off all layers',
  ],
  params: [],
  handler: () => {
    const all = getAllLayers()
    for (const l of all) {
      if (l.visible) hideLayer(l.def.id)
    }
    playPing()
    console.log('[layers] All layers hidden')
  },
}

export const layerCommands: CommandEntry[] = [
  toggleLayerCmd,
  listLayersCmd,
  hideAllLayersCmd,
]
