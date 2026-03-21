/**
 * AppDock: central app icon row with context-sensitive buttons.
 *
 * Reads registered app toolbar configs from the app manager and renders
 * a horizontal dock. Active apps get an accent border. When an active app
 * has contextButtons, they appear as an inline extension with a divider.
 */

import { useEffect, useState, useCallback } from 'react'
import { getAppToolbars, subscribeManager } from '@/apps/manager'
import { registry } from '@/ai/registry'
import type { AppToolbarConfig, AppToolbarButton } from '@/apps/types'

interface AppEntry {
  id: string
  name: string
  active: boolean
  toolbar?: AppToolbarConfig
}

// Larger, clearer SVG icons (20x20 viewBox)
function AppIcon({ appId, color }: { appId: string; color: string }) {
  const s = { display: 'block' as const }
  switch (appId) {
    case 'earthquake':
      // Seismograph wave
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={s}>
          <path d="M2 10h3l1.5-5 2 10 2-8 1.5 3H18" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'flights':
      // Top-down airplane
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={s}>
          <path d="M10 2v16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 6L3 11v1.5l7-2.5 7 2.5V11z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M10 14l-3 3v1l3-1.5 3 1.5v-1z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )
    case 'satellite':
      // Satellite with solar panels
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={s}>
          <rect x="8" y="8" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.3" />
          <rect x="1" y="8.5" width="6" height="3" rx="0.5" stroke={color} strokeWidth="1.2" />
          <rect x="13" y="8.5" width="6" height="3" rx="0.5" stroke={color} strokeWidth="1.2" />
          <line x1="4" y1="8.5" x2="4" y2="11.5" stroke={color} strokeWidth="0.8" />
          <line x1="16" y1="8.5" x2="16" y2="11.5" stroke={color} strokeWidth="0.8" />
          <circle cx="10" cy="5" r="1.5" stroke={color} strokeWidth="1.2" />
          <line x1="10" y1="6.5" x2="10" y2="8" stroke={color} strokeWidth="1.2" />
        </svg>
      )
    case 'hurricane':
      // Spiral / cyclone
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={s}>
          <path d="M10 7a3 3 0 1 1-1 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M10 4a6 6 0 1 0 2 11.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="10" r="1.2" fill={color} />
        </svg>
      )
    case 'ships':
      // Ship hull with mast
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={s}>
          <path d="M3 13l2-5h10l2 5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 8V4h2v4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 4l3 2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M1 16c2-1.5 4-2 6-1s4 1 6 0 4-.5 6 1" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    default:
      return <span>{appId[0]?.toUpperCase()}</span>
  }
}

// Short labels for each app
const APP_LABELS: Record<string, string> = {
  earthquake: 'Quakes',
  flights: 'Flights',
  satellite: 'Sats',
  hurricane: 'Storms',
  ships: 'Ships',
}

export function AppDock() {
  const [apps, setApps] = useState<AppEntry[]>(() => getAppToolbars())
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({})

  // Re-fetch app list when manager notifies
  useEffect(() => {
    const update = () => setApps(getAppToolbars())
    return subscribeManager(update)
  }, [])

  // Poll isVisible state for all apps (cheap boolean reads)
  useEffect(() => {
    const poll = () => {
      const next: Record<string, boolean> = {}
      for (const app of getAppToolbars()) {
        if (app.active && app.toolbar?.isVisible) {
          next[app.id] = app.toolbar.isVisible()
        }
      }
      setVisibilityMap(next)
    }
    poll()
    const id = setInterval(poll, 300)
    return () => clearInterval(id)
  }, [apps])

  const handleToggle = useCallback((appId: string, isVisible: boolean) => {
    const cmdId = `${appId}:${isVisible ? 'hide' : 'show'}`
    const cmd = registry.get(cmdId)
    if (cmd) {
      cmd.handler({})
    }
  }, [])

  // Only show apps that have toolbar configs
  const dockApps = apps.filter(a => a.toolbar)
  if (dockApps.length === 0) return null

  return (
    <div style={rowStyle}>
      {dockApps.map(app => {
        const isVisible = visibilityMap[app.id] ?? false
        const hasContext = isVisible && app.toolbar?.contextButtons && app.toolbar.contextButtons.length > 0
        const color = isVisible
          ? 'var(--accent, #4FC3F7)'
          : 'rgba(255,255,255,0.85)'

        return (
          <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Main app button with label */}
            <button
              onClick={() => handleToggle(app.id, isVisible)}
              title={`${app.name}: ${isVisible ? 'Visible' : 'Hidden'}`}
              style={{
                ...btnStyle,
                borderColor: isVisible
                  ? 'var(--accent, #4FC3F7)'
                  : 'var(--border, rgba(255,255,255,0.08))',
                background: isVisible
                  ? 'rgba(20, 25, 35, 0.85)'
                  : 'rgba(25, 30, 40, 0.7)',
                opacity: isVisible ? 1 : 0.85,
              }}
            >
              <AppIcon appId={app.id} color={color} />
              <span style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: '0.03em',
                color,
                lineHeight: 1,
                marginTop: 2,
                fontFamily: 'var(--mono, monospace)',
              }}>
                {APP_LABELS[app.id] ?? app.toolbar!.label}
              </span>
            </button>

            {/* Context buttons with divider */}
            {hasContext && (
              <>
                <div style={dividerStyle} />
                {app.toolbar!.contextButtons!.map(ctxBtn => (
                  <ContextButton key={ctxBtn.id} btn={ctxBtn} />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ContextButton({ btn }: { btn: AppToolbarButton }) {
  return (
    <button
      onClick={btn.onClick}
      title={btn.label}
      style={{
        ...btnStyle,
        width: 34,
        height: 34,
        borderColor: 'var(--border, rgba(255,255,255,0.08))',
        background: 'rgba(25, 30, 40, 0.7)',
      }}
    >
      <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {btn.icon}
      </span>
    </button>
  )
}

// ── Styles ──

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  alignItems: 'flex-end',
  justifyContent: 'center',
}

const btnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 2px 3px',
  backdropFilter: 'blur(var(--blur, 20px))',
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  color: 'var(--text-secondary)',
  gap: 0,
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(255,255,255,0.15)',
  flexShrink: 0,
}
