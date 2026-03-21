/**
 * SearchBar: top-center geocoding search overlay.
 *
 * Uses Cesium IonGeocoderService to search for places.
 * Debounced input (300ms) shows a dropdown of results.
 * Keyboard: Ctrl+K to focus, Escape to close, Arrow keys to navigate, Enter to select.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import * as Cesium from 'cesium'
import { getViewer, stopOrbit } from '@/scene/engine'

// ── Types ──

interface GeoResult {
  displayName: string
  destination: Cesium.Rectangle | Cesium.Cartesian3
}

// ── Component ──

export function SearchBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const geocoderRef = useRef<Cesium.IonGeocoderService | null>(null)

  // ── Lazily create geocoder service when viewer is available ──
  const getGeocoder = useCallback((): Cesium.IonGeocoderService | null => {
    if (geocoderRef.current) return geocoderRef.current
    const viewer = getViewer()
    if (!viewer) return null
    geocoderRef.current = new Cesium.IonGeocoderService({ scene: viewer.scene })
    return geocoderRef.current
  }, [])

  // ── Keyboard shortcut: Ctrl+K to focus ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Debounced geocoding via Cesium IonGeocoderService ──
  const geocode = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const service = getGeocoder()
    if (!service) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await service.geocode(text, Cesium.GeocodeType.SEARCH)
      const mapped: GeoResult[] = response.map((r: any) => ({
        displayName: r.displayName,
        destination: r.destination,
      }))
      setResults(mapped)
      setSelectedIndex(-1)
    } catch (err) {
      console.warn('[SearchBar] Geocode error:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [getGeocoder])

  // ── Input change with debounce ──
  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => geocode(value), 300)
  }, [geocode])

  // ── Fly to a selected result ──
  const flyTo = useCallback((result: GeoResult) => {
    const viewer = getViewer()
    if (!viewer) return

    stopOrbit()
    viewer.camera.flyTo({
      destination: result.destination,
      duration: 2.0,
    })

    console.log(`[SearchBar] Flying to: ${result.displayName}`)

    // Close the search
    setOpen(false)
    setQuery('')
    setResults([])
    inputRef.current?.blur()
  }, [])

  // ── Keyboard navigation within results ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
      setResults([])
      inputRef.current?.blur()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        flyTo(results[selectedIndex])
      } else if (results.length > 0) {
        flyTo(results[0])
      }
      return
    }
  }, [results, selectedIndex, flyTo])

  // ── Close on outside click ──
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setResults([])
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // ── Truncate display name for cleaner results ──
  function formatName(name: string): { primary: string; secondary: string } {
    const parts = name.split(', ')
    if (parts.length <= 1) return { primary: name, secondary: '' }
    const primary = parts[0]
    const secondary = parts.slice(1, 3).join(', ')
    return { primary, secondary }
  }

  const showDropdown = open && (results.length > 0 || loading)

  return (
    <div ref={containerRef} style={wrapperStyle}>
      {/* Search pill / expanded input */}
      <div
        style={{
          ...barStyle,
          width: open ? 420 : 180,
          borderColor: open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
          borderBottomLeftRadius: showDropdown ? 0 : 8,
          borderBottomRightRadius: showDropdown ? 0 : 8,
        }}
        onClick={() => {
          if (!open) {
            setOpen(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }
        }}
      >
        {/* Magnifying glass icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a place..."
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <span style={placeholderStyle}>Search...</span>
        )}

        {/* Keyboard hint */}
        {!open && (
          <span style={kbdStyle}>
            {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}K
          </span>
        )}

        {/* Loading spinner */}
        {loading && open && (
          <div style={spinnerStyle}>
            <div style={spinnerInnerStyle} />
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div style={dropdownStyle}>
          {results.map((r, i) => {
            const { primary, secondary } = formatName(r.displayName)
            const isSelected = i === selectedIndex

            return (
              <div
                key={`${r.displayName}-${i}`}
                style={{
                  ...resultItemStyle,
                  background: isSelected ? 'rgba(79, 195, 247, 0.12)' : 'transparent',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  flyTo(r)
                }}
              >
                {/* Pin icon */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isSelected ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.3)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, marginTop: 2 }}
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: isSelected ? 'var(--text, #e8eaed)' : 'rgba(255,255,255,0.8)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {primary}
                  </div>
                  {secondary && (
                    <div style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.35)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {secondary}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {loading && results.length === 0 && (
            <div style={{
              padding: '12px 14px',
              fontSize: 13,
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'center',
            }}>
              Searching...
            </div>
          )}
        </div>
      )}

      {/* Inline style for spinner animation */}
      <style>{`
        @keyframes searchSpin {
          to { transform: rotate(360deg) }
        }
      `}</style>
    </div>
  )
}

// ── Styles ──

const wrapperStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 45,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  cursor: 'text',
  transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s ease',
  maxWidth: 'calc(100vw - 32px)',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: 320,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 14,
  fontFamily: 'inherit',
  caretColor: 'var(--accent, #4FC3F7)',
  minWidth: 0,
}

const placeholderStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: 'rgba(255,255,255,0.3)',
  userSelect: 'none',
}

const kbdStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: 'rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.06)',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: '-apple-system, BlinkMacSystemFont, monospace',
  flexShrink: 0,
  letterSpacing: 0.5,
}

const spinnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
}

const spinnerInnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: 'var(--accent, #4FC3F7)',
  borderRadius: '50%',
  animation: 'searchSpin 0.7s linear infinite',
}

const dropdownStyle: React.CSSProperties = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 300,
  overflowY: 'auto',
  background: 'rgba(10, 12, 18, 0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderTop: 'none',
  borderBottomLeftRadius: 8,
  borderBottomRightRadius: 8,
}

const resultItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  transition: 'background 0.1s ease',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}
