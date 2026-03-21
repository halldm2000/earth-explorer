/**
 * SatelliteInfo: floating HUD showing tracked satellite details.
 *
 * Positioned top-right. Updates position every 500ms while a satellite
 * is tracked. Auto-hides when no satellite is tracked or satellites
 * are not visible.
 */

import { useEffect, useState } from 'react'
import {
  subscribe,
  isSatelliteVisible,
  isFollowingSatellite,
  getTrackedSatellite,
  getTrackedPosition,
} from '@/features/satellite'

export function SatelliteInfo() {
  const [, tick] = useState(0)

  // Re-render on satellite state changes (track/untrack/show/hide)
  useEffect(() => subscribe(() => tick(v => v + 1)), [])

  // Tick position every 500ms while tracked
  const sat = getTrackedSatellite()
  useEffect(() => {
    if (!sat) return
    const id = setInterval(() => tick(v => v + 1), 500)
    return () => clearInterval(id)
  }, [sat?.noradId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = isSatelliteVisible() && sat != null
  const pos = visible ? getTrackedPosition() : null
  const following = isFollowingSatellite()

  return (
    <div
      style={{
        ...containerStyle,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {sat && pos && (
        <>
          {/* Header */}
          <div style={headerStyle}>
            <span style={dotStyle} />
            <span style={nameStyle}>{sat.name}</span>
            {following && <span style={followBadgeStyle}>FOLLOWING</span>}
          </div>

          {/* Orbit type badge */}
          <div style={typeBadgeRowStyle}>
            <span style={{ ...typeBadgeStyle, background: orbitBadgeColor(sat.orbitType) }}>
              {sat.orbitType}
            </span>
            <span style={noradStyle}>NORAD {sat.noradId}</span>
          </div>

          {/* Position */}
          <div style={sectionStyle}>
            <Row label="LAT" value={`${Math.abs(pos.lat).toFixed(2)}° ${pos.lat >= 0 ? 'N' : 'S'}`} />
            <Row label="LON" value={`${Math.abs(pos.lon).toFixed(2)}° ${pos.lon >= 0 ? 'E' : 'W'}`} />
            <Row label="ALT" value={`${pos.alt.toFixed(0)} km`} />
          </div>

          {/* Orbital parameters */}
          <div style={{ ...sectionStyle, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
            <Row label="PERIOD" value={`${(sat.period / 60).toFixed(1)} min`} />
            <Row label="INCL" value={`${sat.inclination.toFixed(1)}°`} />
            <Row label="ECC" value={sat.eccentricity.toFixed(4)} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ──

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  )
}

function orbitBadgeColor(type: string): string {
  switch (type) {
    case 'LEO': return 'rgba(77, 172, 255, 0.25)'
    case 'MEO': return 'rgba(77, 230, 128, 0.25)'
    case 'GEO': return 'rgba(255, 191, 51, 0.25)'
    case 'HEO': return 'rgba(230, 77, 153, 0.25)'
    default:    return 'rgba(255, 255, 255, 0.1)'
  }
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 30,
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 10,
  padding: '12px 14px',
  minWidth: 190,
  maxWidth: 220,
  fontFamily: 'inherit',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 6,
}

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#fff',
  boxShadow: '0 0 6px rgba(255,255,255,0.5)',
  flexShrink: 0,
}

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#e8eaed',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}

const followBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'rgba(255, 240, 50, 0.9)',
  background: 'rgba(255, 240, 50, 0.12)',
  borderRadius: 3,
  padding: '1px 5px',
  letterSpacing: '0.5px',
  flexShrink: 0,
}

const typeBadgeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
}

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'rgba(255, 255, 255, 0.75)',
  borderRadius: 3,
  padding: '1px 6px',
  letterSpacing: '0.3px',
}

const noradStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(255, 255, 255, 0.3)',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'rgba(255, 255, 255, 0.35)',
  letterSpacing: '0.5px',
}

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#e8eaed',
  fontVariantNumeric: 'tabular-nums',
}
