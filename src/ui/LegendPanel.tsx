/**
 * LegendPanel: floating legend/colorbar display for active data layers.
 *
 * Positioned bottom-right, above the chat bar. Shows compact gradient or
 * categorical legends for all visible layers that have a `legend` defined.
 * Auto-hides with CSS transition when no active layers have legends.
 *
 * Subscribes to layerRevision for reactivity (same pattern as LayerPanel).
 */

import { useStore } from '@/store'
import { getAllLayers } from '@/features/layers/manager'
import type { LayerLegend } from '@/features/layers/types'

// ── Component ──

export function LegendPanel() {
  // Subscribe to layer changes so we re-render when visibility toggles
  const _rev = useStore(s => s.layerRevision)
  void _rev

  const layers = getAllLayers()
  const legendLayers = layers.filter(l => l.visible && l.def.legend)

  const hasLegends = legendLayers.length > 0

  return (
    <div
      style={{
        ...containerStyle,
        opacity: hasLegends ? 1 : 0,
        transform: hasLegends ? 'scale(1)' : 'scale(0.95)',
        pointerEvents: hasLegends ? 'none' : 'none',
      }}
    >
      {legendLayers.map(layer => (
        <LegendCard
          key={layer.def.id}
          name={layer.def.name}
          legend={layer.def.legend!}
        />
      ))}
    </div>
  )
}

// ── LegendCard ──

function LegendCard({ name, legend }: { name: string; legend: LayerLegend }) {
  return (
    <div style={cardStyle}>
      {/* Title row */}
      <div style={titleRowStyle}>
        <span style={titleStyle}>
          {legend.title || name}
          {legend.units && (
            <span style={unitsStyle}> ({legend.units})</span>
          )}
        </span>
      </div>

      {/* Gradient or categorical content */}
      {legend.type === 'gradient' && legend.colorStops && (
        <GradientBar colorStops={legend.colorStops} />
      )}
      {legend.type === 'categorical' && legend.categories && (
        <CategoricalList categories={legend.categories} />
      )}
    </div>
  )
}

// ── GradientBar ──

interface ColorStop {
  value: number
  color: string
  label?: string
}

function GradientBar({ colorStops }: { colorStops: ColorStop[] }) {
  if (colorStops.length < 2) return null

  const min = colorStops[0].value
  const max = colorStops[colorStops.length - 1].value
  const range = max - min

  // Build CSS gradient
  const gradientParts = colorStops.map(stop => {
    const pct = range > 0 ? ((stop.value - min) / range) * 100 : 0
    return `${stop.color} ${pct.toFixed(1)}%`
  })
  const gradient = `linear-gradient(to right, ${gradientParts.join(', ')})`

  // Min/max labels (first and last stops)
  const minLabel = colorStops[0].label ?? String(colorStops[0].value)
  const maxLabel = colorStops[colorStops.length - 1].label ?? String(colorStops[colorStops.length - 1].value)

  return (
    <div>
      {/* Gradient bar */}
      <div
        style={{
          ...gradientBarStyle,
          background: gradient,
        }}
      />
      {/* Min/max labels */}
      <div style={labelsRowStyle}>
        <span style={labelStyle}>{minLabel}</span>
        <span style={labelStyle}>{maxLabel}</span>
      </div>
    </div>
  )
}

// ── CategoricalList ──

function CategoricalList({ categories }: { categories: { color: string; label: string }[] }) {
  return (
    <div style={categoricalContainerStyle}>
      {categories.map((cat, i) => (
        <div key={i} style={categoricalItemStyle}>
          <span
            style={{
              ...swatchStyle,
              background: cat.color,
            }}
          />
          <span style={categoricalLabelStyle}>{cat.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 90,
  right: 16,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-end',
  pointerEvents: 'none',
  maxHeight: 'calc(100vh - 120px)',
  overflowY: 'auto',
  transition: 'opacity 0.25s ease, transform 0.25s ease',
  transformOrigin: 'bottom right',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 8,
  padding: '10px 12px',
  minWidth: 180,
  maxWidth: 220,
  pointerEvents: 'auto',
  fontFamily: 'inherit',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  marginBottom: 6,
}

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text, #e8eaed)',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const unitsStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 400,
  color: 'var(--text-muted, rgba(255, 255, 255, 0.3))',
}

const gradientBarStyle: React.CSSProperties = {
  width: 180,
  height: 14,
  borderRadius: 2,
  border: '1px solid rgba(255, 255, 255, 0.1)',
}

const labelsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: 180,
  marginTop: 2,
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted, rgba(255, 255, 255, 0.3))',
  lineHeight: 1,
}

const categoricalContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
}

const categoricalItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const swatchStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 2,
  border: '1px solid rgba(255, 255, 255, 0.15)',
  flexShrink: 0,
}

const categoricalLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted, rgba(255, 255, 255, 0.3))',
  lineHeight: 1.2,
}
