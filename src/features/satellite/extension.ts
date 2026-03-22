import type { Extension, ExtensionAPI } from '@/extensions/types'
import { satelliteApp } from './index'

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
  id: satelliteApp.id,
  name: satelliteApp.name,
  kind: 'app',
  description: satelliteApp.description,
  autoActivate: satelliteApp.autoActivate,
  tags: ['space', 'orbits', 'celestrak', 'real-time', 'tracking'],

  activate(api) {
    return satelliteApp.activate(toAppContext(api))
  },

  deactivate: satelliteApp.deactivate,
}

export default extension
