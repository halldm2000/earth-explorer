/**
 * BottomBar: unified bottom UI composition.
 *
 * Renders a control bar (GlobalControls + AppDock) above the StatusStrip.
 * Reads camera position from the Cesium viewer via requestAnimationFrame
 * polling and passes it to StatusStrip.
 */

import { useEffect, useRef, useState } from 'react'
import { StatusStrip, type CameraStatus } from '@/ui/StatusStrip'
import { GlobalControls } from '@/ui/GlobalControls'
import { ViewModeSwitcher } from '@/ui/ViewModeSwitcher'
import { AppDock } from '@/ui/AppDock'
import { getViewer } from '@/scene/engine'
import * as Cesium from 'cesium'

const DEFAULT_CAMERA: CameraStatus = { lat: 0, lon: 0, alt: 10_000_000, heading: 0 }

export function BottomBar() {
  const [camera, setCamera] = useState<CameraStatus>(DEFAULT_CAMERA)
  const frameRef = useRef(0)

  useEffect(() => {
    let rafId: number
    let frameCount = 0

    function tick() {
      rafId = requestAnimationFrame(tick)
      // Update every other frame (~30fps)
      frameCount++
      if (frameCount % 2 !== 0) return

      const viewer = getViewer()
      if (!viewer) return

      const carto = viewer.camera.positionCartographic
      // Guard against undefined values during scene morph transitions
      if (!carto || carto.latitude == null || carto.longitude == null) return

      const heading = viewer.camera.heading
      setCamera({
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        alt: carto.height ?? 0,
        heading: heading != null ? Cesium.Math.toDegrees(heading) : 0,
      })
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div style={wrapperStyle}>
      {/* Global controls: vertical stack on the left, above status strip */}
      <div style={globalControlsStyle}>
        <GlobalControls />
      </div>

      {/* View mode switcher: to the right of GlobalControls */}
      <div style={viewModeSwitcherStyle}>
        <ViewModeSwitcher />
      </div>

      {/* App dock: centered horizontally, above status strip */}
      <div style={appDockStyle}>
        <AppDock />
      </div>

      {/* StatusStrip at the very bottom */}
      <StatusStrip {...camera} />
    </div>
  )
}

// ── Styles ──

const wrapperStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 35,
  pointerEvents: 'none',
}

const globalControlsStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 40,
  left: 12,
  pointerEvents: 'auto',
}

const viewModeSwitcherStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 40,
  left: 60,
  pointerEvents: 'auto',
}

const appDockStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 40,
  left: '50%',
  transform: 'translateX(-50%)',
  pointerEvents: 'auto',
}
