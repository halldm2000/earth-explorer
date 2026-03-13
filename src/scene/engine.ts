/**
 * Shared viewer reference.
 * CesiumViewer sets this on init, core-commands reads it.
 * Avoids fragile window globals.
 */

import type * as Cesium from 'cesium'

let _viewer: Cesium.Viewer | null = null

export function setViewer(viewer: Cesium.Viewer | null): void {
  _viewer = viewer
  console.log('[engine] Viewer', viewer ? 'set' : 'cleared')
}

export function getViewer(): Cesium.Viewer | null {
  return _viewer
}
