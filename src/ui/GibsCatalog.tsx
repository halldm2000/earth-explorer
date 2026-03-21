/**
 * GibsCatalog: modal overlay for browsing and adding NASA GIBS imagery layers.
 *
 * Features:
 * - Instant search across 1,123 GIBS products (title, instrument, group, id)
 * - Category filter pills (Atmosphere, Oceans, Land Surface, etc.)
 * - One-click add/remove layers to the globe
 * - Lazy-loads the catalog JSON on first open
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import {
  getGibsCatalog,
  getCategories,
  searchCatalog,
  type GibsCatalogEntry,
} from '@/data/gibs-catalog'
import { addGibsLayer, removeGibsLayer, isGibsLayerActive, zoomToResolution } from '@/data/gibs-layer-factory'

interface GibsCatalogProps {
  onClose: () => void
}

export function GibsCatalog({ onClose }: GibsCatalogProps) {
  const [catalog, setCatalog] = useState<GibsCatalogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const bumpLayerRevision = useStore(s => s.bumpLayerRevision)
  const _rev = useStore(s => s.layerRevision)
  void _rev // subscribe so we re-render when layers change
  const inputRef = useRef<HTMLInputElement>(null)

  // Load catalog on mount
  useEffect(() => {
    getGibsCatalog().then(data => {
      setCatalog(data)
      setLoading(false)
    })
  }, [])

  // Auto-focus search input
  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus()
    }
  }, [loading])

  // Derived data
  const categories = useMemo(() => catalog ? getCategories(catalog) : [], [catalog])

  const filtered = useMemo(() => {
    if (!catalog) return []
    let results = searchCatalog(catalog, query)
    if (selectedCategory) {
      results = results.filter(e => e.c === selectedCategory)
    }
    return results
  }, [catalog, query, selectedCategory])

  const handleAdd = useCallback(async (entry: GibsCatalogEntry) => {
    await addGibsLayer(entry)
    bumpLayerRevision()
  }, [bumpLayerRevision])

  const handleRemove = useCallback((entry: GibsCatalogEntry) => {
    removeGibsLayer(entry.id)
    bumpLayerRevision()
  }, [bumpLayerRevision])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text, #e8eaed)' }}>
                NASA GIBS Catalog
              </span>
              {catalog && (
                <span style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.3))' }}>
                  {filtered.length} of {catalog.length} products
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, rgba(255,255,255,0.45))', marginTop: 2 }}>
              Global imagery from NASA Worldview — satellite, climate, and Earth observation data
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Close">&times;</button>
        </div>

        {/* Search bar */}
        <div style={searchBarStyle}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search products..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={searchInputStyle}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={clearBtnStyle}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Category pills */}
        <div style={pillBarStyle}>
          <button
            onClick={() => setSelectedCategory(null)}
            style={{
              ...pillStyle,
              background: !selectedCategory ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.06)',
              color: !selectedCategory ? '#000' : 'var(--text-secondary, rgba(255,255,255,0.55))',
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              style={{
                ...pillStyle,
                background: selectedCategory === cat ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.06)',
                color: selectedCategory === cat ? '#000' : 'var(--text-secondary, rgba(255,255,255,0.55))',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={resultsStyle}>
          {loading && (
            <div style={emptyStyle}>Loading catalog...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={emptyStyle}>No products match your search.</div>
          )}
          {!loading && filtered.map(entry => (
            <CatalogRow
              key={entry.id}
              entry={entry}
              active={isGibsLayerActive(entry.id)}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── CatalogRow ──

interface CatalogRowProps {
  entry: GibsCatalogEntry
  active: boolean
  onAdd: (entry: GibsCatalogEntry) => void
  onRemove: (entry: GibsCatalogEntry) => void
}

function CatalogRow({ entry, active, onAdd, onRemove }: CatalogRowProps) {
  return (
    <div style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle}>{entry.t}</div>
        <div style={rowSubStyle}>
          {entry.s}
          {entry.g && <span style={rowGroupStyle}>{entry.g}</span>}
          {entry.p && <span style={rowPeriodStyle}>{entry.p}</span>}
          <span style={rowResStyle}>{zoomToResolution(entry.z)}</span>
        </div>
      </div>
      <button
        onClick={() => active ? onRemove(entry) : onAdd(entry)}
        style={{
          ...actionBtnStyle,
          background: active ? 'rgba(79, 195, 247, 0.15)' : 'rgba(255,255,255,0.06)',
          color: active ? 'var(--accent, #4FC3F7)' : 'var(--text-secondary, rgba(255,255,255,0.55))',
          borderColor: active ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255,255,255,0.08)',
        }}
        title={active ? 'Remove from globe' : 'Add to globe'}
      >
        {active ? '\u2713' : '+'}
      </button>
    </div>
  )
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

const modalStyle: React.CSSProperties = {
  width: 520,
  maxWidth: 'calc(100vw - 40px)',
  maxHeight: 'calc(100vh - 80px)',
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(10, 12, 18, 0.95)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
  fontSize: 22,
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
}

const searchBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  gap: 8,
  flexShrink: 0,
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text, #e8eaed)',
  outline: 'none',
  fontFamily: 'inherit',
}

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  fontSize: 18,
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
}

const pillBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  padding: '4px 16px 10px',
  flexShrink: 0,
}

const pillStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 11,
  padding: '3px 10px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s',
}

const resultsStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  borderTop: '1px solid rgba(255,255,255,0.06)',
}

const emptyStyle: React.CSSProperties = {
  padding: 24,
  textAlign: 'center',
  fontSize: 13,
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  gap: 10,
  borderBottom: '1px solid rgba(255,255,255,0.03)',
}

const rowTitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text, #e8eaed)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted, rgba(255,255,255,0.3))',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  marginTop: 2,
  overflow: 'hidden',
}

const rowGroupStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 4,
  padding: '0 5px',
  fontSize: 10,
}

const rowPeriodStyle: React.CSSProperties = {
  background: 'rgba(79, 195, 247, 0.1)',
  color: 'rgba(79, 195, 247, 0.6)',
  borderRadius: 4,
  padding: '0 5px',
  fontSize: 10,
}

const rowResStyle: React.CSSProperties = {
  background: 'rgba(255, 180, 50, 0.1)',
  color: 'rgba(255, 180, 50, 0.6)',
  borderRadius: 4,
  padding: '0 5px',
  fontSize: 10,
  whiteSpace: 'nowrap',
}

const actionBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
  flexShrink: 0,
  fontWeight: 600,
  fontFamily: 'inherit',
  lineHeight: 1,
}
