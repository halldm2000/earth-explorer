import { LayerDef } from './types'

/**
 * Built-in layer definitions.
 *
 * GeoJSON from Natural Earth (public domain, hosted on GitHub).
 * 110m = coarse but fast (~50-150KB each). Good enough for a globe view.
 * Could offer 50m variants later for when the camera is closer.
 */

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

export const BUILTIN_LAYERS: LayerDef[] = [
  {
    id: 'borders',
    name: 'Country Borders',
    kind: 'geojson',
    category: 'boundaries',
    description: 'National boundaries from Natural Earth (110m)',
    defaultOn: false,
    url: `${NE_BASE}/ne_110m_admin_0_boundary_lines_land.geojson`,
    style: { stroke: '#ffd866', strokeWidth: 1.5 },
  },
  {
    id: 'coastlines',
    name: 'Coastlines',
    kind: 'geojson',
    category: 'boundaries',
    description: 'Global coastlines from Natural Earth (110m)',
    defaultOn: false,
    url: `${NE_BASE}/ne_110m_coastline.geojson`,
    style: { stroke: '#78dce8', strokeWidth: 1.2 },
  },
  {
    id: 'rivers',
    name: 'Major Rivers',
    kind: 'geojson',
    category: 'boundaries',
    description: 'Major rivers and lake centerlines from Natural Earth (110m)',
    defaultOn: false,
    url: `${NE_BASE}/ne_110m_rivers_lake_centerlines.geojson`,
    style: { stroke: '#4a9eff', strokeWidth: 1.0 },
  },
]
