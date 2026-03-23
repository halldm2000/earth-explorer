/**
 * ViewModeSwitcher: 3-button toggle group for switching Cesium scene modes.
 *
 * Shows 2.5D (Columbus View), 2D, and 3D buttons. Stays synced with the
 * viewer's scene mode via the morphComplete event, so keyboard shortcuts
 * (1/2/3 keys) also update the highlighted button.
 */

import { useEffect, useState } from 'react'
import * as Cesium from 'cesium'
import { getViewer, hideAllBuildings, restoreBuildings } from '@/scene/engine'

const MODES = [
  { label: '2.5D', mode: Cesium.SceneMode.COLUMBUS_VIEW, morph: 'morphToColumbusView' },
  { label: '2D',   mode: Cesium.SceneMode.SCENE2D,       morph: 'morphTo2D' },
  { label: '3D',   mode: Cesium.SceneMode.SCENE3D,        morph: 'morphTo3D' },
] as const

export function ViewModeSwitcher() {
  const [activeMode, setActiveMode] = useState<Cesium.SceneMode>(Cesium.SceneMode.SCENE3D)
  const [ready, setReady] = useState(false)

  // Poll for viewer availability, then attach morphComplete listener
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let removeListener: (() => void) | null = null

    function attach() {
      const viewer = getViewer()
      if (!viewer) return

      // Viewer found — stop polling
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }

      setActiveMode(viewer.scene.mode)
      setReady(true)

      const listener = viewer.scene.morphComplete.addEventListener(() => {
        setActiveMode(viewer.scene.mode)
      })
      removeListener = () => listener()
    }

    // Try immediately, then poll
    attach()
    if (!ready) {
      intervalId = setInterval(attach, 200)
    }

    return () => {
      if (intervalId !== null) clearInterval(intervalId)
      removeListener?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null

  function handleClick(mode: Cesium.SceneMode, morph: string) {
    const viewer = getViewer()
    if (!viewer || viewer.scene.mode === mode) return

    if (mode === Cesium.SceneMode.SCENE3D) {
      ;(viewer.scene as any)[morph](1.0)
      restoreBuildings()
    } else {
      hideAllBuildings()
      ;(viewer.scene as any)[morph](1.0)
    }
  }

  return (
    <div style={containerStyle}>
      {MODES.map(({ label, mode, morph }, i) => {
        const isActive = activeMode === mode
        const isFirst = i === 0
        const isLast = i === MODES.length - 1
        return (
          <button
            key={label}
            onClick={() => handleClick(mode, morph)}
            style={{
              ...buttonStyle,
              ...(isActive ? activeButtonStyle : inactiveButtonStyle),
              borderRadius: isFirst
                ? '6px 0 0 6px'
                : isLast
                  ? '0 6px 6px 0'
                  : '0',
              borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  display: 'flex',
  borderRadius: 8,
  overflow: 'hidden',
  background: 'rgba(10, 12, 18, 0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.06)',
}

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 32,
  padding: '0 10px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--mono, monospace)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  transition: 'background 0.15s, color 0.15s',
  outline: 'none',
}

const activeButtonStyle: React.CSSProperties = {
  background: 'rgba(20, 25, 35, 0.85)',
  color: 'var(--accent, #4FC3F7)',
}

const inactiveButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.55)',
}
