import * as Cesium from 'cesium'
import type { Extension, ExtensionAPI } from '@/extensions/types'

const LAYER_ID = 'graticule-grid'

let _api: ExtensionAPI | null = null

const extension: Extension = {
  id: 'graticule',
  name: 'Lat/Lon Graticule',
  kind: 'capability',
  description: 'Latitude/longitude grid lines every 10° on the globe surface.',
  tags: ['grid', 'graticule', 'overlay', 'navigation'],
  autoActivate: false,

  async activate(api: ExtensionAPI) {
    _api = api

    api.layers.register({
      id: LAYER_ID,
      name: 'Lat/Lon Graticule',
      kind: 'imagery',
      category: 'overlays',
      description: 'Latitude/longitude grid lines every 10°',
      defaultOn: false,
      imageryProvider: () => new Cesium.GridImageryProvider({
        cells: 18,
        color: Cesium.Color.WHITE.withAlpha(0.15),
        glowColor: Cesium.Color.TRANSPARENT,
        glowWidth: 0,
        backgroundColor: Cesium.Color.TRANSPARENT,
      }),
    })

    await api.layers.show(LAYER_ID)

    return {
      commands: [
        {
          id: 'graticule:show',
          name: 'Show Graticule',
          module: 'graticule',
          description: 'Show latitude/longitude grid lines on the globe',
          patterns: ['show graticule', 'show grid', 'graticule on', 'grid lines'],
          params: [],
          handler: async () => {
            await api.layers.show(LAYER_ID)
            return 'Graticule grid enabled — showing lat/lon lines every 10°.'
          },
          category: 'view',
        },
        {
          id: 'graticule:hide',
          name: 'Hide Graticule',
          module: 'graticule',
          description: 'Hide latitude/longitude grid lines',
          patterns: ['hide graticule', 'hide grid', 'graticule off', 'grid lines off'],
          params: [],
          handler: async () => {
            api.layers.hide(LAYER_ID)
            return 'Graticule grid hidden.'
          },
          category: 'view',
        },
      ],
      welcome: 'Graticule active — lat/lon grid lines every 10°.',
    }
  },

  deactivate() {
    if (_api) {
      _api.layers.remove(LAYER_ID)
      _api = null
    }
  },
}

export default extension
