/**
 * FullscreenButton: a small floating toggle for browser fullscreen mode.
 *
 * Uses the Fullscreen API (document.documentElement.requestFullscreen / exitFullscreen).
 * Listens to the 'fullscreenchange' event so state stays in sync if the user
 * exits fullscreen via Escape or browser chrome.
 *
 * Keyboard shortcut: F key (skipped when typing in inputs).
 *
 * This mirrors the logic in ai/core-commands.ts `core:fullscreen` so both
 * the MCP tool and the UI button use the same API.
 */

import { useCallback, useEffect, useState } from 'react'

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }, [])

  // Sync with browser fullscreen changes (e.g. user presses Escape)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Keyboard shortcut: F key toggles fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleFullscreen])

  const color = isFullscreen
    ? 'var(--accent, #4FC3F7)'
    : 'var(--text-secondary, rgba(255,255,255,0.55))'

  return (
    <button
      onClick={toggleFullscreen}
      title={`Fullscreen (F): ${isFullscreen ? 'On' : 'Off'}`}
      style={{
        ...btnStyle,
        borderColor: isFullscreen
          ? 'var(--accent, #4FC3F7)'
          : 'var(--border, rgba(255,255,255,0.08))',
        background: isFullscreen
          ? 'rgba(20, 25, 35, 0.85)'
          : 'rgba(25, 30, 40, 0.7)',
      }}
    >
      {isFullscreen ? <CompressIcon color={color} /> : <ExpandIcon color={color} />}
    </button>
  )
}

// ── SVG Icons ──

function ExpandIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
      <path d="M2 6V2h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 6V2h-4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12v4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12v4h-4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CompressIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
      <path d="M6 2v4H2" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2v4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 16v-4H2" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16v-4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Styles ──

const btnStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  backdropFilter: 'blur(var(--blur, 12px))',
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  color: 'var(--text-secondary)',
  zIndex: 40,
}
