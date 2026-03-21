/**
 * Toolbar: unified left-side button bar.
 *
 * Renders grouped button clusters in a vertical stack above the status bar.
 * Groups are visually separated by a thin divider line. Apps add/remove
 * groups dynamically via conditional rendering in App.tsx.
 */

import type { ReactNode } from 'react'

// ── Types ──

export interface ToolbarButton {
  id: string
  icon: ReactNode        // emoji, SVG, or component
  label: string          // tooltip
  active: boolean        // accent border + full opacity
  onClick: () => void
}

export interface ToolbarGroup {
  id: string             // e.g. 'scene', 'layers', 'hurricane'
  buttons: ToolbarButton[]
}

// ── Component ──

export function Toolbar({ groups }: { groups: ToolbarGroup[] }) {
  return (
    <div style={toolbarStyle}>
      {groups.map((group, gi) => (
        <div key={group.id} style={groupStyle}>
          {/* Divider between groups (not before the first) */}
          {gi > 0 && <div style={dividerStyle} />}
          {group.buttons.map(btn => (
            <button
              key={btn.id}
              onClick={btn.onClick}
              title={`${btn.label}: ${btn.active ? 'On' : 'Off'}`}
              style={{
                ...btnStyle,
                borderColor: btn.active
                  ? 'var(--accent, #4FC3F7)'
                  : 'var(--border, rgba(255,255,255,0.08))',
                background: btn.active
                  ? 'rgba(20, 25, 35, 0.85)'
                  : 'rgba(25, 30, 40, 0.7)',
              }}
            >
              <span style={iconStyle}>
                {btn.icon}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Styles ──

const toolbarStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 52,
  left: 16,
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: 6,
  zIndex: 40,
  alignItems: 'center',
}

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'center',
}

const dividerStyle: React.CSSProperties = {
  width: 22,
  height: 1,
  background: 'rgba(255,255,255,0.25)',
}

const btnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  backdropFilter: 'blur(var(--blur))',
  border: '1px solid var(--border, rgba(255,255,255,0.06))',
  borderRadius: 'var(--radius-sm, 8px)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  color: 'var(--text-secondary)',
}

const iconStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
}
