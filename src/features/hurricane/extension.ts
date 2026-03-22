import type { Extension, ExtensionAPI } from '@/extensions/types'
import { hurricaneApp } from './index'

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
  id: hurricaneApp.id,
  name: hurricaneApp.name,
  kind: 'app',
  description: hurricaneApp.description,
  autoActivate: hurricaneApp.autoActivate,
  tags: ['hazards', 'weather', 'tropical-cyclones', 'real-time', 'gdacs'],

  activate(api) {
    return hurricaneApp.activate(toAppContext(api))
  },

  deactivate: hurricaneApp.deactivate,
}

export default extension
