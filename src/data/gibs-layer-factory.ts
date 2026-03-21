/**
 * Dynamic GIBS layer factory.
 *
 * Creates LayerDef objects from catalog entries and registers them with
 * the layer manager on the fly when users browse and add from the catalog.
 *
 * Also manages the global GIBS date used by the time slider. All temporal
 * GIBS layers read the global date at provider-creation time, so changing
 * the date and reloading layers shows imagery for a different day.
 */

import * as Cesium from 'cesium'
import type { LayerDef, LayerLegend } from '@/features/layers/types'
import type { GibsCatalogEntry } from './gibs-catalog'
import { registerLayer, showLayer, removeLayer, getLayer, getAllLayers, reloadLayerBuffered, reloadLayerBufferedWithPrefetch } from '@/features/layers/manager'
import { prefetchAdjacentDates } from '@/features/layers/prefetch'
import { wrapWithCache } from './cached-imagery-provider'

const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

// ── Global date for temporal GIBS layers ──

/** Default date: 2 days ago (GIBS processing delay) */
function defaultGibsDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  return d.toISOString().slice(0, 10)
}

let _globalDate: string = defaultGibsDate()

/** Whether the user has explicitly changed the date via the time slider. */
let _dateExplicitlySet = false

/**
 * Temporary date override for prefetching. When set, `getGlobalDate()` returns
 * this instead of `_globalDate`. This avoids mutating the real global date
 * during background prefetch operations. Only used within synchronous
 * provider factory calls (set before, cleared after).
 */
let _dateOverride: string | null = null

/** Get the current global date for GIBS temporal layers (YYYY-MM-DD). */
export function getGlobalDate(): string {
  return _dateOverride ?? _globalDate
}

/** Get the real global date, ignoring any temporary prefetch override. */
export function getRealGlobalDate(): string {
  return _globalDate
}

/**
 * Temporarily override the date returned by `getGlobalDate()`.
 * Used by the prefetch engine to create providers for adjacent dates
 * without mutating the real global date. Call with `null` to clear.
 * @internal — only for use by the prefetch engine
 */
export function setDateOverride(date: string | null): void {
  _dateOverride = date
}

/** Whether the user has explicitly set a date (vs. the default). */
export function isDateExplicitlySet(): boolean {
  return _dateExplicitlySet
}

/** Set the global date for GIBS temporal layers. Does NOT reload layers — call reloadTemporalLayers() after. */
export function setGlobalDate(date: string): void {
  _globalDate = date
  _dateExplicitlySet = true
}

/** Get the default "latest" date (2 days ago). */
export function getLatestDate(): string {
  return defaultGibsDate()
}

/**
 * Reload all visible temporal GIBS layers with the current global date.
 * Uses prefetch-aware double-buffered reload: if the target date was
 * pre-cached, swaps instantly. Otherwise falls back to the standard
 * double-buffered reload (keeps old imagery visible while new tiles load).
 *
 * After the reload completes, triggers background prefetch of adjacent dates
 * (D-1, D+1) so the next scrub step is instant.
 */
export async function reloadTemporalLayers(): Promise<void> {
  const layers = getAllLayers()
  const temporalLayers = layers.filter(
    l => l.visible && l.def.temporal && l.def.kind === 'imagery',
  )

  const targetDate = _globalDate
  const reloads: Promise<boolean>[] = []
  for (const layer of temporalLayers) {
    reloads.push(reloadLayerBufferedWithPrefetch(layer.def.id, targetDate))
  }
  await Promise.all(reloads)

  // Trigger background prefetch for adjacent dates (non-blocking)
  if (temporalLayers.length > 0) {
    prefetchAdjacentDates(temporalLayers, targetDate)
  }
}

/** Check whether any temporal imagery layer is currently visible. */
export function hasVisibleTemporalLayers(): boolean {
  return getAllLayers().some(l => l.visible && l.def.temporal && l.def.kind === 'imagery')
}

// ── GIBS configuration ──

/**
 * Maps GIBS product IDs to existing pack layer IDs.
 * These products are pre-registered by the gibs/gibs-extra packs.
 * Lets the catalog browser show them as "already added".
 */
const PACK_LAYER_MAP: Record<string, string> = {
  'VIIRS_SNPP_CorrectedReflectance_TrueColor': 'gibs-modis-truecolor',
  'VIIRS_Black_Marble': 'gibs-viirs-nightlights',
  'GHRSST_L4_MUR_Sea_Surface_Temperature': 'gibs-sst',
  'MODIS_Terra_Cloud_Top_Temp_Night': 'gibs-cloud-cover',
  'MODIS_Terra_NDVI_8Day': 'gibs-ndvi',
  'MODIS_Terra_NDSI_Snow_Cover': 'gibs-snow',
  'MODIS_Terra_Aerosol': 'gibs-aerosol',
  'MODIS_Terra_Land_Surface_Temp_Day': 'gibs-lst',
}

/** Get the best date string for a GIBS product.
 *
 *  Strategy:
 *  - If the user explicitly set a date (time slider), always use it.
 *  - Otherwise, prefer the catalog's recommended date (`entry.d`) which is
 *    known to have valid tiles. Many products (GEDI, AMSRE, TRMM, etc.) are
 *    discontinued or have sparse temporal coverage, so the default "2 days ago"
 *    date would 404 for ~50% of catalog products.
 *  - Strip any time component from subdaily dates (GIBS wants YYYY-MM-DD). */
function getGibsDate(entry: GibsCatalogEntry): string {
  // If user explicitly changed the date, respect it
  if (_dateExplicitlySet) {
    return _globalDate
  }
  // Prefer the catalog's recommended date (known to have valid tiles)
  if (entry.d) {
    return entry.d.slice(0, 10) // strip time component for subdaily entries
  }
  // Fallback: global date (2 days ago)
  return _globalDate
}

/** Build tile matrix labels: level numbers "0", "1", "2", ... */
function matrixLabels(maxLevel: number): string[] {
  return Array.from({ length: maxLevel + 1 }, (_, i) => String(i))
}

// ── Coverage bounds heuristic ──
//
// GIBS GetCapabilities reports the full WebMercator extent (-85.05° to 85.05°)
// for ALL 1,235 products — it doesn't encode actual data coverage. But many
// products 404 at polar latitudes (e.g., SST has no data over ice, GEDI only
// covers ±51.6° from the ISS orbit). We map product group names and instrument
// types to known coverage rectangles. This prevents Cesium from requesting
// tiles that will definitely 404, reducing console spam and network waste.

type LatRange = [number, number] // [south, north] in degrees

/** Coverage bounds by product group name. */
const GROUP_COVERAGE: Record<string, LatRange> = {
  // Ocean products: no data over polar ice
  'Sea Surface Temperature': [-79, 85],
  'Sea Surface Temperature Anomalies': [-79, 85],
  'Sea Surface Salinity': [-79, 79],
  'Chlorophyll a': [-79, 79],

  // Atmospheric: sensors don't cover deep polar regions
  'Aerosol Optical Depth': [-80, 80],
  'Aerosol Index': [-80, 80],
  'Aerosol Extinction': [-80, 80],
  'Nitrogen Dioxide': [-80, 80],
  'Sulfur Dioxide': [-80, 80],
  'Carbon Monoxide': [-80, 80],

  // Vegetation: no data over Antarctic ice
  'Vegetation Indices': [-80, 86],
}

/** Coverage bounds by instrument subtitle (for ISS orbit, etc.) */
const INSTRUMENT_COVERAGE: Record<string, LatRange> = {
  'ISS / GEDI': [-51.6, 51.6],
  'ISS / LIS': [-51.6, 51.6],
}

/** Get coverage rectangle for a catalog entry, or undefined for full-globe. */
function getCoverageRectangle(entry: GibsCatalogEntry): Cesium.Rectangle | undefined {
  // Check instrument first (ISS orbit constraint is strongest)
  const instrBounds = INSTRUMENT_COVERAGE[entry.s]
  if (instrBounds) {
    return Cesium.Rectangle.fromDegrees(-180, instrBounds[0], 180, instrBounds[1])
  }
  // Check group name
  if (entry.g) {
    const groupBounds = GROUP_COVERAGE[entry.g]
    if (groupBounds) {
      return Cesium.Rectangle.fromDegrees(-180, groupBounds[0], 180, groupBounds[1])
    }
  }
  return undefined
}

/** Create a GIBS WMTS imagery provider for a catalog entry */
function createGibsProvider(entry: GibsCatalogEntry): Cesium.WebMapTileServiceImageryProvider {
  const ext = entry.f === 'j' ? 'jpg' : 'png'
  const tileMatrixSet = `GoogleMapsCompatible_Level${entry.z}`
  const date = entry.p ? getGibsDate(entry) : ''
  const timePart = date ? `/${date}` : ''
  const labels = matrixLabels(entry.z)
  const rectangle = getCoverageRectangle(entry)

  const provider = new Cesium.WebMapTileServiceImageryProvider({
    url: `${GIBS_BASE}/${entry.id}/default${timePart}/${tileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`,
    layer: entry.id,
    style: 'default',
    tileMatrixSetID: tileMatrixSet,
    tileMatrixLabels: labels,
    maximumLevel: entry.z,
    format: entry.f === 'j' ? 'image/jpeg' : 'image/png',
    tileWidth: 256,
    tileHeight: 256,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: new Cesium.Credit('NASA GIBS'),
    rectangle,
  })

  // Suppress tile 404 errors — many GIBS products have sparse coverage
  // beyond what the rectangle heuristic catches. GIBS returns 404 for tiles
  // with no data instead of transparent tiles.
  provider.errorEvent.addEventListener((err: any) => {
    err.retry = false
  })

  // Wrap with shared LRU tile cache so date-scrubbing reuses fetched tiles
  const cachePrefix = `${entry.id}:${date || 'static'}`
  wrapWithCache(provider, cachePrefix)

  return provider
}

// ── Auto-legend for catalog entries ──
//
// Maps GIBS group names to appropriate colorbar legends.
// Covers the most common groups (~80% of the 1,123 products).
// Products with no matching group get no legend (just a toggle).

const LEGEND_DEFS: Record<string, LayerLegend> = {
  // Temperature family
  'Temperature': {
    type: 'gradient', title: 'Temperature', units: 'K',
    colorStops: [
      { value: 200, color: '#2166ac', label: '200' },
      { value: 240, color: '#67a9cf' },
      { value: 260, color: '#d1e5f0' },
      { value: 280, color: '#fddbc7' },
      { value: 300, color: '#ef8a62' },
      { value: 320, color: '#b2182b', label: '320' },
    ],
  },
  'Land Surface Temperature': {
    type: 'gradient', title: 'Land Surface Temp', units: '\u00B0C',
    colorStops: [
      { value: -20, color: '#2166ac', label: '-20' },
      { value: 0,   color: '#67a9cf' },
      { value: 15,  color: '#d1e5f0' },
      { value: 25,  color: '#fddbc7' },
      { value: 40,  color: '#ef8a62' },
      { value: 60,  color: '#b2182b', label: '60' },
    ],
  },
  'Sea Surface Temperature': {
    type: 'gradient', title: 'Sea Surface Temp', units: '\u00B0C',
    colorStops: [
      { value: -2,  color: '#04136b', label: '-2' },
      { value: 5,   color: '#1a5dab' },
      { value: 12,  color: '#3e9fd3' },
      { value: 18,  color: '#6fd0a7' },
      { value: 24,  color: '#c8e64e' },
      { value: 30,  color: '#f5a623' },
      { value: 35,  color: '#d62f27', label: '35' },
    ],
  },
  'Sea Surface Temperature Anomalies': {
    type: 'gradient', title: 'SST Anomaly', units: '\u00B0C',
    colorStops: [
      { value: -5, color: '#2166ac', label: '-5' },
      { value: -2, color: '#67a9cf' },
      { value: 0,  color: '#f7f7f7' },
      { value: 2,  color: '#ef8a62' },
      { value: 5,  color: '#b2182b', label: '5' },
    ],
  },
  'Ice Surface Temperature': {
    type: 'gradient', title: 'Ice Surface Temp', units: 'K',
    colorStops: [
      { value: 213, color: '#f7fbff', label: '213' },
      { value: 233, color: '#c6dbef' },
      { value: 253, color: '#6baed6' },
      { value: 268, color: '#2171b5' },
      { value: 273, color: '#08306b', label: '273' },
    ],
  },
  'Brightness Temperature': {
    type: 'gradient', title: 'Brightness Temp', units: 'K',
    colorStops: [
      { value: 180, color: '#ffffff', label: '180' },
      { value: 220, color: '#c6dbef' },
      { value: 250, color: '#6baed6' },
      { value: 280, color: '#2171b5' },
      { value: 320, color: '#08306b', label: '320' },
    ],
  },
  'Cloud Top Temperature': {
    type: 'gradient', title: 'Cloud Top Temp', units: 'K',
    colorStops: [
      { value: 180, color: '#ffffff', label: '180' },
      { value: 200, color: '#d0d0e8' },
      { value: 220, color: '#9898c8' },
      { value: 240, color: '#6060a0' },
      { value: 260, color: '#303078' },
      { value: 280, color: '#101050', label: '280' },
    ],
  },

  // Atmospheric
  'Aerosol Optical Depth': {
    type: 'gradient', title: 'Aerosol Optical Depth',
    colorStops: [
      { value: 0.0, color: '#ffffb2', label: '0.0' },
      { value: 1.0, color: '#f5c842' },
      { value: 2.0, color: '#e87530' },
      { value: 3.0, color: '#d62f27' },
      { value: 4.0, color: '#9e1a63' },
      { value: 5.0, color: '#4a0057', label: '5.0' },
    ],
  },
  'Aerosol Index': {
    type: 'gradient', title: 'Aerosol Index',
    colorStops: [
      { value: -1, color: '#2166ac', label: '-1' },
      { value: 0,  color: '#f7f7f7' },
      { value: 2,  color: '#fddbc7' },
      { value: 5,  color: '#d62f27', label: '5' },
    ],
  },
  'Carbon Monoxide': {
    type: 'gradient', title: 'CO Mixing Ratio', units: 'ppbv',
    colorStops: [
      { value: 0,   color: '#ffffcc', label: '0' },
      { value: 50,  color: '#c2e699' },
      { value: 100, color: '#78c679' },
      { value: 150, color: '#238443' },
      { value: 200, color: '#004529', label: '200' },
    ],
  },
  'Nitrogen Dioxide': {
    type: 'gradient', title: 'NO\u2082 Column', units: 'mol/cm\u00B2',
    colorStops: [
      { value: 0, color: '#ffffcc', label: 'Low' },
      { value: 1, color: '#a1dab4' },
      { value: 2, color: '#41b6c4' },
      { value: 3, color: '#225ea8' },
      { value: 4, color: '#081d58', label: 'High' },
    ],
  },
  'Sulfur Dioxide': {
    type: 'gradient', title: 'SO\u2082 Column', units: 'DU',
    colorStops: [
      { value: 0, color: '#ffffb2', label: '0' },
      { value: 1, color: '#fecc5c' },
      { value: 2, color: '#fd8d3c' },
      { value: 5, color: '#e31a1c' },
      { value: 10, color: '#800026', label: '10' },
    ],
  },
  'Ozone': {
    type: 'gradient', title: 'Total Ozone', units: 'DU',
    colorStops: [
      { value: 100, color: '#7b3294', label: '100' },
      { value: 200, color: '#c2a5cf' },
      { value: 300, color: '#f7f7f7' },
      { value: 400, color: '#a6dba0' },
      { value: 500, color: '#008837', label: '500' },
    ],
  },
  'Relative Humidity': {
    type: 'gradient', title: 'Relative Humidity', units: '%',
    colorStops: [
      { value: 0,   color: '#8c510a', label: '0' },
      { value: 25,  color: '#d8b365' },
      { value: 50,  color: '#f6e8c3' },
      { value: 75,  color: '#7fbf7b' },
      { value: 100, color: '#1b7837', label: '100' },
    ],
  },
  'Water Vapor': {
    type: 'gradient', title: 'Water Vapor', units: 'cm',
    colorStops: [
      { value: 0,  color: '#f7fcf5', label: '0' },
      { value: 1,  color: '#c7e9c0' },
      { value: 2,  color: '#74c476' },
      { value: 4,  color: '#238b45' },
      { value: 6,  color: '#00441b', label: '6' },
    ],
  },

  // Precipitation & clouds
  'Precipitation Rate': {
    type: 'gradient', title: 'Precipitation Rate', units: 'mm/hr',
    colorStops: [
      { value: 0,  color: '#f7fbff', label: '0' },
      { value: 2,  color: '#6baed6' },
      { value: 5,  color: '#2171b5' },
      { value: 10, color: '#084594' },
      { value: 25, color: '#08306b', label: '25' },
    ],
  },
  'Cloud Fraction': {
    type: 'gradient', title: 'Cloud Fraction', units: '%',
    colorStops: [
      { value: 0,   color: '#2171b5', label: '0' },
      { value: 25,  color: '#6baed6' },
      { value: 50,  color: '#bdd7e7' },
      { value: 75,  color: '#d0d0d0' },
      { value: 100, color: '#ffffff', label: '100' },
    ],
  },
  'Cloud Optical Thickness': {
    type: 'gradient', title: 'Cloud Optical Thickness',
    colorStops: [
      { value: 0,   color: '#f7fbff', label: '0' },
      { value: 10,  color: '#c6dbef' },
      { value: 20,  color: '#6baed6' },
      { value: 40,  color: '#2171b5' },
      { value: 100, color: '#08306b', label: '100' },
    ],
  },
  'Cloud Top Height': {
    type: 'gradient', title: 'Cloud Top Height', units: 'km',
    colorStops: [
      { value: 0,  color: '#f7fbff', label: '0' },
      { value: 3,  color: '#c6dbef' },
      { value: 6,  color: '#6baed6' },
      { value: 10, color: '#2171b5' },
      { value: 15, color: '#08306b', label: '15' },
    ],
  },

  // Ocean
  'Chlorophyll a': {
    type: 'gradient', title: 'Chlorophyll a', units: 'mg/m\u00B3',
    colorStops: [
      { value: 0.01, color: '#440154', label: '0.01' },
      { value: 0.1,  color: '#31688e' },
      { value: 1.0,  color: '#35b779' },
      { value: 10,   color: '#fde725', label: '10' },
    ],
  },
  'Sea Surface Salinity': {
    type: 'gradient', title: 'Sea Surface Salinity', units: 'PSU',
    colorStops: [
      { value: 30, color: '#ffffd4', label: '30' },
      { value: 33, color: '#fed98e' },
      { value: 35, color: '#fe9929' },
      { value: 37, color: '#cc4c02' },
      { value: 40, color: '#662506', label: '40' },
    ],
  },
  'Wind Speed': {
    type: 'gradient', title: 'Wind Speed', units: 'm/s',
    colorStops: [
      { value: 0,  color: '#ffffcc', label: '0' },
      { value: 5,  color: '#a1dab4' },
      { value: 10, color: '#41b6c4' },
      { value: 20, color: '#225ea8' },
      { value: 30, color: '#081d58', label: '30' },
    ],
  },

  // Land/biosphere
  'Vegetation Indices': {
    type: 'gradient', title: 'Vegetation Index (NDVI)',
    colorStops: [
      { value: 0.0, color: '#8B4513', label: '0.0' },
      { value: 0.2, color: '#a67c52' },
      { value: 0.4, color: '#c2b280' },
      { value: 0.6, color: '#7cba3f' },
      { value: 0.8, color: '#3a8c1f' },
      { value: 1.0, color: '#0a5e00', label: '1.0' },
    ],
  },
  'Snow Cover': {
    type: 'gradient', title: 'Snow Cover', units: '%',
    colorStops: [
      { value: 0,   color: 'rgba(200,200,255,0.0)', label: '0' },
      { value: 25,  color: 'rgba(200,210,255,0.35)' },
      { value: 50,  color: 'rgba(180,200,250,0.55)' },
      { value: 75,  color: 'rgba(210,225,255,0.8)' },
      { value: 100, color: '#ffffff', label: '100' },
    ],
  },
  'Snow Extent': {
    type: 'gradient', title: 'Snow Extent', units: '%',
    colorStops: [
      { value: 0,   color: 'rgba(200,200,255,0.0)', label: '0' },
      { value: 50,  color: 'rgba(180,200,250,0.55)' },
      { value: 100, color: '#ffffff', label: '100' },
    ],
  },
  'Soil Moisture': {
    type: 'gradient', title: 'Soil Moisture', units: 'm\u00B3/m\u00B3',
    colorStops: [
      { value: 0.0, color: '#8c510a', label: '0.0' },
      { value: 0.1, color: '#d8b365' },
      { value: 0.2, color: '#f6e8c3' },
      { value: 0.3, color: '#7fbf7b' },
      { value: 0.5, color: '#1b7837', label: '0.5' },
    ],
  },
  'Aboveground Biomass': {
    type: 'gradient', title: 'Biomass', units: 'Mg/ha',
    colorStops: [
      { value: 0,   color: '#ffffcc', label: '0' },
      { value: 50,  color: '#c2e699' },
      { value: 100, color: '#78c679' },
      { value: 200, color: '#238443' },
      { value: 400, color: '#004529', label: '400' },
    ],
  },

  // Cryosphere
  'Sea Ice': {
    type: 'gradient', title: 'Sea Ice Concentration', units: '%',
    colorStops: [
      { value: 0,   color: '#08306b', label: '0' },
      { value: 25,  color: '#2171b5' },
      { value: 50,  color: '#6baed6' },
      { value: 75,  color: '#c6dbef' },
      { value: 100, color: '#f7fbff', label: '100' },
    ],
  },

  // Radiation
  'TOA Flux': {
    type: 'gradient', title: 'TOA Flux', units: 'W/m\u00B2',
    colorStops: [
      { value: 0,   color: '#08306b', label: '0' },
      { value: 100, color: '#2171b5' },
      { value: 200, color: '#6baed6' },
      { value: 300, color: '#fcbba1' },
      { value: 400, color: '#ef3b2c', label: '400' },
    ],
  },

  // Fire
  'Lightning': {
    type: 'gradient', title: 'Lightning Flash Rate', units: 'fl/km\u00B2/day',
    colorStops: [
      { value: 0,  color: '#ffffb2', label: '0' },
      { value: 2,  color: '#fecc5c' },
      { value: 5,  color: '#fd8d3c' },
      { value: 10, color: '#e31a1c' },
      { value: 20, color: '#800026', label: '20' },
    ],
  },
}

/** Get a legend for a GIBS catalog entry based on its group name. */
function legendForEntry(entry: GibsCatalogEntry): LayerLegend | undefined {
  if (!entry.g) return undefined
  // Direct group match
  if (LEGEND_DEFS[entry.g]) return LEGEND_DEFS[entry.g]
  // Partial match: check if any key is contained in the group name
  for (const [key, legend] of Object.entries(LEGEND_DEFS)) {
    if (entry.g.includes(key)) return legend
  }
  return undefined
}

/**
 * Map GIBS max zoom level to approximate tile resolution at the equator.
 * GIBS uses GoogleMapsCompatible tile matrix sets (WebMercator, 256px tiles).
 * Resolution ≈ 40075km / (256 × 2^z).
 */
export function zoomToResolution(z: number): string {
  if (z <= 3) return '~10 km'
  if (z === 4) return '~10 km'
  if (z === 5) return '~5 km'
  if (z === 6) return '~2 km'
  if (z === 7) return '~1 km'
  if (z === 8) return '~500 m'
  if (z === 9) return '~250 m'
  if (z === 10) return '~125 m'
  if (z === 11) return '~60 m'
  if (z === 12) return '~30 m'
  return '~15 m'
}

/** Build a LayerDef from a catalog entry */
export function gibsEntryToLayerDef(entry: GibsCatalogEntry): LayerDef {
  const res = zoomToResolution(entry.z)
  return {
    id: `gibs:${entry.id}`,
    name: entry.t,
    kind: 'imagery',
    category: 'gibs-catalog',
    description: `${entry.s}${entry.g ? ' \u2014 ' + entry.g : ''} · ${res} (NASA GIBS)`,
    defaultOn: false,
    temporal: !!entry.p, // any product with a period is temporal
    legend: legendForEntry(entry),
    imageryProvider: () => createGibsProvider(entry),
  }
}

/** Add a GIBS catalog layer to the globe and show it */
export async function addGibsLayer(entry: GibsCatalogEntry): Promise<void> {
  // Check if this product is already registered as a pack layer
  const packLayerId = PACK_LAYER_MAP[entry.id]
  if (packLayerId) {
    const existing = getLayer(packLayerId)
    if (existing) {
      if (!existing.visible) await showLayer(packLayerId)
      return
    }
  }

  // Check if already registered as a catalog layer
  const layerId = `gibs:${entry.id}`
  const existing = getLayer(layerId)
  if (existing) {
    if (!existing.visible) await showLayer(layerId)
    return
  }

  const def = gibsEntryToLayerDef(entry)
  registerLayer(def)
  await showLayer(layerId)
}

/** Remove a GIBS catalog layer from the globe */
export function removeGibsLayer(entryId: string): void {
  // Check if this is a pack layer first
  const packLayerId = PACK_LAYER_MAP[entryId]
  if (packLayerId && getLayer(packLayerId)) {
    removeLayer(packLayerId)
    return
  }
  const layerId = `gibs:${entryId}`
  removeLayer(layerId)
}

/** Check if a GIBS product is currently on the globe (pack layer or catalog layer) */
export function isGibsLayerActive(entryId: string): boolean {
  // Check pack layer first
  const packLayerId = PACK_LAYER_MAP[entryId]
  if (packLayerId && getLayer(packLayerId)) return true
  // Check catalog layer
  return !!getLayer(`gibs:${entryId}`)
}
