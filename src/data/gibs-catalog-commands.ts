/**
 * GIBS Catalog AI commands.
 *
 * Exposes the full 1,123-product NASA GIBS catalog to AI assistants via MCP.
 * Allows searching, browsing by category, adding/removing arbitrary products,
 * and listing what's currently active on the globe.
 */

import type { CommandEntry } from '@/ai/types'
import { getGibsCatalog, searchCatalog, getCategories, type GibsCatalogEntry } from './gibs-catalog'
import { addGibsLayer, removeGibsLayer, isGibsLayerActive, zoomToResolution } from './gibs-layer-factory'
import { getAllLayers } from '@/features/layers/manager'
import { playPing } from '@/audio/sounds'

/** Format a catalog entry as a one-line summary for AI output. */
function formatEntry(e: GibsCatalogEntry, showActive = false): string {
  const res = zoomToResolution(e.z)
  const period = e.p ?? 'static'
  const active = showActive && isGibsLayerActive(e.id) ? ' [ON]' : ''
  const group = e.g ? ` · ${e.g}` : ''
  return `${e.t} — ${e.s}${group} · ${period} · ${res}${active}  (id: ${e.id})`
}

// ── Search the catalog ──

const searchCmd: CommandEntry = {
  id: 'gibs-catalog:search',
  name: 'Search GIBS catalog',
  module: 'gibs-catalog',
  category: 'data',
  description: 'Search the full NASA GIBS catalog of 1,100+ satellite imagery products by keyword. Returns matching products with IDs that can be added to the globe. Search by topic (e.g. "fire", "ozone", "precipitation"), instrument (e.g. "MODIS", "VIIRS"), or category (e.g. "Atmosphere", "Oceans").',
  patterns: [
    'search gibs {query}',
    'find gibs {query}',
    'gibs catalog {query}',
    'search satellite {query}',
    'find satellite imagery {query}',
    'what gibs products for {query}',
    'nasa imagery {query}',
  ],
  params: [
    { name: 'query', type: 'string', required: true, description: 'Search term: topic, instrument, product name, or category' },
    { name: 'category', type: 'string', required: false, description: 'Optional category filter: Atmosphere, Biosphere, Cryosphere, Human Dimensions, Land Surface, Oceans, Spectral/Engineering, Terrestrial Hydrosphere, Floods, Other' },
  ],
  handler: async (params) => {
    const query = String(params.query ?? '').trim()
    if (!query) return 'Please provide a search term (e.g. "fire", "ozone", "sea ice", "MODIS").'

    const catalog = await getGibsCatalog()
    let results = searchCatalog(catalog, query)

    // Optional category filter
    const cat = String(params.category ?? '').trim()
    if (cat) {
      const catLower = cat.toLowerCase()
      results = results.filter(e => e.c.toLowerCase().includes(catLower))
    }

    if (results.length === 0) {
      return `No GIBS products found for "${query}"${cat ? ` in category "${cat}"` : ''}. Try a broader term or check categories with the gibs-catalog:categories tool.`
    }

    const shown = results.slice(0, 25)
    const lines = shown.map(e => formatEntry(e, true))
    const more = results.length > 25 ? `\n\n... and ${results.length - 25} more. Refine your search for fewer results.` : ''

    return `**GIBS Catalog Search: "${query}"** (${results.length} results)\n\n${lines.join('\n')}${more}\n\nUse the gibs-catalog:add tool with a product ID to add one to the globe.`
  },
}

// ── Add a catalog product ──

const addCmd: CommandEntry = {
  id: 'gibs-catalog:add',
  name: 'Add GIBS catalog layer',
  module: 'gibs-catalog',
  category: 'data',
  description: 'Add any NASA GIBS product to the globe from the 1,100+ product catalog. Provide the exact product ID (from search results) or a search term to find and add the best match.',
  patterns: [
    'add gibs {product}',
    'show gibs {product}',
    'enable gibs {product}',
    'add satellite layer {product}',
    'show satellite {product} layer',
  ],
  params: [
    { name: 'product', type: 'string', required: true, description: 'GIBS product ID (e.g. VIIRS_SNPP_CorrectedReflectance_TrueColor) or search term' },
  ],
  handler: async (params) => {
    const input = String(params.product ?? '').trim()
    if (!input) return 'Please provide a GIBS product ID or search term.'

    const catalog = await getGibsCatalog()

    // Try exact ID match first
    let entry = catalog.find(e => e.id === input)

    // Try case-insensitive ID match
    if (!entry) {
      const lower = input.toLowerCase()
      entry = catalog.find(e => e.id.toLowerCase() === lower)
    }

    // Fuzzy search as fallback — pick the best match
    if (!entry) {
      const results = searchCatalog(catalog, input)
      if (results.length === 0) {
        return `No GIBS product found matching "${input}". Use gibs-catalog:search to browse available products.`
      }
      if (results.length > 1) {
        // If multiple matches, show top 5 and ask to be more specific
        const top = results.slice(0, 5).map(e => formatEntry(e, true))
        return `Multiple GIBS products match "${input}" (${results.length} total). Top matches:\n\n${top.join('\n')}\n\nPlease use the exact product ID to add one.`
      }
      entry = results[0]
    }

    if (isGibsLayerActive(entry.id)) {
      return `${entry.t} is already on the globe.`
    }

    await addGibsLayer(entry)
    playPing()
    const res = zoomToResolution(entry.z)
    return `Added: ${entry.t} (${entry.s}, ${res})\nProduct ID: ${entry.id}\n\nUse layers:set-opacity, layers:set-brightness, etc. to adjust visual properties.`
  },
}

// ── Remove a catalog product ──

const removeCmd: CommandEntry = {
  id: 'gibs-catalog:remove',
  name: 'Remove GIBS catalog layer',
  module: 'gibs-catalog',
  category: 'data',
  description: 'Remove a GIBS catalog product from the globe. Provide the product ID or a search term to find and remove it.',
  patterns: [
    'remove gibs {product}',
    'hide gibs {product}',
    'disable gibs {product}',
    'remove satellite layer {product}',
  ],
  params: [
    { name: 'product', type: 'string', required: true, description: 'GIBS product ID or search term' },
  ],
  handler: async (params) => {
    const input = String(params.product ?? '').trim()
    if (!input) return 'Please provide a GIBS product ID or search term.'

    const catalog = await getGibsCatalog()

    // Try exact ID match
    let entry = catalog.find(e => e.id === input)
    if (!entry) {
      const lower = input.toLowerCase()
      entry = catalog.find(e => e.id.toLowerCase() === lower)
    }
    // Fuzzy search
    if (!entry) {
      const results = searchCatalog(catalog, input).filter(e => isGibsLayerActive(e.id))
      if (results.length === 0) {
        return `No active GIBS product found matching "${input}". Use gibs-catalog:active to see what's on the globe.`
      }
      if (results.length > 1) {
        const top = results.slice(0, 5).map(e => formatEntry(e))
        return `Multiple active products match "${input}". Which one?\n\n${top.join('\n')}\n\nPlease use the exact product ID.`
      }
      entry = results[0]
    }

    if (!isGibsLayerActive(entry.id)) {
      return `${entry.t} is not currently on the globe.`
    }

    removeGibsLayer(entry.id)
    playPing()
    return `Removed: ${entry.t}`
  },
}

// ── List categories ──

const categoriesCmd: CommandEntry = {
  id: 'gibs-catalog:categories',
  name: 'List GIBS categories',
  module: 'gibs-catalog',
  category: 'data',
  description: 'List all NASA GIBS catalog categories with product counts. Useful for browsing what types of satellite data are available.',
  patterns: [
    'gibs categories',
    'gibs catalog categories',
    'what types of satellite data',
    'what satellite categories',
    'list gibs categories',
  ],
  params: [],
  handler: async () => {
    const catalog = await getGibsCatalog()
    const categories = getCategories(catalog)

    const lines = categories.map(c => {
      const count = catalog.filter(e => e.c === c).length
      return `- **${c}** (${count} products)`
    })

    return `**NASA GIBS Catalog Categories** (${catalog.length} total products)\n\n${lines.join('\n')}\n\nUse gibs-catalog:search with a keyword or category to find specific products.`
  },
}

// ── List active catalog layers ──

const activeCmd: CommandEntry = {
  id: 'gibs-catalog:active',
  name: 'List active GIBS layers',
  module: 'gibs-catalog',
  category: 'data',
  description: 'List all GIBS satellite imagery layers currently displayed on the globe, including both preset layers (satellite view, night lights, etc.) and any products added from the catalog.',
  patterns: [
    'active gibs layers',
    'what satellite layers are on',
    'active satellite layers',
    'which gibs layers',
    'current gibs layers',
  ],
  params: [],
  handler: async () => {
    const allLive = getAllLayers()
    const gibsLayers = allLive.filter(l =>
      l.visible && (
        l.def.category === 'satellite' ||
        l.def.category === 'gibs-catalog'
      ),
    )

    if (gibsLayers.length === 0) {
      return 'No satellite imagery layers are currently active. Use gibs:toggle or gibs-catalog:add to show one.'
    }

    const lines = gibsLayers.map(l => {
      const props = l.properties
      const mods: string[] = []
      if (props.alpha < 1) mods.push(`opacity ${Math.round(props.alpha * 100)}%`)
      if (props.brightness !== 1) mods.push(`brightness ${props.brightness.toFixed(1)}`)
      if (props.contrast !== 1) mods.push(`contrast ${props.contrast.toFixed(1)}`)
      if (props.saturation !== 1) mods.push(`saturation ${props.saturation.toFixed(1)}`)
      const modStr = mods.length > 0 ? ` [${mods.join(', ')}]` : ''
      return `● ${l.def.name} — ${l.def.description}${modStr}`
    })

    return `**Active Satellite Imagery** (${gibsLayers.length} layers)\n\n${lines.join('\n')}\n\nUse layers:set-opacity, layers:set-brightness, etc. to adjust properties, or gibs-catalog:remove to remove a layer.`
  },
}

export const gibsCatalogCommands: CommandEntry[] = [
  searchCmd,
  addCmd,
  removeCmd,
  categoriesCmd,
  activeCmd,
]
