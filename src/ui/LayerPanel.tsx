/**
 * LayerPanel: left-side drawer for toggling and tuning data layers.
 *
 * Layers are grouped by category. Imagery layers get opacity sliders
 * and an expandable property editor (brightness, contrast, saturation).
 * GeoJSON layers only get a visibility toggle.
 *
 * Keyboard shortcut: press "l" to toggle the panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import {
  getAllLayers,
  toggleLayer,
  removeLayer,
  setLayerProperty,
  setGeoJsonProperty,
  resetLayerProperties,
  reorderLayer,
  getLayerOrder,
} from '@/features/layers/manager'
import { getBaseMapStyle, getBaseMapStyles, setBaseMapStyle } from '@/scene/engine'
import type { LiveLayer } from '@/features/layers/types'
import type { GeoJsonProperties } from '@/features/layers/types'
import { GibsCatalog } from './GibsCatalog'

// ── Helpers ──

/** Preferred category order: boundaries first, satellite second, then alphabetical. */
function categoryOrder(cat: string): number {
  if (cat === 'boundaries') return 0
  if (cat === 'satellite') return 1
  return 2
}

function groupByCategory(layers: LiveLayer[]): Map<string, LiveLayer[]> {
  const map = new Map<string, LiveLayer[]>()
  for (const l of layers) {
    const cat = l.def.category
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(l)
  }
  // Sort by preferred order
  const sorted = new Map(
    [...map.entries()].sort((a, b) => {
      const oa = categoryOrder(a[0])
      const ob = categoryOrder(b[0])
      if (oa !== ob) return oa - ob
      return a[0].localeCompare(b[0])
    }),
  )
  return sorted
}

// ── Component ──

export function LayerPanel() {
  const layerPanelOpen = useStore(s => s.layerPanelOpen)
  const toggleLayerPanel = useStore(s => s.toggleLayerPanel)
  const expandedLayerId = useStore(s => s.expandedLayerId)
  const setExpandedLayerId = useStore(s => s.setExpandedLayerId)
  const collapsedCategories = useStore(s => s.collapsedCategories)
  const toggleCategory = useStore(s => s.toggleCategory)
  const bumpLayerRevision = useStore(s => s.bumpLayerRevision)

  // Subscribe to layerRevision so we re-render when layers mutate
  const _rev = useStore(s => s.layerRevision)
  void _rev

  const layers = getAllLayers()
  const grouped = groupByCategory(layers)
  const activeCount = layers.filter(l => l.visible).length
  const totalCount = layers.length

  // Keyboard shortcut: "l" toggles panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'l') {
        toggleLayerPanel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggleLayerPanel])

  const handleToggleLayer = useCallback(async (id: string) => {
    await toggleLayer(id)
    bumpLayerRevision()
  }, [bumpLayerRevision])

  const handlePropertyChange = useCallback(
    (id: string, prop: 'alpha' | 'brightness' | 'contrast' | 'saturation', value: number) => {
      setLayerProperty(id, prop, value)
      bumpLayerRevision()
    },
    [bumpLayerRevision],
  )

  const handleGeoJsonPropertyChange = useCallback(
    (id: string, prop: keyof GeoJsonProperties, value: string | number) => {
      setGeoJsonProperty(id, prop, value)
      bumpLayerRevision()
    },
    [bumpLayerRevision],
  )

  const handleReset = useCallback(
    (id: string) => {
      resetLayerProperties(id)
      bumpLayerRevision()
    },
    [bumpLayerRevision],
  )

  // ── Drag-to-reorder state ──
  const dragLayerId = useRef<string | null>(null)

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id
  }, [])

  const handleDrop = useCallback((targetId: string) => {
    const srcId = dragLayerId.current
    dragLayerId.current = null
    if (!srcId || srcId === targetId) return

    // Find target's position in the imagery stack order
    const order = getLayerOrder()
    const targetIdx = order.indexOf(targetId)
    if (targetIdx === -1) return

    reorderLayer(srcId, targetIdx)
    bumpLayerRevision()
  }, [bumpLayerRevision])

  // ── GIBS catalog ──
  const [catalogOpen, setCatalogOpen] = useState(false)

  const handleRemoveLayer = useCallback((id: string) => {
    removeLayer(id)
    bumpLayerRevision()
  }, [bumpLayerRevision])

  // ── Base map ──
  const [baseMap, setBaseMap] = useState(getBaseMapStyle)
  const baseMapStyles = getBaseMapStyles()

  const handleBaseMapChange = useCallback(async (style: string) => {
    await setBaseMapStyle(style as any)
    setBaseMap(style as any)
  }, [])

  return (
    <>
      {/* Toggle button moved to Toolbar component */}

      {/* Panel drawer */}
      <div
        style={{
          ...panelStyle,
          transform: layerPanelOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text, #e8eaed)' }}>
              Layers
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.3))' }}>
              ({activeCount}/{totalCount})
            </span>
          </div>
          <button
            onClick={toggleLayerPanel}
            style={closeBtnStyle}
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Scrollable list */}
        <div style={scrollAreaStyle}>
          {/* Base map selector */}
          <BaseMapSelector
            current={baseMap}
            styles={baseMapStyles}
            onChange={handleBaseMapChange}
          />

          {[...grouped.entries()].map(([category, catLayers]) => (
            <CategoryGroup
              key={category}
              category={category}
              layers={catLayers}
              collapsed={collapsedCategories.has(category)}
              onToggleCategory={() => toggleCategory(category)}
              expandedLayerId={expandedLayerId}
              onSetExpandedLayerId={setExpandedLayerId}
              onToggleLayer={handleToggleLayer}
              onPropertyChange={handlePropertyChange}
              onGeoJsonPropertyChange={handleGeoJsonPropertyChange}
              onReset={handleReset}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onRemoveLayer={handleRemoveLayer}
            />
          ))}
          {totalCount === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted, rgba(255,255,255,0.3))' }}>
              No layers registered.
            </div>
          )}

          {/* Browse GIBS Catalog button */}
          <div style={{ padding: '12px 12px 16px' }}>
            <button
              onClick={() => setCatalogOpen(true)}
              style={browseCatalogBtnStyle}
            >
              Browse GIBS Catalog (1,123 layers)
            </button>
          </div>
        </div>
      </div>

      {/* GIBS Catalog modal */}
      {catalogOpen && <GibsCatalog onClose={() => setCatalogOpen(false)} />}
    </>
  )
}

// ── CategoryGroup ──

interface CategoryGroupProps {
  category: string
  layers: LiveLayer[]
  collapsed: boolean
  onToggleCategory: () => void
  expandedLayerId: string | null
  onSetExpandedLayerId: (id: string | null) => void
  onToggleLayer: (id: string) => void
  onPropertyChange: (id: string, prop: 'alpha' | 'brightness' | 'contrast' | 'saturation', value: number) => void
  onGeoJsonPropertyChange: (id: string, prop: keyof GeoJsonProperties, value: string | number) => void
  onReset: (id: string) => void
  onDragStart: (id: string) => void
  onDrop: (targetId: string) => void
  onRemoveLayer: (id: string) => void
}

function CategoryGroup({
  category,
  layers,
  collapsed,
  onToggleCategory,
  expandedLayerId,
  onSetExpandedLayerId,
  onToggleLayer,
  onPropertyChange,
  onGeoJsonPropertyChange,
  onReset,
  onDragStart,
  onDrop,
  onRemoveLayer,
}: CategoryGroupProps) {
  const activeInCat = layers.filter(l => l.visible).length

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Category header */}
      <div
        onClick={onToggleCategory}
        style={categoryHeaderStyle}
      >
        <span style={{ fontSize: 10, marginRight: 4, opacity: 0.5 }}>
          {collapsed ? '\u25B8' : '\u25BE'}
        </span>
        <span style={{ flex: 1 }}>{category}</span>
        <span style={categoryBadgeStyle}>
          {activeInCat}/{layers.length}
        </span>
      </div>

      {/* Layer rows */}
      {!collapsed && layers.map(layer => {
        const isExpanded = expandedLayerId === layer.def.id
        const hasExpandableProps = layer.def.kind === 'imagery' || layer.def.kind === 'geojson'

        return (
          <div key={layer.def.id}>
            <LayerRow
              layer={layer}
              isExpanded={isExpanded}
              onToggle={() => onToggleLayer(layer.def.id)}
              onToggleExpand={hasExpandableProps ? () =>
                onSetExpandedLayerId(isExpanded ? null : layer.def.id)
              : undefined}
              onPropertyChange={onPropertyChange}
              onGeoJsonPropertyChange={onGeoJsonPropertyChange}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onRemove={
                (layer.def.id.startsWith('gibs:') || layer.def.category === 'gibs-catalog' || layer.def.category === 'satellite')
                  ? () => onRemoveLayer(layer.def.id)
                  : undefined
              }
            />
            {isExpanded && layer.def.kind === 'imagery' && (
              <PropertyEditor
                layer={layer}
                onPropertyChange={onPropertyChange}
                onReset={() => onReset(layer.def.id)}
              />
            )}
            {isExpanded && layer.def.kind === 'geojson' && (
              <GeoJsonPropertyEditor
                layer={layer}
                onPropertyChange={onGeoJsonPropertyChange}
                onReset={() => onReset(layer.def.id)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── LayerRow ──

interface LayerRowProps {
  layer: LiveLayer
  isExpanded: boolean
  onToggle: () => void
  onToggleExpand?: () => void
  onPropertyChange: (id: string, prop: 'alpha' | 'brightness' | 'contrast' | 'saturation', value: number) => void
  onGeoJsonPropertyChange: (id: string, prop: keyof GeoJsonProperties, value: string | number) => void
  onDragStart: (id: string) => void
  onDrop: (targetId: string) => void
  onRemove?: () => void
}

function LayerRow({ layer, isExpanded, onToggle, onToggleExpand, onPropertyChange, onGeoJsonPropertyChange, onDragStart, onDrop, onRemove }: LayerRowProps) {
  const isImagery = layer.def.kind === 'imagery'
  const isGeoJson = layer.def.kind === 'geojson'
  const [dragOver, setDragOver] = useState(false)

  // Get current opacity value for the inline slider
  const opacity = isImagery
    ? layer.properties.alpha
    : isGeoJson && layer.geoJsonProperties
      ? layer.geoJsonProperties.alpha
      : 1

  return (
    <div
      style={{
        ...layerRowStyle,
        background: dragOver ? 'rgba(79, 195, 247, 0.1)' : undefined,
        borderTop: dragOver ? '2px solid var(--accent, #4FC3F7)' : '2px solid transparent',
      }}
      draggable={isImagery}
      onDragStart={(e) => {
        if (!isImagery) return
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(layer.def.id)
      }}
      onDragOver={(e) => {
        if (!isImagery) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!isImagery) return
        onDrop(layer.def.id)
      }}
    >
      {/* Drag handle (imagery only) */}
      {isImagery ? (
        <span style={dragHandleStyle} title="Drag to reorder">
          &#x2630;
        </span>
      ) : (
        <span style={{ width: 14, flexShrink: 0 }} />
      )}

      {/* Color swatch (geojson only) */}
      {isGeoJson && layer.geoJsonProperties && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: layer.geoJsonProperties.strokeColor,
            opacity: layer.geoJsonProperties.alpha,
            flexShrink: 0,
          }}
        />
      )}

      {/* Eye toggle */}
      <span
        onClick={onToggle}
        style={{
          ...eyeStyle,
          color: layer.visible
            ? 'var(--accent, #4FC3F7)'
            : 'var(--text-muted, rgba(255,255,255,0.3))',
          cursor: 'pointer',
        }}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? '\u25CF' : '\u25CB'}
      </span>

      {/* Layer name */}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: layer.visible
            ? 'var(--text, #e8eaed)'
            : 'var(--text-muted, rgba(255,255,255,0.3))',
          fontStyle: layer.visible ? 'normal' : 'italic',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={layer.def.description}
      >
        {layer.def.name}
      </span>

      {/* Mini opacity slider (imagery and geojson) */}
      {(isImagery || isGeoJson) && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          onInput={(e) => {
            const val = parseFloat((e.target as HTMLInputElement).value)
            if (isImagery) onPropertyChange(layer.def.id, 'alpha', val)
            else onGeoJsonPropertyChange(layer.def.id, 'alpha', val)
          }}
          style={miniSliderStyle}
          title={`Opacity: ${Math.round(opacity * 100)}%`}
        />
      )}

      {/* Expand chevron (imagery and geojson) */}
      {onToggleExpand && (
        <span
          onClick={onToggleExpand}
          style={expandChevronStyle}
          title="Layer properties"
        >
          {isExpanded ? '\u25BE' : '\u25B8'}
        </span>
      )}

      {/* Remove button (GIBS catalog layers) */}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={removeBtnStyle}
          title="Remove layer"
        >
          &times;
        </span>
      )}
    </div>
  )
}

// ── LayerInfo ──

function LayerInfo({ layer }: { layer: LiveLayer }) {
  const def = layer.def

  // Extract source/instrument from description for GIBS layers
  // GIBS descriptions follow the pattern: "Instrument — Group (NASA GIBS)"
  const isGibs = def.id.startsWith('gibs')
  const isBoundary = def.kind === 'geojson'

  return (
    <div style={{
      marginBottom: 8,
      paddingBottom: 8,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Description */}
      <div style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: 'var(--text-secondary, rgba(255,255,255,0.55))',
        marginBottom: 4,
      }}>
        {def.description}
      </div>

      {/* Metadata tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {/* Layer type */}
        <InfoTag label={def.kind === 'imagery' ? 'Raster' : def.kind === 'geojson' ? 'Vector' : '3D'} />

        {/* Source hint */}
        {isGibs && <InfoTag label="NASA GIBS" />}
        {isBoundary && <InfoTag label="Natural Earth" />}

        {/* Category */}
        <InfoTag label={def.category} />
      </div>
    </div>
  )
}

function InfoTag({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10,
      padding: '1px 6px',
      borderRadius: 3,
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--text-muted, rgba(255,255,255,0.4))',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── PropertyEditor ──

interface PropertyEditorProps {
  layer: LiveLayer
  onPropertyChange: (id: string, prop: 'alpha' | 'brightness' | 'contrast' | 'saturation', value: number) => void
  onReset: () => void
}

function PropertyEditor({ layer, onPropertyChange, onReset }: PropertyEditorProps) {
  const p = layer.properties

  return (
    <div style={propertyEditorStyle}>
      <LayerInfo layer={layer} />
      <SliderRow
        label="Opacity"
        value={Math.round(p.alpha * 100)}
        min={0}
        max={100}
        onInput={(v) => onPropertyChange(layer.def.id, 'alpha', v / 100)}
      />
      <SliderRow
        label="Bright"
        value={Math.round(p.brightness * 100)}
        min={0}
        max={300}
        onInput={(v) => onPropertyChange(layer.def.id, 'brightness', v / 100)}
      />
      <SliderRow
        label="Contrast"
        value={Math.round(p.contrast * 100)}
        min={0}
        max={300}
        onInput={(v) => onPropertyChange(layer.def.id, 'contrast', v / 100)}
      />
      <SliderRow
        label="Satur."
        value={Math.round(p.saturation * 100)}
        min={0}
        max={300}
        onInput={(v) => onPropertyChange(layer.def.id, 'saturation', v / 100)}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onReset} style={resetBtnStyle}>
          Reset
        </button>
      </div>
    </div>
  )
}

// ── GeoJsonPropertyEditor ──

interface GeoJsonPropertyEditorProps {
  layer: LiveLayer
  onPropertyChange: (id: string, prop: keyof GeoJsonProperties, value: string | number) => void
  onReset: () => void
}

function GeoJsonPropertyEditor({ layer, onPropertyChange, onReset }: GeoJsonPropertyEditorProps) {
  const p = layer.geoJsonProperties
  if (!p) return null

  return (
    <div style={propertyEditorStyle}>
      <LayerInfo layer={layer} />
      {/* Color picker */}
      <div style={sliderRowStyle}>
        <span style={sliderLabelStyle}>Color</span>
        <input
          type="color"
          value={p.strokeColor}
          onInput={(e) => onPropertyChange(layer.def.id, 'strokeColor', (e.target as HTMLInputElement).value)}
          style={colorPickerStyle}
          title={p.strokeColor}
        />
        <span style={{ ...sliderValueStyle, fontFamily: 'monospace', fontSize: 10 }}>
          {p.strokeColor}
        </span>
      </div>

      {/* Opacity */}
      <SliderRow
        label="Opacity"
        value={Math.round(p.alpha * 100)}
        min={0}
        max={100}
        onInput={(v) => onPropertyChange(layer.def.id, 'alpha', v / 100)}
      />

      {/* Stroke width */}
      <SliderRow
        label="Width"
        value={Math.round(p.strokeWidth * 10)}
        min={1}
        max={80}
        onInput={(v) => onPropertyChange(layer.def.id, 'strokeWidth', v / 10)}
        unit=""
        formatValue={(v) => `${(v / 10).toFixed(1)}px`}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onReset} style={resetBtnStyle}>
          Reset
        </button>
      </div>
    </div>
  )
}

// ── SliderRow ──

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  onInput: (v: number) => void
  unit?: string
  formatValue?: (v: number) => string
}

function SliderRow({ label, value, min, max, onInput, unit, formatValue }: SliderRowProps) {
  const display = formatValue ? formatValue(value) : `${value}${unit ?? '%'}`
  return (
    <div style={sliderRowStyle}>
      <span style={sliderLabelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onInput(parseInt((e.target as HTMLInputElement).value, 10))}
        style={sliderInputStyle}
      />
      <span style={sliderValueStyle}>{display}</span>
    </div>
  )
}

// ── BaseMapSelector ──

interface BaseMapSelectorProps {
  current: string
  styles: { id: string; name: string; description: string }[]
  onChange: (style: string) => void
}

function BaseMapSelector({ current, styles, onChange }: BaseMapSelectorProps) {
  return (
    <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted, rgba(255,255,255,0.3))',
        marginBottom: 6,
      }}>
        Base Map
      </span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        style={baseMapSelectStyle}
      >
        {styles.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.description}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Styles ──

const toggleBtnStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 60,
  left: 16,
  zIndex: 40,
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-panel, rgba(10,12,18,0.82))',
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  padding: 0,
  transition: 'border-color 0.2s ease',
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  width: 280,
  zIndex: 40,
  background: 'rgba(10, 12, 18, 0.92)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 16,
  borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
  flexShrink: 0,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
  fontSize: 20,
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
}

const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '8px 0',
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px 4px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  cursor: 'pointer',
  userSelect: 'none',
}

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
}

const layerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 12px',
  gap: 6,
  cursor: 'default',
}

const eyeStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  flexShrink: 0,
}

const miniSliderStyle: React.CSSProperties = {
  width: 50,
  height: 4,
  cursor: 'pointer',
  accentColor: 'var(--accent, #4FC3F7)',
  flexShrink: 0,
}

const expandChevronStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  cursor: 'pointer',
  flexShrink: 0,
}

const propertyEditorStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  padding: '8px 12px 12px 40px',
}

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 4,
}

const sliderLabelStyle: React.CSSProperties = {
  width: 52,
  fontSize: 11,
  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
  flexShrink: 0,
}

const sliderInputStyle: React.CSSProperties = {
  flex: 1,
  height: 4,
  cursor: 'pointer',
  accentColor: 'var(--accent, #4FC3F7)',
}

const sliderValueStyle: React.CSSProperties = {
  width: 36,
  fontSize: 11,
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  textAlign: 'right',
  flexShrink: 0,
}

const colorPickerStyle: React.CSSProperties = {
  width: 28,
  height: 20,
  padding: 0,
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 3,
  cursor: 'pointer',
  background: 'none',
  flexShrink: 0,
}

const resetBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
  fontSize: 11,
  padding: '2px 10px',
  cursor: 'pointer',
}

const dragHandleStyle: React.CSSProperties = {
  width: 14,
  fontSize: 10,
  color: 'var(--text-muted, rgba(255,255,255,0.2))',
  cursor: 'grab',
  flexShrink: 0,
  userSelect: 'none',
}

const baseMapSelectStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(15, 18, 25, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  fontSize: 12,
  padding: '5px 8px',
  color: 'var(--text, #e8eaed)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  outline: 'none',
  colorScheme: 'dark',
}

const removeBtnStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  cursor: 'pointer',
  flexShrink: 0,
  borderRadius: 4,
  lineHeight: 1,
}

const browseCatalogBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(79, 195, 247, 0.08)',
  border: '1px solid rgba(79, 195, 247, 0.2)',
  borderRadius: 6,
  color: 'var(--accent, #4FC3F7)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
}
