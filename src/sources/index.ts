/**
 * Sources module — data source catalog and provider factory.
 */

export type { DataSource, WmtsSource, WmsSource, XyzSource, GeoJsonSource, Tileset3dSource } from './types'
export { isWmtsSource, isWmsSource, isXyzSource, isGeoJsonSource, isTileset3dSource } from './types'
export { registerSource, registerSources, getSource, getAllSources, getSourcesByType, removeSource } from './catalog'
export { createImageryProvider, createGeoJsonDataSource, createTileset, isSourceAvailable } from './provider-factory'
