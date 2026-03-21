/**
 * Boundaries Data Pack
 *
 * Natural Earth vector overlays: country borders, coastlines, major rivers.
 * Uses 50m resolution — good balance of detail (~2K entities) and performance.
 * Lazy-loaded on first toggle, so no startup cost.
 *
 * Source: Natural Earth (public domain), hosted on GitHub.
 */

import type { DataPack } from './types'

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

export const boundariesPack: DataPack = {
  id: 'boundaries',
  name: 'Boundaries',
  description: 'Country borders, coastlines, and major rivers from Natural Earth',
  category: 'boundaries',
  layers: [
    {
      id: 'borders',
      name: 'Country Borders',
      kind: 'geojson',
      category: 'boundaries',
      description: 'National boundaries from Natural Earth (50m)',
      defaultOn: false,
      url: `${NE_BASE}/ne_50m_admin_0_boundary_lines_land.geojson`,
      style: { stroke: '#ffd866', strokeWidth: 1.5 },
    },
    {
      id: 'coastlines',
      name: 'Coastlines',
      kind: 'geojson',
      category: 'boundaries',
      description: 'Global coastlines from Natural Earth (50m)',
      defaultOn: false,
      url: `${NE_BASE}/ne_50m_coastline.geojson`,
      style: { stroke: '#78dce8', strokeWidth: 1.2 },
    },
    {
      id: 'rivers',
      name: 'Major Rivers',
      kind: 'geojson',
      category: 'boundaries',
      description: 'Major rivers and lake centerlines from Natural Earth (50m)',
      defaultOn: false,
      url: `${NE_BASE}/ne_50m_rivers_lake_centerlines.geojson`,
      style: { stroke: '#4a9eff', strokeWidth: 1.0 },
    },
  ],
}
