/**
 * Data Pack registration.
 *
 * Registers a data pack's layers and commands with the respective managers.
 * Data packs are always available — no activate/deactivate lifecycle.
 */

import type { DataPack } from './types'
import { registerLayer, showLayer } from '@/features/layers/manager'
import { registry } from '@/ai/registry'
import { registerSources } from '@/sources/catalog'

const _packs = new Map<string, DataPack>()
const _welcomeShown = new Set<string>()

/** Register a data pack: add its layers and commands to the global registries. */
export function registerDataPack(pack: DataPack): void {
  if (_packs.has(pack.id)) return
  _packs.set(pack.id, pack)

  // Register data sources in the global catalog
  if (pack.sources && pack.sources.length > 0) {
    registerSources(pack.sources)
  }

  // Register layers (lazy-loaded on first show, no network cost here)
  for (const def of pack.layers) {
    registerLayer(def)
  }

  // Show any layers marked as defaultOn
  for (const def of pack.layers) {
    if (def.defaultOn) {
      showLayer(def.id)
    }
  }

  // Register AI commands
  if (pack.commands && pack.commands.length > 0) {
    registry.registerAll(pack.commands)
  }

  console.log(`[packs] Registered: ${pack.name} (${pack.sources?.length ?? 0} sources, ${pack.layers.length} layers, ${pack.commands?.length ?? 0} commands)`)
}

/** Show a data pack's welcome message once (on first user interaction). */
export function showPackWelcome(packId: string): void {
  if (_welcomeShown.has(packId)) return
  const pack = _packs.get(packId)
  if (!pack?.welcome) return

  _welcomeShown.add(packId)
  import('@/store').then(({ useStore }) => {
    useStore.getState().addMessage({
      role: 'system',
      content: `**${pack.name}** — ${pack.welcome}`,
    })
  }).catch(() => { /* store not ready yet */ })
}

/** Get all registered data packs. */
export function getDataPacks(): DataPack[] {
  return Array.from(_packs.values())
}

/** Get a data pack by ID. */
export function getDataPack(id: string): DataPack | undefined {
  return _packs.get(id)
}
