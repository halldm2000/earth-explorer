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
      if (!carto) return

      setCamera({
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        alt: carto.height,
        heading: Cesium.Math.toDegrees(viewer.camera.heading),
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

const appDockStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 40,
  left: '50%',
  transform: 'translateX(-50%)',
  pointerEvents: 'auto',
}
