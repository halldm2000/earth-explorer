/**
 * Data Pack types.
 *
 * A data pack is a lightweight bundle of layers + optional AI commands.
 * No lifecycle, no behavior — just data definitions registered at startup.
 * This is the right abstraction for tile providers, GeoJSON overlays,
 * and simple data catalogs that don't need the ceremony of a full app.
 */

import type { LayerDef } from '@/features/layers/types'
import type { CommandEntry } from '@/ai/types'
import type { DataSource } from '@/sources/types'

export interface DataPack {
  /** Unique identifier, e.g. 'boundaries', 'gibs' */
  id: string
  /** Human-readable name */
  name: string
  /** Short description */
  description: string
  /** Grouping key for UI organization */
  category: string
  /** Optional data sources to register in the global source catalog */
  sources?: DataSource[]
  /** Data layers to register with the layer manager */
  layers: LayerDef[]
  /** Optional AI commands (aliases, toggles, queries) */
  commands?: CommandEntry[]
  /** Optional welcome message shown on first user interaction */
  welcome?: string
}
