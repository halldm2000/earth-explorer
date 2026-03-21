/**
 * GlobalControls: vertical stack of global + app-context buttons.
 *
 * Always shows: Quality preset, Layers, Sun, Haze.
 * When apps are active, their context buttons appear above with dividers.
 * Apps add/remove their groups dynamically based on visibility.
 */

import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { applyQualityPreset } from '@/scene/engine'
import {
  getSceneToggles,
  subscribeScene,
  toggleSceneLighting,
  toggleSceneAtmosphere,
} from '@/scene/CesiumViewer'
import type { QualityPreset } from '@/store/quality'

// App state imports
import {
  isEarthquakeVisible, getSelectedQuake, subscribe as subEq,
} from '@/features/earthquake'
import {
  isFlightsVisible, getAircraft, subscribe as subFl,
} from '@/features/flights'
import {
  isSatelliteVisible, getTrackedSatellite, isFollowingSatellite,
  stopFollowing as stopSatFollowing, clearTrackedSatellite,
  subscribe as subSat,
} from '@/features/satellite'
import {
  isHurricaneVisible, isHurricanePanelOpen, toggleHurricanePanel,
  getStorms, subscribe as subHr,
} from '@/features/hurricane'
import {
  isShipsVisible, getShips, subscribe as subSh,
} from '@/features/ships'
import { registry } from '@/ai/registry'

const PRESET_LABELS: Record<QualityPreset, string> = {
  performance: 'PERF',
  quality: 'HIGH',
  ultra: 'ULTRA',
}

const PRESET_COLORS: Record<QualityPreset, string> = {
  performance: 'var(--text, white)',
  quality: 'var(--accent, #4FC3F7)',
  ultra: '#FFD54F',
}

export function GlobalControls() {
  const qualityPreset = useStore(s => s.qualityPreset)
  const cycleQualityPreset = useStore(s => s.cycleQualityPreset)
  const layerPanelOpen = useStore(s => s.layerPanelOpen)
  const toggleLayerPanel = useStore(s => s.toggleLayerPanel)

  const [sceneState, setSceneState] = useState(getSceneToggles)
  const [, setTick] = useState(0)

  useEffect(() => subscribeScene(() => setSceneState(getSceneToggles())), [])

  // Subscribe to all app state changes for context buttons
  useEffect(() => {
    const bump = () => setTick(v => v + 1)
    const unsubs = [subEq(bump), subFl(bump), subSat(bump), subHr(bump), subSh(bump)]
    return () => unsubs.forEach(u => u())
  }, [])

  const handleQualityCycle = () => {
    cycleQualityPreset()
    const order: QualityPreset[] = ['performance', 'quality', 'ultra']
    const idx = order.indexOf(qualityPreset)
    const next = order[(idx + 1) % order.length]
    applyQualityPreset(next)
  }

  // Helper to run a registered command and post result to chat
  const run = (cmdId: string) => {
    const cmd = registry.get(cmdId)
    if (!cmd) return
    const postToChat = (text: string) => {
      if (!text) return
      const store = useStore.getState()
      store.addMessage({ role: 'assistant', content: text })
      // Auto-open chat panel so user sees the result
      if (store.panelState === 'minimized') store.setPanelState('peek')
    }
    const result = cmd.handler({})
    if (result && typeof (result as any).then === 'function') {
      (result as Promise<string>).then(postToChat)
    } else if (typeof result === 'string') {
      postToChat(result)
    }
  }

  // ── Build app context groups ──
  const appGroups: React.ReactNode[] = []

  // Satellite controls
  if (isSatelliteVisible()) {
    const tracked = getTrackedSatellite()
    const following = isFollowingSatellite()
    appGroups.push(
      <div key="sat" style={groupStyle}>
        <ControlBtn
          onClick={() => tracked ? clearTrackedSatellite() : run('satellite:track')}
          label={tracked ? tracked.name.slice(0, 5) : 'Track'}
          active={!!tracked}
          icon={<SatTrackIcon color={tracked ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={() => following ? stopSatFollowing() : run('satellite:follow')}
          label={following ? 'Unfollow' : 'Follow'}
          active={following}
          icon={<SatFollowIcon color={following ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={() => run('satellite:isolate')}
          label="Isolate"
          active={false}
          icon={<SatIsolateIcon color={'rgba(255,255,255,0.85)'} />}
        />
      </div>
    )
  }

  // Hurricane controls
  if (isHurricaneVisible()) {
    const panelOpen = isHurricanePanelOpen()
    const stormCount = getStorms().filter(s => s.isActive).length
    appGroups.push(
      <div key="hur" style={groupStyle}>
        <ControlBtn
          onClick={toggleHurricanePanel}
          label={panelOpen ? 'Close' : `Storms`}
          active={panelOpen}
          icon={<PanelIcon color={panelOpen ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={() => run('hurricane:refresh')}
          label="Refresh"
          active={false}
          icon={<RefreshIcon color={'rgba(255,255,255,0.85)'} />}
        />
      </div>
    )
  }

  // Earthquake controls
  if (isEarthquakeVisible()) {
    const selected = getSelectedQuake()
    appGroups.push(
      <div key="eq" style={groupStyle}>
        <ControlBtn
          onClick={() => run('earthquake:summary')}
          label="Stats"
          active={false}
          icon={<StatsIcon color={'rgba(255,255,255,0.85)'} />}
        />
        {selected && (
          <ControlBtn
            onClick={() => run('earthquake:deselect')}
            label="Desel"
            active={true}
            icon={<DeselectIcon color={'var(--accent, #4FC3F7)'} />}
          />
        )}
      </div>
    )
  }

  // Flight controls
  if (isFlightsVisible()) {
    appGroups.push(
      <div key="fl" style={groupStyle}>
        <ControlBtn
          onClick={() => run('flights:summary')}
          label="Stats"
          active={false}
          icon={<StatsIcon color={'rgba(255,255,255,0.85)'} />}
        />
      </div>
    )
  }

  // Ship controls
  if (isShipsVisible()) {
    appGroups.push(
      <div key="sh" style={groupStyle}>
        <ControlBtn
          onClick={() => run('ships:summary')}
          label="Stats"
          active={false}
          icon={<StatsIcon color={'rgba(255,255,255,0.85)'} />}
        />
      </div>
    )
  }

  return (
    <div style={columnStyle}>
      {/* App context groups (above globals, with dividers) */}
      {appGroups.map((group, i) => (
        <div key={i}>
          {group}
          <div style={dividerStyle} />
        </div>
      ))}

      {/* Global controls (always visible) */}
      <div style={groupStyle}>
        <ControlBtn
          onClick={handleQualityCycle}
          label={PRESET_LABELS[qualityPreset]}
          active={qualityPreset !== 'performance'}
          activeColor={PRESET_COLORS[qualityPreset]}
          icon={<SparkleIcon color={qualityPreset !== 'performance' ? PRESET_COLORS[qualityPreset] : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={toggleLayerPanel}
          label="Layers"
          active={layerPanelOpen}
          icon={<LayersIcon color={layerPanelOpen ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={toggleSceneLighting}
          label="Sun"
          active={sceneState.lighting}
          icon={<SunIcon color={sceneState.lighting ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
        <ControlBtn
          onClick={toggleSceneAtmosphere}
          label="Haze"
          active={sceneState.atmosphere}
          icon={<HazeIcon color={sceneState.atmosphere ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.85)'} />}
        />
      </div>
    </div>
  )
}

// ── Labeled button (exported for reuse) ──

export function ControlBtn({ onClick, label, active, icon, activeColor }: {
  onClick: () => void
  label: string
  active: boolean
  icon: React.ReactNode
  activeColor?: string
}) {
  const accentColor = activeColor ?? 'var(--accent, #4FC3F7)'
  const textColor = active ? accentColor : 'rgba(255,255,255,0.7)'

  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        ...btnStyle,
        borderColor: active ? accentColor : 'var(--border, rgba(255,255,255,0.08))',
        background: active ? 'rgba(20, 25, 35, 0.85)' : 'rgba(25, 30, 40, 0.7)',
      }}
    >
      {icon}
      <span style={{
        fontSize: 7,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: textColor,
        lineHeight: 1,
        marginTop: 2,
        fontFamily: 'var(--mono, monospace)',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </button>
  )
}

// ── SVG Icons: Global ──

function SparkleIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function LayersIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M8 2L1 6l7 4 7-4z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M1 8.5l7 4 7-4" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 11l7 4 7-4" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function HazeIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M2 6c1-2 3-3 6-3s5 1 6 3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 9c1-1.5 2.5-2.5 5-2.5s4 1 5 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4 12c1-1 2-1.5 4-1.5s3 .5 4 1.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// ── SVG Icons: App context ──

function SatTrackIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1" fill={color} />
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function SatFollowIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 5l1.5 1.5M10.5 10.5L9.5 9.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.5" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

function SatIsolateIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="5" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" />
      <circle cx="8" cy="8" r="1.5" fill={color} />
    </svg>
  )
}

function PanelIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.2" />
      <path d="M2 5.5h12" stroke={color} strokeWidth="1" />
      <path d="M5 8h6M5 10.5h4" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M13 8A5 5 0 1 1 8 3" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 1l2.5 2L8 5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatsIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M3 13V8M6.5 13V5M10 13V7M13.5 13V3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DeselectIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="5" stroke={color} strokeWidth="1.2" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

// ── Styles ──

const columnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  alignItems: 'center',
}

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'center',
}

const dividerStyle: React.CSSProperties = {
  width: 26,
  height: 1,
  background: 'rgba(255,255,255,0.15)',
  margin: '5px auto',
}

const btnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 2px 2px',
  backdropFilter: 'blur(var(--blur, 20px))',
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  color: 'var(--text-secondary)',
  gap: 0,
}
