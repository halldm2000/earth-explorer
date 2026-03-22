/**
 * Extension Registry
 *
 * Manages registration, activation, and deactivation of all extensions.
 * Dispatches lifecycle based on extension kind:
 *  - 'data-pack': registers static layers/commands/sources immediately
 *  - 'app': calls activate(api) on activation, deactivate() on teardown
 *  - other kinds: reserved for future phases
 */

import type { Extension, ExtensionEntry, ExtensionState, ExtensionResources, ExtensionKind } from './types'
import { createExtensionAPI } from './api'
import { registerLayer, removeLayer, showLayer } from '@/features/layers/manager'
import { registry as commandRegistry } from '@/ai/registry'
import { registerSources } from '@/sources/catalog'
import { syncFromExtension, unsyncFromExtension } from '@/apps/manager'
import type { AppResources } from '@/apps/types'

// ── Internal state ──

const _extensions = new Map<string, ExtensionEntry>()
const _listeners = new Set<() => void>()

function notify(): void {
  for (const fn of _listeners) fn()
}

// ── Public API ──

/** Register an extension. For data-packs, static resources are registered immediately. */
export function registerExtension(ext: Extension): void {
  if (_extensions.has(ext.id)) {
    console.warn(`[extensions] Duplicate extension id: ${ext.id} (skipping)`)
    return
  }

  const entry: ExtensionEntry = { extension: ext, state: 'registered' }
  _extensions.set(ext.id, entry)

  // Data packs register their static resources immediately (no lifecycle)
  if (ext.kind === 'data-pack') {
    registerStaticResources(ext)
    entry.state = 'active'
  }

  notify()
}

/** Activate an extension by ID. No-op if already active. */
export async function activateExtension(id: string, options?: { silent?: boolean }): Promise<boolean> {
  const entry = _extensions.get(id)
  if (!entry) {
    console.warn(`[extensions] Unknown extension: ${id}`)
    return false
  }
  if (entry.state === 'active') return true

  const ext = entry.extension

  // Check dependencies
  if (ext.dependencies) {
    for (const dep of ext.dependencies) {
      const depEntry = _extensions.get(dep)
      if (!depEntry || depEntry.state !== 'active') {
        console.warn(`[extensions] ${id} requires ${dep} which is not active`)
        return false
      }
    }
  }

  // Check conflicts
  if (ext.conflicts) {
    for (const conflict of ext.conflicts) {
      const conflictEntry = _extensions.get(conflict)
      if (conflictEntry?.state === 'active') {
        console.warn(`[extensions] ${id} conflicts with active extension ${conflict}`)
        return false
      }
    }
  }

  try {
    if (ext.activate) {
      // Dynamic activation (apps, capabilities, etc.)
      const api = createExtensionAPI()
      const resources = await ext.activate(api)
      entry.resources = resources

      // Register returned resources
      if (resources.layers) {
        for (const def of resources.layers) {
          registerLayer(def)
          if (def.defaultOn) await showLayer(def.id)
        }
      }
      if (resources.commands?.length) {
        commandRegistry.registerAll(resources.commands)
      }
    } else if (ext.kind !== 'data-pack') {
      // Non-data-pack without activate — register any static resources
      registerStaticResources(ext)
    }

    entry.state = 'active'

    // Sync app-kind extensions to the legacy app manager (for AppDock toolbar)
    if (ext.kind === 'app' && entry.resources) {
      const res = entry.resources
      const appResources: AppResources = {
        commands: res.commands ?? [],
        layers: res.layers ?? [],
        panel: res.panel,
        welcome: res.welcome,
        toolbar: res.toolbar,
      }
      syncFromExtension(
        { id: ext.id, name: ext.name, description: ext.description, autoActivate: ext.autoActivate ?? false,
          activate: () => appResources, deactivate: ext.deactivate },
        appResources,
      )
    }

    notify()

    // Show welcome message
    if (!options?.silent) {
      const welcome = entry.resources?.welcome ?? ext.welcome
      if (welcome) {
        showWelcome(ext, welcome)
      }
    }

    console.log(`[extensions] Activated: ${ext.name}`)
    return true
  } catch (err) {
    entry.state = 'error'
    entry.error = err instanceof Error ? err.message : String(err)
    console.error(`[extensions] Failed to activate ${ext.name}:`, err)
    notify()
    return false
  }
}

/** Deactivate an extension by ID. */
export function deactivateExtension(id: string): boolean {
  const entry = _extensions.get(id)
  if (!entry || entry.state !== 'active') return false

  const ext = entry.extension

  // Unsync from legacy app manager (AppDock)
  if (ext.kind === 'app') {
    unsyncFromExtension(ext.id)
  }

  // Unregister commands
  commandRegistry.unregisterModule(ext.id)

  // Remove layers
  const layers = entry.resources?.layers ?? ext.layers
  if (layers) {
    for (const def of layers) removeLayer(def.id)
  }

  // Call extension cleanup
  ext.deactivate?.()

  entry.state = 'registered'
  entry.resources = undefined
  notify()

  console.log(`[extensions] Deactivated: ${ext.name}`)
  return true
}

/** Get an extension entry by ID. */
export function getExtension(id: string): ExtensionEntry | undefined {
  return _extensions.get(id)
}

/** List extensions, optionally filtered. */
export function getExtensions(filter?: {
  kind?: ExtensionKind
  state?: ExtensionState
  tag?: string
}): ExtensionEntry[] {
  let result = Array.from(_extensions.values())
  if (filter?.kind) result = result.filter(e => e.extension.kind === filter.kind)
  if (filter?.state) result = result.filter(e => e.state === filter.state)
  if (filter?.tag) result = result.filter(e => e.extension.tags?.includes(filter.tag!))
  return result
}

/** Subscribe to registry changes. Returns unsubscribe function. */
export function subscribeExtensions(listener: () => void): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

// ── Internal helpers ──

/** Register static resources (layers, commands, sources) from an extension definition. */
function registerStaticResources(ext: Extension): void {
  if (ext.sources?.length) {
    registerSources(ext.sources)
  }
  if (ext.layers?.length) {
    for (const def of ext.layers) {
      registerLayer(def)
      if (def.defaultOn) showLayer(def.id)
    }
  }
  if (ext.commands?.length) {
    commandRegistry.registerAll(ext.commands)
  }
}

/** Show welcome message in chat (once per extension). */
const _welcomeShown = new Set<string>()

function showWelcome(ext: Extension, message: string): void {
  if (_welcomeShown.has(ext.id)) return
  _welcomeShown.add(ext.id)
  import('@/store').then(({ useStore }) => {
    useStore.getState().addMessage({
      role: 'system',
      content: `**${ext.name}** — ${message}`,
    })
  }).catch(() => {})
}
