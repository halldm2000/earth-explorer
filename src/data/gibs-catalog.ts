/**
 * GIBS catalog data module.
 *
 * Lazy-loads the full 1,123-entry NASA GIBS catalog from public/gibs-catalog.json
 * and provides search/filter helpers for the catalog browser UI.
 */

/** GIBS catalog entry (compact format from public/gibs-catalog.json) */
export interface GibsCatalogEntry {
  id: string        // WMTS layer identifier
  t: string         // title
  s: string         // subtitle (instrument)
  f: 'p' | 'j'     // format: p=png, j=jpeg
  z: number         // max zoom level
  p: string | null  // period: daily, monthly, subdaily, yearly, null=static
  c: string         // category: Atmosphere, Oceans, Land Surface, etc.
  g: string | null  // group: Sea Surface Temperature, Aerosol Optical Depth, etc.
  d?: string        // default date (YYYY-MM-DD) — recommended date for tile requests
}

let _catalog: GibsCatalogEntry[] | null = null
let _loading: Promise<GibsCatalogEntry[]> | null = null

/** Lazy-load the GIBS catalog. Cached after first fetch. */
export async function getGibsCatalog(): Promise<GibsCatalogEntry[]> {
  if (_catalog) return _catalog
  if (_loading) return _loading
  _loading = fetch('/gibs-catalog.json')
    .then(r => r.json())
    .then((data: GibsCatalogEntry[]) => { _catalog = data; return data })
  return _loading
}

/** Get unique categories sorted alphabetically (excludes generic "All" since UI has its own "All" pill) */
export function getCategories(catalog: GibsCatalogEntry[]): string[] {
  return [...new Set(catalog.map(e => e.c))].filter(c => c !== 'All').sort()
}

/** Get unique groups within a category */
export function getGroups(catalog: GibsCatalogEntry[], category: string): string[] {
  return [...new Set(catalog.filter(e => e.c === category && e.g).map(e => e.g!))].sort()
}

/** Search catalog by query string (match on title, subtitle, id, group) */
export function searchCatalog(catalog: GibsCatalogEntry[], query: string): GibsCatalogEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return catalog
  return catalog.filter(e =>
    e.t.toLowerCase().includes(q) ||
    e.s.toLowerCase().includes(q) ||
    e.id.toLowerCase().includes(q) ||
    (e.g && e.g.toLowerCase().includes(q))
  )
}
