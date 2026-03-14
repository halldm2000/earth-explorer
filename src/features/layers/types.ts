import * as Cesium from 'cesium'

/**
 * A data layer that can be toggled on/off on the globe.
 *
 * Three flavors today:
 *   - 'geojson'  — vector overlays (borders, rivers, coastlines)
 *   - 'imagery'  — raster tile layers (GIBS, NOAA WMS, weather tiles)
 *   - 'tileset'  — 3D Tiles (future: custom Earth-2 output tilesets)
 *
 * The registry holds definitions; the manager holds live Cesium objects.
 */

export type LayerKind = 'geojson' | 'imagery' | 'tileset'

export interface GeoJsonStyle {
  stroke: string       // CSS color
  strokeWidth: number  // pixels
  fill?: string        // CSS color with alpha, or omit for no fill
}

export interface LayerDef {
  id: string
  name: string
  kind: LayerKind
  category: string            // grouping key: 'boundaries', 'weather', 'satellite', etc.
  description: string
  defaultOn: boolean

  // GeoJSON layers
  url?: string
  style?: GeoJsonStyle

  // Imagery layers (future)
  imageryProvider?: () => Cesium.ImageryProvider

  // 3D Tileset layers (future)
  tilesetOptions?: Cesium.Cesium3DTileset.ConstructorOptions
}

export interface LiveLayer {
  def: LayerDef
  visible: boolean
  // The actual Cesium object — varies by kind
  datasource?: Cesium.GeoJsonDataSource
  imageryLayer?: Cesium.ImageryLayer
  tileset?: Cesium.Cesium3DTileset
}
