/**
 * Layer feature commands.
 *
 * Generic layer toggle/list/hide-all commands that operate on the full
 * layer catalog — whatever has been registered by data packs, apps, or
 * the core runtime. Specific layer sets (GIBS, earthquake) register
 * their own specialized commands with aliases and fuzzy matching.
 */

import type { CommandEntry } from '@/ai/types'
import { getAllLayers, toggleLayer, showLayer, hideLayer, getLayerProperties, setLayerProperty, resetLayerProperties, setGeoJsonProperty, getGeoJsonProperties, setLayerClustering } from './manager'
import type { LiveLayer } from './types'
import { playPing } from '@/audio/sounds'

// ── Fuzzy layer name resolution ──

function resolveLayer(input: string): LiveLayer | undefined {
  const q = input.toLowerCase().trim()
  const all = getAllLayers()
  return all.find(l =>
    l.def.id === q ||
    l.def.name.toLowerCase() === q ||
    l.def.name.toLowerCase().includes(q) ||
    l.def.id.includes(q)
  )
}

// ── Toggle a specific layer by name ──

const toggleLayerCmd: CommandEntry = {
  id: 'layers:toggle',
  name: 'Toggle layer',
  module: 'layers',
  category: 'data',
  description: 'Toggle a data layer on or off. Available layers include borders, coastlines, rivers, and any layers from active apps. Say "list layers" to see all.',
  patterns: [
    'toggle {layer}', 'show {layer}', 'hide {layer}',
    'turn on {layer}', 'turn off {layer}',
    '{layer} on', '{layer} off',
    // Explicit patterns for common built-in layers (higher priority than generic {layer})
    'show borders', 'hide borders', 'toggle borders',
    'show coastlines', 'hide coastlines', 'toggle coastlines',
    'show rivers', 'hide rivers', 'toggle rivers',
    'show country borders', 'hide country borders', 'toggle country borders',
    'show major rivers', 'hide major rivers', 'toggle major rivers',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id (e.g. borders, coastlines, rivers, earthquakes)' },
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

    const match = resolveLayer(input)

    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
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

// ── Set layer opacity ──

const setOpacityCmd: CommandEntry = {
  id: 'layers:set-opacity',
  name: 'Set layer opacity',
  module: 'layers',
  category: 'data',
  description: 'Set the opacity/transparency of a data layer. Values range from 0 (fully transparent) to 1 (fully opaque). Supports percentages like "50%".',
  patterns: [
    'set {layer} opacity to {value}',
    '{layer} opacity {value}',
    'make {layer} transparent',
    'make {layer} opaque',
    'fade {layer}',
    'set opacity {value} on {layer}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
    { name: 'value', type: 'number', required: true, description: 'Opacity value 0-1, or percentage like "50%"', range: [0, 1] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    // Parse value from explicit param or keywords
    let value: number
    if (raw.includes('transparent')) {
      value = 0.3
    } else if (raw.includes('opaque')) {
      value = 1.0
    } else if (raw.includes('fade')) {
      value = 0.5
    } else {
      const rawValue = String(params.value ?? '')
      if (rawValue.endsWith('%')) {
        value = parseFloat(rawValue) / 100
      } else {
        value = parseFloat(rawValue)
      }
    }

    if (isNaN(value)) return `Invalid opacity value. Use a number between 0 and 1, or a percentage like "50%".`
    value = Math.max(0, Math.min(1, value))

    // Try imagery property first, fall back to GeoJSON alpha
    let ok = setLayerProperty(match.def.id, 'alpha', value)
    if (!ok) ok = setGeoJsonProperty(match.def.id, 'alpha', value)
    if (!ok) return `Cannot set opacity on "${match.def.name}".`

    playPing()
    return `${match.def.name} opacity set to ${Math.round(value * 100)}%`
  },
}

// ── Set layer brightness ──

const setBrightnessCmd: CommandEntry = {
  id: 'layers:set-brightness',
  name: 'Set layer brightness',
  module: 'layers',
  category: 'data',
  description: 'Adjust the brightness of a data layer. "brighten" increases by 0.3, "darken" decreases by 0.3, or set an explicit value (0-3).',
  patterns: [
    'brighten {layer}',
    'darken {layer}',
    'set {layer} brightness to {value}',
    '{layer} brightness {value}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
    { name: 'value', type: 'number', required: false, description: 'Brightness value 0-3 (default 1)', range: [0, 3] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    const props = getLayerProperties(match.def.id)
    if (!props) return `Cannot get properties for "${match.def.name}".`

    let value: number
    if (params.value !== undefined && params.value !== '') {
      value = parseFloat(String(params.value))
    } else if (raw.includes('brighten')) {
      value = props.brightness + 0.3
    } else if (raw.includes('darken')) {
      value = props.brightness - 0.3
    } else {
      return `Please specify a brightness value (0-3), or say "brighten" / "darken".`
    }

    if (isNaN(value)) return `Invalid brightness value. Use a number between 0 and 3.`
    value = Math.max(0, Math.min(3, value))

    const ok = setLayerProperty(match.def.id, 'brightness', value)
    if (!ok) return `Cannot set brightness on "${match.def.name}" — only imagery layers support visual properties.`

    playPing()
    return `${match.def.name} brightness set to ${value.toFixed(1)}`
  },
}

// ── Set layer contrast ──

const setContrastCmd: CommandEntry = {
  id: 'layers:set-contrast',
  name: 'Set layer contrast',
  module: 'layers',
  category: 'data',
  description: 'Adjust the contrast of a data layer. "increase contrast" adds 0.3, "decrease contrast" subtracts 0.3, or set an explicit value (0-3).',
  patterns: [
    'increase contrast on {layer}',
    'decrease contrast on {layer}',
    'set {layer} contrast to {value}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
    { name: 'value', type: 'number', required: false, description: 'Contrast value 0-3 (default 1)', range: [0, 3] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    const props = getLayerProperties(match.def.id)
    if (!props) return `Cannot get properties for "${match.def.name}".`

    let value: number
    if (params.value !== undefined && params.value !== '') {
      value = parseFloat(String(params.value))
    } else if (raw.includes('increase')) {
      value = props.contrast + 0.3
    } else if (raw.includes('decrease')) {
      value = props.contrast - 0.3
    } else {
      return `Please specify a contrast value (0-3), or say "increase" / "decrease" contrast.`
    }

    if (isNaN(value)) return `Invalid contrast value. Use a number between 0 and 3.`
    value = Math.max(0, Math.min(3, value))

    const ok = setLayerProperty(match.def.id, 'contrast', value)
    if (!ok) return `Cannot set contrast on "${match.def.name}" — only imagery layers support visual properties.`

    playPing()
    return `${match.def.name} contrast set to ${value.toFixed(1)}`
  },
}

// ── Set layer saturation ──

const setSaturationCmd: CommandEntry = {
  id: 'layers:set-saturation',
  name: 'Set layer saturation',
  module: 'layers',
  category: 'data',
  description: 'Adjust the color saturation of a data layer. "desaturate" sets to 0 (grayscale), "saturate" increases by 0.3, or set an explicit value (0-3).',
  patterns: [
    'desaturate {layer}',
    'saturate {layer}',
    'set {layer} saturation to {value}',
    'increase saturation on {layer}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
    { name: 'value', type: 'number', required: false, description: 'Saturation value 0-3 (default 1)', range: [0, 3] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    const props = getLayerProperties(match.def.id)
    if (!props) return `Cannot get properties for "${match.def.name}".`

    let value: number
    if (params.value !== undefined && params.value !== '') {
      value = parseFloat(String(params.value))
    } else if (raw.includes('desaturate')) {
      value = 0
    } else if (raw.includes('saturate') || raw.includes('increase saturation')) {
      value = props.saturation + 0.3
    } else {
      return `Please specify a saturation value (0-3), or say "desaturate" / "saturate".`
    }

    if (isNaN(value)) return `Invalid saturation value. Use a number between 0 and 3.`
    value = Math.max(0, Math.min(3, value))

    const ok = setLayerProperty(match.def.id, 'saturation', value)
    if (!ok) return `Cannot set saturation on "${match.def.name}" — only imagery layers support visual properties.`

    playPing()
    return `${match.def.name} saturation set to ${value.toFixed(1)}`
  },
}

// ── Show layer properties ──

const layerPropertiesCmd: CommandEntry = {
  id: 'layers:properties',
  name: 'Show layer properties',
  module: 'layers',
  category: 'data',
  description: 'Display the current visual properties (opacity, brightness, contrast, saturation) of a data layer.',
  patterns: [
    'show {layer} properties',
    '{layer} properties',
    'layer info {layer}',
    'layer settings {layer}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
  ],
  handler: (params) => {
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    // GeoJSON layers have their own property set
    const gjProps = getGeoJsonProperties(match.def.id)
    if (gjProps) {
      return [
        `**${match.def.name}** properties:`,
        `- Stroke Color: ${gjProps.strokeColor}`,
        `- Stroke Width: ${gjProps.strokeWidth}px`,
        `- Opacity: ${Math.round(gjProps.alpha * 100)}%`,
        `- Clustering: ${match.clusteringEnabled ? 'on' : 'off'}`,
      ].join('\n')
    }

    const props = getLayerProperties(match.def.id)
    if (!props) return `Cannot get properties for "${match.def.name}".`

    const lines = [
      `**${match.def.name}** properties:`,
      `- Opacity: ${Math.round(props.alpha * 100)}%`,
      `- Brightness: ${props.brightness.toFixed(1)}`,
      `- Contrast: ${props.contrast.toFixed(1)}`,
      `- Saturation: ${props.saturation.toFixed(1)}`,
      `- Hue: ${props.hue.toFixed(2)} rad`,
      `- Gamma: ${props.gamma.toFixed(1)}`,
    ]

    if (props.colorToAlpha?.enabled) {
      lines.push(`- Color-to-alpha: ${props.colorToAlpha.color} (threshold ${props.colorToAlpha.threshold})`)
    }

    return lines.join('\n')
  },
}

// ── Reset layer properties ──

const resetLayerCmd: CommandEntry = {
  id: 'layers:reset',
  name: 'Reset layer properties',
  module: 'layers',
  category: 'data',
  description: 'Reset a layer\'s visual properties (opacity, brightness, contrast, saturation) back to defaults.',
  patterns: [
    'reset {layer} properties',
    'reset {layer}',
    'default {layer} settings',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
  ],
  handler: (params) => {
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    const ok = resetLayerProperties(match.def.id)
    if (!ok) return `Cannot reset properties for "${match.def.name}".`

    playPing()
    return `${match.def.name} properties reset to defaults.`
  },
}

// ── Set stroke color (GeoJSON layers) ──

const setStrokeColorCmd: CommandEntry = {
  id: 'layers:set-color',
  name: 'Set layer color',
  module: 'layers',
  category: 'data',
  description: 'Set the stroke/line color of a vector layer (borders, coastlines, rivers). Accepts CSS color names (white, red, cyan) or hex codes (#ff0000).',
  patterns: [
    'set {layer} color to {color}',
    'make {layer} {color}',
    '{layer} color {color}',
    'color {layer} {color}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id (e.g. coastlines, borders, rivers)' },
    { name: 'color', type: 'string', required: true, description: 'CSS color name (white, red, cyan, gold) or hex code (#ff0000)' },
  ],
  handler: (params) => {
    const input = String(params.layer ?? '').toLowerCase().trim()
    const color = String(params.color ?? '').trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().filter(l => l.def.kind === 'geojson').map(l => l.def.name).join(', ')
      return `Unknown vector layer "${input}". Available: ${available}`
    }

    if (!color) return `Please specify a color (e.g. white, #ff0000, cyan).`

    const ok = setGeoJsonProperty(match.def.id, 'strokeColor', color)
    if (!ok) return `Cannot set color on "${match.def.name}" — only vector layers (borders, coastlines, rivers) support stroke color.`

    playPing()
    return `${match.def.name} color set to ${color}`
  },
}

// ── Set stroke width (GeoJSON layers) ──

const setStrokeWidthCmd: CommandEntry = {
  id: 'layers:set-width',
  name: 'Set layer width',
  module: 'layers',
  category: 'data',
  description: 'Set the stroke/line width of a vector layer (borders, coastlines, rivers). Values range from 0.5 to 10 pixels.',
  patterns: [
    'set {layer} width to {value}',
    '{layer} width {value}',
    'make {layer} thicker',
    'make {layer} thinner',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id (e.g. coastlines, borders, rivers)' },
    { name: 'value', type: 'number', required: true, description: 'Stroke width in pixels (0.5-10)', range: [0.5, 10] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().filter(l => l.def.kind === 'geojson').map(l => l.def.name).join(', ')
      return `Unknown vector layer "${input}". Available: ${available}`
    }

    const gjProps = getGeoJsonProperties(match.def.id)
    if (!gjProps) return `Cannot set width on "${match.def.name}" — only vector layers support stroke width.`

    let value: number
    if (raw.includes('thicker')) {
      value = Math.min(10, gjProps.strokeWidth + 1)
    } else if (raw.includes('thinner')) {
      value = Math.max(0.5, gjProps.strokeWidth - 1)
    } else {
      value = parseFloat(String(params.value ?? ''))
    }

    if (isNaN(value)) return `Invalid width value. Use a number between 0.5 and 10.`
    value = Math.max(0.5, Math.min(10, value))

    const ok = setGeoJsonProperty(match.def.id, 'strokeWidth', value)
    if (!ok) return `Cannot set width on "${match.def.name}".`

    playPing()
    return `${match.def.name} width set to ${value}px`
  },
}

// ── Set layer clustering ──

const setClusteringCmd: CommandEntry = {
  id: 'layers:set-clustering',
  name: 'Set layer clustering',
  module: 'layers',
  category: 'data',
  description: 'Enable or disable entity clustering on a GeoJSON layer. Clustering groups nearby points into a single labeled cluster for better performance and readability.',
  patterns: [
    'cluster {layer}',
    'uncluster {layer}',
    'set {layer} clustering {action}',
    'toggle clustering on {layer}',
    'enable clustering on {layer}',
    'disable clustering on {layer}',
  ],
  params: [
    { name: 'layer', type: 'string', required: true, description: 'Layer name or id' },
    { name: 'action', type: 'enum', required: false, description: 'Whether to enable, disable, or toggle clustering', options: ['on', 'off', 'toggle'] },
  ],
  handler: (params) => {
    const raw = String(params._raw ?? '').toLowerCase()
    const input = String(params.layer ?? '').toLowerCase().trim()

    const match = resolveLayer(input)
    if (!match) {
      const available = getAllLayers().map(l => l.def.name).join(', ')
      return `Unknown layer "${input}". Available: ${available}`
    }

    if (match.def.kind !== 'geojson') {
      return `Cannot set clustering on "${match.def.name}" — only GeoJSON layers support clustering.`
    }

    // Determine intent
    const action = String(params.action ?? '').toLowerCase()
    let enabled: boolean
    if (action === 'on' || raw.includes('enable') || raw.startsWith('cluster ')) {
      enabled = true
    } else if (action === 'off' || raw.includes('disable') || raw.startsWith('uncluster')) {
      enabled = false
    } else {
      // Toggle
      enabled = !match.clusteringEnabled
    }

    const ok = setLayerClustering(match.def.id, enabled)
    if (!ok) return `Cannot set clustering on "${match.def.name}" — layer has no loaded datasource. Show the layer first.`

    playPing()
    return `${match.def.name} clustering ${enabled ? 'enabled' : 'disabled'}`
  },
}

export const layerCommands: CommandEntry[] = [
  toggleLayerCmd,
  listLayersCmd,
  hideAllLayersCmd,
  setOpacityCmd,
  setBrightnessCmd,
  setContrastCmd,
  setSaturationCmd,
  setStrokeColorCmd,
  setStrokeWidthCmd,
  layerPropertiesCmd,
  resetLayerCmd,
  setClusteringCmd,
]
