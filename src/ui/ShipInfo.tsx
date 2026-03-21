/**
 * ShipInfo: compact floating HUD showing ship tracker status.
 *
 * Positioned bottom-right (above the status bar). Shows vessel count,
 * data source, and a pulsing dot while loading. Auto-hides when
 * ship tracker is not active.
 */

import { useEffect, useState } from 'react'
import {
  subscribe,
  isShipsVisible,
  isShipsLoading,
  getShips,
  getShipsSource,
} from '@/features/ships'

export function ShipInfo() {
  const [, tick] = useState(0)
  useEffect(() => subscribe(() => tick(v => v + 1)), [])

  // Tick every 2s while visible so count stays fresh
  const visible = isShipsVisible()
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => tick(v => v + 1), 2000)
    return () => clearInterval(id)
  }, [visible])

  const loading = isShipsLoading()
  const count = getShips().length
  const source = getShipsSource()

  const sourceLabel = source === 'bridge'
    ? 'AISStream (Global)'
    : source === 'digitraffic'
      ? 'Digitraffic (Baltic)'
      : 'Connecting…'

  return (
    <div
      style={{
        ...containerStyle,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Pulsing dot + count */}
      <div style={rowStyle}>
        <span style={{
          ...dotStyle,
          background: loading ? '#FFB74D' : '#4FC3F7',
          animation: loading ? 'shipinfo-pulse 1.2s ease infinite' : 'none',
        }} />
        <span style={countStyle}>
          {count.toLocaleString()}
        </span>
        <span style={unitStyle}>vessels</span>
      </div>

      {/* Source */}
      <div style={sourceStyle}>{sourceLabel}</div>

      {/* Pulse animation */}
      <style>{`
        @keyframes shipinfo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 28,
  background: 'rgba(10, 12, 18, 0.78)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 8,
  padding: '8px 12px',
  fontFamily: 'inherit',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
}

const dotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
}

const countStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#e8eaed',
  fontVariantNumeric: 'tabular-nums',
}

const unitStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'rgba(255, 255, 255, 0.45)',
}

const sourceStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(255, 255, 255, 0.35)',
  marginTop: 2,
  letterSpacing: '0.3px',
}
