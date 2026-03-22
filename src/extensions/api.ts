/**
 * ExtensionAPI implementation.
 *
 * Implements the API surface passed to every extension's activate().
 * Delegates to existing subsystems (layer manager, command registry,
 * scene engine, source catalog, store).
 */

import type { ExtensionAPI } from './types'
import {
  registerLayer, removeLayer, showLayer, hideLayer,
  toggleLayer, reloadLayer, getAllLayers,
} from '@/features/layers/manager'
import { registry } from '@/ai/registry'
import { getViewer } from '@/scene/engine'
import { registerSource, registerSources } from '@/sources/catalog'
import * as Cesium from 'cesium'

// ── Tick system (shared with apps manager) ──

const _tickCallbacks = new Set<(dt: number) => void>()
let _tickInstalled = false

function installTick(): void {
  if (_tickInstalled) return
  _tickInstalled = true
  let last = performance.now()
  function tick() {
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    for (const cb of _tickCallbacks) cb(dt)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ── Factory ──

export function createExtensionAPI(): ExtensionAPI {
  return {
    version: '1.0',

    layers: {
      register: registerLayer,
      show: showLayer,
      hide: hideLayer,
      toggle: toggleLayer,
      remove: removeLayer,
      reload: reloadLayer,
      getAll() {
        return getAllLayers().map(l => ({
          id: l.def.id,
          name: l.def.name,
          visible: l.visible,
          category: l.def.category,
        }))
      },
    },

    commands: {
      register: (cmd) => registry.register(cmd),
      registerAll: (cmds) => registry.registerAll(cmds),
      unregisterModule: (mod) => registry.unregisterModule(mod),
    },

    camera: {
      flyTo(lon, lat, height, duration = 2) {
        const viewer = getViewer()
        if (!viewer) return
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
          duration,
        })
      },

      getPosition() {
        const viewer = getViewer()
        if (!viewer) return { lon: 0, lat: 0, height: 0, heading: 0 }
        const pos = viewer.camera.positionCartographic
        return {
          lon: Cesium.Math.toDegrees(pos.longitude),
          lat: Cesium.Math.toDegrees(pos.latitude),
          height: pos.height,
          heading: Cesium.Math.toDegrees(viewer.camera.heading),
        }
      },

      onMove(callback) {
        const viewer = getViewer()
        if (!viewer) return () => {}
        const handler = () => {
          const pos = viewer.camera.positionCartographic
          callback({
            lon: Cesium.Math.toDegrees(pos.longitude),
            lat: Cesium.Math.toDegrees(pos.latitude),
            height: pos.height,
          })
        }
        const remove = viewer.camera.changed.addEventListener(handler)
        return () => remove()
      },
    },

    viz: {
      registerSource,
      registerSources,
    },

    ui: {
      showStatus(text) {
        import('@/store').then(({ useStore }) => {
          useStore.getState().setStatusText(text)
        }).catch(() => {})
      },

      addChatMessage(role, content) {
        import('@/store').then(({ useStore }) => {
          useStore.getState().addMessage({ role, content })
        }).catch(() => {})
      },
    },

    onTick(callback) {
      installTick()
      _tickCallbacks.add(callback)
      return () => { _tickCallbacks.delete(callback) }
    },

    unsafe: {
      getViewer,
    },
  }
}
