/**
 * App Manager
 *
 * Manages the lifecycle of Worldscope apps: registration, activation,
 * deactivation. Each app can provide commands, layers, and UI panels.
 */

import type { WorldscopeApp, AppContext, AppResources, AppToolbarConfig } from './types'
import { registry } from '@/ai/registry'
import {
  registerLayer, removeLayer, showLayer, hideLayer, reloadLayer,
} from '@/features/layers'
import { getViewer } from '@/scene/engine'

interface ActiveApp {
  app: WorldscopeApp
  resources: AppResources
}

const _registered = new Map<string, WorldscopeApp>()
const _active = new Map<string, ActiveApp>()
const _welcomeShown = new Set<string>()

// ── Manager subscription system ──

const _managerListeners = new Set<() => void>()

export function subscribeManager(fn: () => void): () => void {
  _managerListeners.add(fn)
  return () => { _managerListeners.delete(fn) }
}

function notifyManager(): void {
  for (const fn of _managerListeners) fn()
}

// ── Tick system for onTick callbacks ──

const _tickCallbacks = new Set<(dt: number) => void>()
let _tickListenerInstalled = false

function installTickListener(): void {
  if (_tickListenerInstalled) return
  _tickListenerInstalled = true

  // Use requestAnimationFrame loop; we pass elapsed seconds
  let lastTime = performance.now()
  function tick() {
    const now = performance.now()
    const dt = (now - lastTime) / 1000
    lastTime = now
    for (const cb of _tickCallbacks) {
      cb(dt)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ── Context factory ──

function createAppContext(): AppContext {
  return {
    addLayer: registerLayer,
    removeLayer,
    showLayer,
    hideLayer,
    reloadLayer,
    getViewer,
    onTick: (callback: (dt: number) => void) => {
      installTickListener()
      _tickCallbacks.add(callback)
      return () => { _tickCallbacks.delete(callback) }
    },
  }
}

// ── Public API ──

/** Register an app definition (does not activate it). */
export function registerApp(app: WorldscopeApp): void {
  _registered.set(app.id, app)
}

/** Activate a registered app by ID. Set silent to suppress welcome message (used for auto-activate on startup). */
export async function activateApp(id: string, { silent = false } = {}): Promise<boolean> {
  if (_active.has(id)) return true // already active

  const app = _registered.get(id)
  if (!app) return false

  const ctx = createAppContext()
  const resources = await app.activate(ctx)

  // Register layers
  for (const layerDef of resources.layers) {
    registerLayer(layerDef)
    if (layerDef.defaultOn) {
      await showLayer(layerDef.id)
    }
  }

  // Register commands
  if (resources.commands.length > 0) {
    registry.registerAll(resources.commands)
  }

  _active.set(id, { app, resources })
  notifyManager()
  console.log(`[apps] Activated: ${app.name}`)

  // Show welcome on explicit activation (not auto-start)
  if (!silent) {
    showAppWelcome(id)
  }

  return true
}

/** Show an app's welcome message once. Called on first user interaction with an app. */
export function showAppWelcome(id: string): void {
  if (_welcomeShown.has(id)) return
  const entry = _active.get(id)
  if (!entry?.resources.welcome) return

  _welcomeShown.add(id)
  import('@/store').then(({ useStore }) => {
    useStore.getState().addMessage({
      role: 'system',
      content: `**${entry.app.name}** — ${entry.resources.welcome}`,
    })
  }).catch(() => { /* store not ready yet */ })
}

/** Deactivate an active app by ID. */
export function deactivateApp(id: string): boolean {
  const entry = _active.get(id)
  if (!entry) return false

  const { app, resources } = entry

  // Unregister commands
  registry.unregisterModule(app.id)

  // Remove layers
  for (const layerDef of resources.layers) {
    removeLayer(layerDef.id)
  }

  // Call app cleanup
  app.deactivate?.()

  _active.delete(id)
  notifyManager()
  console.log(`[apps] Deactivated: ${app.name}`)
  return true
}

/** Activate all apps marked as autoActivate (silently — no welcome messages). */
export async function activateAutoApps(): Promise<void> {
  for (const app of _registered.values()) {
    if (app.autoActivate) {
      await activateApp(app.id, { silent: true })
    }
  }
}

/** Get all registered apps with their activation status. */
export function getApps(): Array<{ id: string; name: string; description: string; active: boolean }> {
  const result: Array<{ id: string; name: string; description: string; active: boolean }> = []
  for (const app of _registered.values()) {
    result.push({
      id: app.id,
      name: app.name,
      description: app.description,
      active: _active.has(app.id),
    })
  }
  return result
}

/** Get all registered apps with their toolbar configs. */
export function getAppToolbars(): Array<{
  id: string
  name: string
  active: boolean
  toolbar?: AppToolbarConfig
}> {
  const result: Array<{
    id: string
    name: string
    active: boolean
    toolbar?: AppToolbarConfig
  }> = []
  for (const [id, app] of _registered) {
    const activeEntry = _active.get(id)
    result.push({
      id,
      name: app.name,
      active: !!activeEntry,
      toolbar: activeEntry?.resources.toolbar,
    })
  }
  return result
}
