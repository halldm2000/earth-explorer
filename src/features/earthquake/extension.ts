import type { Extension, ExtensionAPI } from '@/extensions/types'
import { earthquakeApp } from './index'

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
  id: earthquakeApp.id,
  name: earthquakeApp.name,
  kind: 'app',
  description: earthquakeApp.description,
  autoActivate: earthquakeApp.autoActivate,
  tags: ['hazards', 'seismology', 'geojson', 'real-time', 'usgs'],

  activate(api) {
    return earthquakeApp.activate(toAppContext(api))
  },

  deactivate: earthquakeApp.deactivate,
}

export default extension
