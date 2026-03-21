/**
 * Layers feature: toggleable data overlays on the globe.
 *
 * Registers generic layer commands (toggle, list, hide-all) that operate
 * on the full layer catalog. Layer definitions come from data packs and apps,
 * not from this module. Layers are lazy-loaded on first toggle.
 */

import { registry } from '@/ai/registry'
import { removeAllLayers } from './manager'
import { layerCommands } from './commands'

let registered = false

/** Initialize the layer system: register generic layer commands. */
export function initLayers(): void {
  if (registered) return

  // Register generic layer chat commands (toggle, list, hide-all)
  registry.registerAll(layerCommands)
  registered = true

  console.log('[layers] Layer commands registered')
}

export function destroyLayers(): void {
  removeAllLayers()
  registry.unregisterModule('layers')
  registered = false
}

// Re-export for external use
export { registerLayer, getAllLayers, getLayer, getLayersByCategory, removeLayer } from './manager'
export { showLayer, hideLayer, toggleLayer, reloadLayer } from './manager'
export { setLayerProperty, setLayerColorToAlpha, reorderLayer, getLayerOrder, getLayerProperties, resetLayerProperties } from './manager'
