import type { Extension, ExtensionAPI } from '@/extensions/types'
import { flightsApp } from './index'

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
  id: flightsApp.id,
  name: flightsApp.name,
  kind: 'app',
  description: flightsApp.description,
  autoActivate: flightsApp.autoActivate,
  tags: ['transport', 'aviation', 'ads-b', 'real-time', 'opensky'],

  activate(api) {
    return flightsApp.activate(toAppContext(api))
  },

  deactivate: flightsApp.deactivate,
}

export default extension
