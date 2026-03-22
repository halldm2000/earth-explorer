/**
 * ExtensionCatalog: right-side drawer for browsing and managing extensions.
 *
 * Shows all registered extensions grouped by kind. Users can toggle
 * extensions on/off. Extension state persists to localStorage.
 *
 * Keyboard shortcut: press "x" to toggle the panel.
 */

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import {
  getExtensions,
  activateExtension,
  deactivateExtension,
  subscribeExtensions,
} from '@/extensions/registry'
import type { ExtensionEntry, ExtensionKind } from '@/extensions/types'

// ── Kind display config ──

const KIND_META: Record<ExtensionKind, { label: string; icon: string; order: number }> = {
  'app':              { label: 'Apps',              icon: '⚡', order: 0 },
  'data-pack':        { label: 'Data Packs',        icon: '📦', order: 1 },
  'capability':       { label: 'Capabilities',      icon: '🔧', order: 2 },
  'globe':            { label: 'Globes',             icon: '🌍', order: 3 },
  'ai-skill':         { label: 'AI Skills',          icon: '🧠', order: 4 },
  'ai-provider':      { label: 'AI Providers',       icon: '🤖', order: 5 },
  'compute-backend':  { label: 'Compute Backends',   icon: '🖥️', order: 6 },
  'theme':            { label: 'Themes',             icon: '🎨', order: 7 },
}

// ── Component ──

export function ExtensionCatalog() {
  const open = useStore(s => s.extensionPanelOpen)
  const togglePanel = useStore(s => s.toggleExtensionPanel)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')

  // Subscribe to extension registry changes
  useEffect(() => {
    return subscribeExtensions(() => setRevision(v => v + 1))
  }, [])

  // Keyboard shortcut: "x" toggles panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'x') togglePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePanel])

  const allExtensions = getExtensions()

  // Filter by search
  const filtered = search.trim()
    ? allExtensions.filter(e => {
        const q = search.toLowerCase()
        const ext = e.extension
        return (
          ext.name.toLowerCase().includes(q) ||
          ext.description.toLowerCase().includes(q) ||
          ext.id.toLowerCase().includes(q) ||
          ext.tags?.some(t => t.toLowerCase().includes(q))
        )
      })
    : allExtensions

  // Group by kind
  const grouped = new Map<ExtensionKind, ExtensionEntry[]>()
  for (const entry of filtered) {
    const kind = entry.extension.kind
    if (!grouped.has(kind)) grouped.set(kind, [])
    grouped.get(kind)!.push(entry)
  }

  // Sort groups by kind order
  const sortedGroups = [...grouped.entries()].sort(
    (a, b) => (KIND_META[a[0]]?.order ?? 99) - (KIND_META[b[0]]?.order ?? 99),
  )

  const handleToggle = useCallback(async (id: string, currentState: string) => {
    if (currentState === 'active') {
      deactivateExtension(id)
    } else {
      await activateExtension(id)
    }
  }, [])

  if (!open) return null

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Extensions</span>
          <span style={badgeStyle}>{allExtensions.length}</span>
        </div>
        <button onClick={togglePanel} style={closeBtnStyle}>✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <input
          type="text"
          placeholder="Search extensions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchStyle}
        />
      </div>

      {/* Extension list */}
      <div style={listStyle}>
        {sortedGroups.map(([kind, entries]) => (
          <div key={kind}>
            <div style={groupHeaderStyle}>
              <span>{KIND_META[kind]?.icon ?? '📎'}</span>
              <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {KIND_META[kind]?.label ?? kind}
              </span>
              <span style={{ ...badgeStyle, fontSize: 9 }}>{entries.length}</span>
            </div>

            {entries.map(entry => (
              <ExtensionRow
                key={entry.extension.id}
                entry={entry}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ))}

        {sortedGroups.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
            No extensions match "{search}"
          </div>
        )}
      </div>
    </div>
  )
}

// ── Extension row ──

function ExtensionRow({
  entry,
  onToggle,
}: {
  entry: ExtensionEntry
  onToggle: (id: string, state: string) => void
}) {
  const ext = entry.extension
  const isActive = entry.state === 'active'
  const isError = entry.state === 'error'
  const isDataPack = ext.kind === 'data-pack'

  return (
    <div style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? '#fff' : 'rgba(255,255,255,0.7)' }}>
            {ext.name}
          </span>
          {ext.version && (
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
              v{ext.version}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.3 }}>
          {ext.description}
        </div>
        {ext.tags && ext.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
            {ext.tags.slice(0, 4).map(tag => (
              <span key={tag} style={tagStyle}>{tag}</span>
            ))}
          </div>
        )}
        {isError && entry.error && (
          <div style={{ fontSize: 10, color: '#f44336', marginTop: 3 }}>
            Error: {entry.error}
          </div>
        )}
      </div>

      {/* Toggle switch — data packs are always on */}
      {!isDataPack && (
        <button
          onClick={() => onToggle(ext.id, entry.state)}
          style={{
            ...toggleStyle,
            background: isActive ? 'var(--accent, #4FC3F7)' : 'rgba(255,255,255,0.15)',
          }}
          title={isActive ? 'Deactivate' : 'Activate'}
        >
          <div
            style={{
              ...toggleKnobStyle,
              transform: isActive ? 'translateX(14px)' : 'translateX(0)',
            }}
          />
        </button>
      )}

      {isDataPack && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
          always on
        </span>
      )}
    </div>
  )
}

// ── Styles ──

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 10,
  right: 10,
  bottom: 80,
  width: 320,
  background: 'rgba(15, 18, 25, 0.92)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 200,
  color: '#fff',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 12px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 6px',
}

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'rgba(255,255,255,0.1)',
  padding: '1px 6px',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.5)',
}

const searchStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '4px 0',
}

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px 4px',
  color: 'rgba(255,255,255,0.6)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
}

const tagStyle: React.CSSProperties = {
  fontSize: 9,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(79, 195, 247, 0.12)',
  color: 'rgba(79, 195, 247, 0.7)',
}

const toggleStyle: React.CSSProperties = {
  width: 32,
  height: 18,
  borderRadius: 9,
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  flexShrink: 0,
  transition: 'background 0.2s',
  padding: 0,
}

const toggleKnobStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 7,
  background: '#fff',
  position: 'absolute',
  top: 2,
  left: 2,
  transition: 'transform 0.2s',
}
