/**
 * Data Source types.
 *
 * A source describes WHERE data comes from — a URL, protocol, and metadata.
 * No rendering, no Cesium objects. Sources are registered in a global catalog
 * and referenced by layers via sourceId.
 */

// Common base fields
interface SourceBase {
  id: string
  name: string
  description?: string
  attribution: string
}

// WMTS tile source (NASA GIBS, etc.)
export interface WmtsSource extends SourceBase {
  type: 'wmts'
  url: string                     // template URL with {TileMatrix}/{TileRow}/{TileCol}
  layer: string                   // WMTS layer name
  style: string                   // typically 'default'
  tileMatrixSetID: string
  tileMatrixLabels?: string[]
  maximumLevel: number
  format: string                  // 'image/jpeg', 'image/png'
  tilingScheme?: 'geographic' | 'webmercator'  // default: 'webmercator'
}

// WMS tile source
export interface WmsSource extends SourceBase {
  type: 'wms'
  url: string
  layers: string                  // comma-separated WMS layer names
  parameters?: Record<string, string>
  maximumLevel?: number
  tilingScheme?: 'geographic' | 'webmercator'
}

// XYZ tile source (OpenSeaMap, OSM-style tiles)
export interface XyzSource extends SourceBase {
  type: 'xyz'
  url: string                     // URL template with {z}/{x}/{y}
  minimumLevel?: number
  maximumLevel?: number
  subdomains?: string[]           // for {s} substitution
  tilingScheme?: 'geographic' | 'webmercator'
}

// GeoJSON feature source
export interface GeoJsonSource extends SourceBase {
  type: 'geojson'
  url: string
  clampToGround?: boolean         // default: true
}

// 3D Tiles source
export interface Tileset3dSource extends SourceBase {
  type: '3dtiles'
  url?: string                    // tileset.json URL
  ionAssetId?: number             // alternative: Cesium Ion asset
  maximumScreenSpaceError?: number
}

// Discriminated union
export type DataSource = WmtsSource | WmsSource | XyzSource | GeoJsonSource | Tileset3dSource

// Type guards
export function isWmtsSource(s: DataSource): s is WmtsSource { return s.type === 'wmts' }
export function isWmsSource(s: DataSource): s is WmsSource { return s.type === 'wms' }
export function isXyzSource(s: DataSource): s is XyzSource { return s.type === 'xyz' }
export function isGeoJsonSource(s: DataSource): s is GeoJsonSource { return s.type === 'geojson' }
export function isTileset3dSource(s: DataSource): s is Tileset3dSource { return s.type === '3dtiles' }
