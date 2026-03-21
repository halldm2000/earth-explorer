/**
 * StatusStrip: window-wide thin status bar at the very bottom of the viewport.
 *
 * Shows camera readout (LAT/LON/ALT/HDG) on the left and a fullscreen
 * toggle button on the right. Designed to sit at the bottom edge of the
 * BottomBar composition.
 */

import { useCallback, useEffect, useState } from 'react'

export interface CameraStatus {
  lat: number
  lon: number
  alt: number
  heading: number
}

function formatAlt(meters: number): string {
  if (meters >= 100_000) return `${Math.round(meters / 1000)} km`
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export function StatusStrip({ lat, lon, alt, heading }: CameraStatus) {
  return (
    <div style={stripStyle}>
      {/* Camera readout */}
      <div style={readoutRow}>
        <ReadoutField label="LAT" value={lat.toFixed(4) + '\u00B0'} />
        <ReadoutField label="LON" value={lon.toFixed(4) + '\u00B0'} />
        <ReadoutField label="ALT" value={formatAlt(alt)} />
        <ReadoutField label="HDG" value={heading.toFixed(1) + '\u00B0'} />
      </div>

      {/* Inline fullscreen button */}
      <InlineFullscreenButton />
    </div>
  )
}

// ── Readout field ──

function ReadoutField({ label, value }: { label: string; value: string }) {
  return (
    <span style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </span>
  )
}

// ── Inline fullscreen button (no position:fixed) ──

function InlineFullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        ...fsBtnStyle,
        borderColor: isFullscreen
          ? 'var(--accent, #4FC3F7)'
          : 'var(--border, rgba(255,255,255,0.08))',
        background: isFullscreen
          ? 'rgba(20, 25, 35, 0.85)'
          : 'transparent',
      }}
    >
      {isFullscreen ? <CompressIcon color={color} /> : <ExpandIcon color={color} />}
    </button>
  )
}

// ── SVG icons ──

function ExpandIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
      <path d="M2 6V2h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 6V2h-4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12v4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12v4h-4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CompressIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
      <path d="M6 2v4H2" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2v4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 16v-4H2" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16v-4h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Styles ──

const stripStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 36,
  zIndex: 30,
  background: 'rgba(10, 12, 18, 0.75)',
  backdropFilter: 'blur(20px)',
  borderTop: '1px solid var(--border, rgba(255,255,255,0.06))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: 14,
  paddingRight: 10,
  pointerEvents: 'auto',
}

const readoutRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  userSelect: 'none',
}

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--mono, monospace)',
  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
}

const fsBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  flexShrink: 0,
}
