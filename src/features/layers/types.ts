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

/** Legend definition for visual data layers. */
export interface LayerLegend {
  type: 'gradient' | 'categorical'
  title: string
  units?: string
  /** For gradient legends: ordered color stops from min to max. */
  colorStops?: { value: number; color: string; label?: string }[]
  /** For categorical legends: discrete color/label pairs. */
  categories?: { color: string; label: string }[]
}

export interface LayerDef {
  id: string
  name: string
  kind: LayerKind
  category: string            // grouping key: 'boundaries', 'weather', 'satellite', etc.
  description: string
  defaultOn: boolean

  /** Optional legend/colorbar for this layer. */
  legend?: LayerLegend

  /** True for layers that change with date (e.g. GIBS daily imagery). Used by the time slider. */
  temporal?: boolean

  /** Optional: reference a registered DataSource by ID instead of embedding provider config */
  sourceId?: string

  // GeoJSON layers
  url?: string
  style?: GeoJsonStyle
  /** Custom entity styling after GeoJSON load (e.g. size points by magnitude) */
  styleEntities?: (entities: Cesium.EntityCollection) => void
  // Imagery layers (sync or async provider factory, e.g. Ion assets)
  imageryProvider?: () => Cesium.ImageryProvider | Promise<Cesium.ImageryProvider>

  // 3D Tileset layers (future)
  tilesetOptions?: Cesium.Cesium3DTileset.ConstructorOptions
}

/** Per-layer visual properties for imagery layers. */
export interface LayerProperties {
  alpha: number         // 0-1, default 1
  brightness: number    // 0-3, default 1
  contrast: number      // 0-3, default 1
  saturation: number    // 0-3, default 1
  hue: number           // 0-2π radians, default 0
  gamma: number         // 0-3, default 1
  colorToAlpha?: {
    enabled: boolean
    color: string       // CSS hex color, e.g. '#000000'
    threshold: number   // 0-1, default 0.004
  }
}

export const DEFAULT_LAYER_PROPERTIES: LayerProperties = {
  alpha: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  gamma: 1,
}

/** Per-layer visual properties for GeoJSON (vector) layers. */
export interface GeoJsonProperties {
  strokeColor: string   // CSS hex color
  strokeWidth: number   // pixels, 0.5-10
  alpha: number         // 0-1, default 1
}

export const DEFAULT_GEOJSON_PROPERTIES: GeoJsonProperties = {
  strokeColor: '#ffffff',
  strokeWidth: 1,
  alpha: 1,
}

export interface LiveLayer {
  def: LayerDef
  visible: boolean
  properties: LayerProperties
  geoJsonProperties?: GeoJsonProperties
  // The actual Cesium object — varies by kind
  datasource?: Cesium.GeoJsonDataSource
  imageryLayer?: Cesium.ImageryLayer
  tileset?: Cesium.Cesium3DTileset
}
