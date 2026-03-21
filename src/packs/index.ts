/**
 * Data Packs module.
 *
 * Re-exports the registration API and all built-in data packs.
 */

export { registerDataPack, showPackWelcome, getDataPacks, getDataPack } from './register'
export type { DataPack } from './types'
export { boundariesPack } from './boundaries'
export { gibsPack } from './gibs'
export { gibsExtraPack } from './gibs-extra'
// firmsPack removed: GIBS Thermal Anomalies are now MVT-only (no PNG tiles)
export { openseamapPack } from './openseamap'
