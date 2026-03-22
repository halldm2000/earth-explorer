/**
 * Extension Loader
 *
 * Auto-discovers extensions via Vite's import.meta.glob and registers them.
 * Extensions are found in features, packs, and extensions directories.
 *
 * Pipeline: glob discover → lazy-import → topo-sort → register → activate.
 */

import type { Extension } from './types'
import { registerExtension, activateExtension } from './registry'

type ExtensionModule = { default: Extension } | { extension: Extension }

function getExtension(mod: ExtensionModule): Extension | undefined {
  if ('default' in mod && mod.default) return mod.default
  if ('extension' in mod && mod.extension) return mod.extension
  return undefined
}

/** Topological sort extensions by dependencies. Extensions without deps come first. */
function topoSort(extensions: Extension[]): Extension[] {
  const byId = new Map(extensions.map(e => [e.id, e]))
  const sorted: Extension[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(ext: Extension): void {
    if (visited.has(ext.id)) return
    if (visiting.has(ext.id)) {
      console.warn(`[extensions] Circular dependency detected involving: ${ext.id}`)
      return
    }
    visiting.add(ext.id)
    if (ext.dependencies) {
      for (const depId of ext.dependencies) {
        const dep = byId.get(depId)
        if (dep) visit(dep)
      }
    }
    visiting.delete(ext.id)
    visited.add(ext.id)
    sorted.push(ext)
  }

  for (const ext of extensions) visit(ext)
  return sorted
}

/**
 * Discover, register, and activate all extensions.
 * Call once during app initialization.
 */
export async function loadExtensions(): Promise<void> {
  // Discover extension modules at build time
  const modules = import.meta.glob<ExtensionModule>([
    '../features/*/extension.ts',
    '../packs/*/extension.ts',
    '../extensions/*/index.ts',
  ], { eager: false })

  // Load all modules
  const extensions: Extension[] = []
  const loadPromises = Object.entries(modules).map(async ([path, loader]) => {
    try {
      const mod = await loader()
      const ext = getExtension(mod)
      if (ext) {
        extensions.push(ext)
      } else {
        console.warn(`[extensions] No Extension export found in ${path}`)
      }
    } catch (err) {
      console.error(`[extensions] Failed to load ${path}:`, err)
    }
  })

  await Promise.all(loadPromises)

  // Sort by dependencies
  const sorted = topoSort(extensions)

  // Register all
  for (const ext of sorted) {
    registerExtension(ext)
  }

  // Activate auto-start extensions (silently — no welcome messages on startup)
  for (const ext of sorted) {
    if (ext.autoActivate) {
      await activateExtension(ext.id, { silent: true })
    }
  }

  console.log(`[extensions] Loaded ${sorted.length} extensions (${sorted.filter(e => e.autoActivate).length} auto-activated)`)
}
