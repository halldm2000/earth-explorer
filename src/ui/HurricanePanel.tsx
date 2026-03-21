/**
 * HurricanePanel: left-side panel listing global tropical cyclones.
 *
 * Controlled via `open` prop from App.tsx. The toolbar button is
 * rendered by the Toolbar component — this file only renders the panel.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  subscribe,
  getStorms,
  isStormShown,
  isHurricaneLoading,
  selectStorm,
  categoryCssColor,
  basinLabel,
  type StormInfo,
} from '@/features/hurricane'

interface HurricanePanelProps {
  open: boolean
  onClose: () => void
}

export function HurricanePanel({ open, onClose }: HurricanePanelProps) {
  const [, setTick] = useState(0)

  // Subscribe to hurricane state changes
  useEffect(() => subscribe(() => setTick(v => v + 1)), [])

  const storms = getStorms()
  const loading = isHurricaneLoading()

  const active = useMemo(() => storms.filter(s => s.isActive), [storms])
  const recent = useMemo(() => storms.filter(s => !s.isActive), [storms])

  const [tab, setTab] = useState<'active' | 'recent'>('active')

  // Auto-switch to active tab when storms update
  useEffect(() => {
    if (active.length > 0) setTab('active')
    else if (recent.length > 0) setTab('recent')
  }, [active.length, recent.length])

  const handleClick = useCallback((storm: StormInfo) => {
    selectStorm(storm.id)
  }, [])

  if (!open || storms.length === 0) return null

  const displayed = tab === 'active' ? active : recent

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🌀</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text, #e8eaed)' }}>
            Cyclones
          </span>
          {loading && <span style={spinnerStyle}>⟳</span>}
        </div>
        <button onClick={onClose} style={closeBtnStyle}>×</button>
      </div>

      {/* Tabs */}
      <div style={tabBarStyle}>
        <button
          onClick={() => setTab('active')}
          style={{
            ...tabStyle,
            ...(tab === 'active' ? tabActiveStyle : {}),
          }}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setTab('recent')}
          style={{
            ...tabStyle,
            ...(tab === 'recent' ? tabActiveStyle : {}),
          }}
        >
          Recent ({recent.length})
        </button>
      </div>

      {/* Storm list */}
      <div style={listStyle}>
        {displayed.length === 0 && (
          <div style={emptyStyle}>
            {tab === 'active'
              ? 'No active tropical cyclones right now.'
              : 'No recent storms found.'}
          </div>
        )}
        {displayed.map(storm => (
          <StormRow
            key={storm.id}
            storm={storm}
            shown={isStormShown(storm.id)}
            onClick={handleClick}
          />
        ))}
      </div>
    </div>
  )
}

// ── StormRow ──

interface StormRowProps {
  storm: StormInfo
  shown: boolean
  onClick: (storm: StormInfo) => void
}

function StormRow({ storm, shown, onClick }: StormRowProps) {
  const catColor = categoryCssColor(storm.category)
  const latDir = storm.lat >= 0 ? 'N' : 'S'
  const lonDir = storm.lon >= 0 ? 'E' : 'W'

  return (
    <button
      onClick={() => onClick(storm)}
      style={{
        ...rowStyle,
        background: shown ? 'rgba(79, 195, 247, 0.08)' : 'transparent',
        borderLeft: shown ? `2px solid ${catColor}` : '2px solid transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: catColor, flexShrink: 0,
            boxShadow: storm.isActive ? `0 0 6px ${catColor}` : 'none',
          }} />
          <span style={nameStyle}>{storm.name}</span>
          <span style={{
            ...catBadgeStyle,
            background: catColor + '22',
            color: catColor,
          }}>
            {storm.category === 'TD' ? 'TD' : storm.category === 'TS' ? 'TS' : storm.category.replace('CAT', 'Cat ')}
          </span>
          <span style={basinBadgeStyle}>{basinLabel(storm.basin)}</span>
        </div>
        <div style={detailsStyle}>
          <span>{storm.windKnots} kt</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{Math.abs(storm.lat).toFixed(1)}°{latDir} {Math.abs(storm.lon).toFixed(1)}°{lonDir}</span>
          {!storm.isActive && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{formatShortDate(storm.lastUpdate)}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

// ── Styles ──

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  left: 60,       // right of toolbar
  top: 60,
  bottom: 52,     // above status bar
  width: 260,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(10, 12, 18, 0.88)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  zIndex: 35,
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 4px',
  lineHeight: 1,
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 0',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'rgba(255,255,255,0.4)',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
}

const tabActiveStyle: React.CSSProperties = {
  color: 'var(--accent, #4FC3F7)',
  borderBottomColor: 'var(--accent, #4FC3F7)',
}

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
}

const emptyStyle: React.CSSProperties = {
  padding: '16px 12px',
  fontSize: 11,
  color: 'rgba(255,255,255,0.3)',
  textAlign: 'center',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 10px',
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
}

const nameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text, #e8eaed)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const catBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 5px',
  borderRadius: 3,
  whiteSpace: 'nowrap',
}

const basinBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  padding: '1px 4px',
  borderRadius: 3,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.35)',
  whiteSpace: 'nowrap',
}

const detailsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  fontSize: 10,
  color: 'rgba(255,255,255,0.35)',
  marginTop: 2,
  paddingLeft: 14,
}

const spinnerStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--accent, #4FC3F7)',
  animation: 'spin 1s linear infinite',
}
