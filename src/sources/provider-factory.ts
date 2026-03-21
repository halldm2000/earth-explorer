/**
 * Provider Factory — creates Cesium providers from DataSource configs.
 *
 * This is the bridge between declarative source definitions and Cesium's
 * imperative imagery/data API. Layers call this on first show via sourceId.
 */

import * as Cesium from 'cesium'
import type { DataSource, WmtsSource, WmsSource, XyzSource, GeoJsonSource, Tileset3dSource } from './types'
import type { GeoJsonStyle } from '@/features/layers/types'

function makeTilingScheme(scheme?: 'geographic' | 'webmercator'): Cesium.TilingScheme {
  return scheme === 'geographic'
    ? new Cesium.GeographicTilingScheme()
    : new Cesium.WebMercatorTilingScheme()
}

function makeCredit(attribution: string): Cesium.Credit {
  return new Cesium.Credit(attribution)
}

// WMTS → WebMapTileServiceImageryProvider
function createWmtsProvider(source: WmtsSource): Cesium.WebMapTileServiceImageryProvider {
  return new Cesium.WebMapTileServiceImageryProvider({
    url: source.url,
    layer: source.layer,
    style: source.style,
    tileMatrixSetID: source.tileMatrixSetID,
    tileMatrixLabels: source.tileMatrixLabels,
    maximumLevel: source.maximumLevel,
    format: source.format,
    tilingScheme: makeTilingScheme(source.tilingScheme),
    credit: makeCredit(source.attribution),
  })
}

// WMS → WebMapServiceImageryProvider
function createWmsProvider(source: WmsSource): Cesium.WebMapServiceImageryProvider {
  return new Cesium.WebMapServiceImageryProvider({
    url: source.url,
    layers: source.layers,
    parameters: source.parameters,
    maximumLevel: source.maximumLevel,
    tilingScheme: makeTilingScheme(source.tilingScheme),
    credit: makeCredit(source.attribution),
  })
}

// XYZ → UrlTemplateImageryProvider
function createXyzProvider(source: XyzSource): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url: source.url,
    minimumLevel: source.minimumLevel,
    maximumLevel: source.maximumLevel,
    subdomains: source.subdomains,
    tilingScheme: makeTilingScheme(source.tilingScheme),
    credit: makeCredit(source.attribution),
  })
}

/** Create a Cesium ImageryProvider from a tile-based DataSource. */
export function createImageryProvider(source: DataSource): Cesium.ImageryProvider {
  switch (source.type) {
    case 'wmts': return createWmtsProvider(source)
    case 'wms': return createWmsProvider(source)
    case 'xyz': return createXyzProvider(source)
    default:
      throw new Error(`Cannot create imagery provider from source type: ${source.type}`)
  }
}

/** Load a GeoJSON DataSource from a GeoJsonSource config. */
export async function createGeoJsonDataSource(
  source: GeoJsonSource,
  style?: GeoJsonStyle,
): Promise<Cesium.GeoJsonDataSource> {
  const s = style ?? { stroke: '#ffffff', strokeWidth: 1 }
  return Cesium.GeoJsonDataSource.load(source.url, {
    stroke: Cesium.Color.fromCssColorString(s.stroke),
    strokeWidth: s.strokeWidth,
    fill: s.fill
      ? Cesium.Color.fromCssColorString(s.fill)
      : Cesium.Color.TRANSPARENT,
    clampToGround: source.clampToGround ?? true,
  })
}

/** Create a 3D Tileset from a Tileset3dSource config. */
export async function createTileset(source: Tileset3dSource): Promise<Cesium.Cesium3DTileset> {
  if (source.ionAssetId) {
    return Cesium.Cesium3DTileset.fromIonAssetId(source.ionAssetId, {
      maximumScreenSpaceError: source.maximumScreenSpaceError,
    })
  }
  if (source.url) {
    return Cesium.Cesium3DTileset.fromUrl(source.url, {
      maximumScreenSpaceError: source.maximumScreenSpaceError,
    })
  }
  throw new Error(`3D Tiles source "${source.id}" needs either url or ionAssetId`)
}

/**
 * Check whether a source's required dependencies are available.
 * For now, all sources are considered available (API key checking comes later).
 */
export function isSourceAvailable(source: DataSource): boolean {
  return !!source
}
