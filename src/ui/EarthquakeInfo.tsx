/**
 * EarthquakeInfo: floating HUD showing selected earthquake details.
 *
 * Positioned top-right (below SatelliteInfo if both active).
 * Auto-hides when no earthquake is selected or layer is hidden.
 */

import { useEffect, useState } from 'react'
import {
  subscribe,
  isEarthquakeVisible,
  getSelectedQuake,
} from '@/features/earthquake'
import type { QuakeFeature } from '@/features/earthquake'

export function EarthquakeInfo() {
  const [, tick] = useState(0)
  useEffect(() => subscribe(() => tick(v => v + 1)), [])

  const quake = getSelectedQuake()
  const visible = isEarthquakeVisible() && quake != null

  if (!visible || !quake) {
    return (
      <div style={{ ...containerStyle, opacity: 0, transform: 'translateY(-8px)', pointerEvents: 'none' }} />
    )
  }

  const p = quake.properties
  const [lon, lat, depth] = quake.geometry.coordinates
  const time = new Date(p.time)
  const ago = formatAgo(time)
  const magT = Math.min(Math.max((p.mag - 2.5) / 5, 0), 1)

  return (
    <div style={{ ...containerStyle, opacity: 1, transform: 'translateY(0)', pointerEvents: 'auto' }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ ...magBadgeStyle, background: magBadgeColor(magT) }}>
          M{p.mag.toFixed(1)}
        </span>
        <span style={placeStyle}>{p.place}</span>
      </div>

      {/* Time */}
      <div style={timeStyle}>{time.toLocaleString()} ({ago})</div>

      {/* Flags */}
      {(p.tsunami > 0 || p.alert) && (
        <div style={flagRowStyle}>
          {p.tsunami > 0 && <span style={tsunamiBadgeStyle}>TSUNAMI</span>}
          {p.alert && <span style={{ ...alertBadgeStyle, background: alertColor(p.alert) }}>{p.alert.toUpperCase()}</span>}
        </div>
      )}

      {/* Position */}
      <div style={sectionStyle}>
        <Row label="LAT" value={`${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}`} />
        <Row label="LON" value={`${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`} />
        <Row label="DEPTH" value={`${depth.toFixed(1)} km`} />
      </div>

      {/* Details */}
      <div style={{ ...sectionStyle, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
        <Row label="TYPE" value={p.magType.toUpperCase()} />
        <Row label="SIG" value={String(p.sig)} />
        {p.felt != null && p.felt > 0 && <Row label="FELT" value={`${p.felt} reports`} />}
        <Row label="STATUS" value={p.status} />
      </div>
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

function formatAgo(date: Date): string {
  const ms = Date.now() - date.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ${min % 60}m ago`
  return `${Math.floor(hr / 24)}d ago`
}

function magBadgeColor(t: number): string {
  // yellow → orange → red
  const r = 255
  const g = Math.round(255 - t * 200)
  const b = Math.round(25 - t * 25)
  return `rgba(${r}, ${g}, ${b}, 0.25)`
}

function alertColor(alert: string): string {
  switch (alert) {
    case 'green': return 'rgba(77, 200, 77, 0.25)'
    case 'yellow': return 'rgba(230, 200, 50, 0.25)'
    case 'orange': return 'rgba(230, 150, 50, 0.25)'
    case 'red': return 'rgba(230, 50, 50, 0.25)'
    default: return 'rgba(255, 255, 255, 0.1)'
  }
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 29,  // just below SatelliteInfo (30)
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 10,
  padding: '12px 14px',
  minWidth: 200,
  maxWidth: 260,
  fontFamily: 'inherit',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
}

const magBadgeStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: '#e8eaed',
  borderRadius: 4,
  padding: '2px 7px',
  flexShrink: 0,
}

const placeStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#e8eaed',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  flex: 1,
}

const timeStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(255, 255, 255, 0.4)',
  marginBottom: 8,
}

const flagRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginBottom: 8,
}

const tsunamiBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'rgba(50, 180, 255, 0.9)',
  background: 'rgba(50, 180, 255, 0.12)',
  borderRadius: 3,
  padding: '1px 5px',
  letterSpacing: '0.5px',
}

const alertBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'rgba(255, 255, 255, 0.8)',
  borderRadius: 3,
  padding: '1px 5px',
  letterSpacing: '0.5px',
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
