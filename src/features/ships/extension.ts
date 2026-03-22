import type { Extension, ExtensionAPI } from '@/extensions/types'
import { shipsApp } from './index'

/** Adapt ExtensionAPI to the legacy AppContext shape. */
function toAppContext(api: ExtensionAPI) {
  return {
    addLayer: api.layers.register,
    removeLayer: api.layers.remove,
    showLayer: api.layers.show,
    hideLayer: api.layers.hide,
    reloadLayer: api.layers.reload,
    getViewer: api.unsafe.getViewer,
    onTick: api.onTick,
  }
}

const extension: Extension = {
  id: shipsApp.id,
  name: shipsApp.name,
  kind: 'app',
  description: shipsApp.description,
  autoActivate: shipsApp.autoActivate,
  tags: ['transport', 'maritime', 'ais', 'real-time', 'vessels'],

  activate(api) {
    return shipsApp.activate(toAppContext(api))
  },

  deactivate: shipsApp.deactivate,
}

export default extension
