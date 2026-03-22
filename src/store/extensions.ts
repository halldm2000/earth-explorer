/**
 * Extension panel state slice for Zustand.
 * Manages extension catalog panel visibility and persisted extension preferences.
 */

import type { StateCreator } from 'zustand'

const STORAGE_KEY = 'worldscope-extension-prefs'

/** Persisted user preferences for extensions (survives reload). */
export interface ExtensionPrefs {
  /** Extensions the user has explicitly disabled (overrides autoActivate). */
  disabled: string[]
  /** Extensions the user has explicitly enabled (activate on load). */
  enabled: string[]
}

function loadPrefs(): ExtensionPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
        enabled: Array.isArray(parsed.enabled) ? parsed.enabled : [],
      }
    }
  } catch { /* ignore */ }
  return { disabled: [], enabled: [] }
}

function savePrefs(prefs: ExtensionPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* ignore */ }
}

export interface ExtensionPanelSlice {
  extensionPanelOpen: boolean
  setExtensionPanelOpen: (open: boolean) => void
  toggleExtensionPanel: () => void

  /** Persisted extension preferences */
  extensionPrefs: ExtensionPrefs
  /** Mark an extension as user-disabled (persists across sessions) */
  disableExtension: (id: string) => void
  /** Mark an extension as user-enabled (persists across sessions) */
  enableExtension: (id: string) => void
  /** Check if an extension has been user-disabled */
  isExtensionDisabled: (id: string) => boolean
}

export const createExtensionPanelSlice: StateCreator<ExtensionPanelSlice> = (set, get) => ({
  extensionPanelOpen: false,
  setExtensionPanelOpen: (open) => set({ extensionPanelOpen: open }),
  toggleExtensionPanel: () => set(s => ({ extensionPanelOpen: !s.extensionPanelOpen })),

  extensionPrefs: loadPrefs(),

  disableExtension: (id) => set(s => {
    const prefs: ExtensionPrefs = {
      disabled: [...new Set([...s.extensionPrefs.disabled, id])],
      enabled: s.extensionPrefs.enabled.filter(e => e !== id),
    }
    savePrefs(prefs)
    return { extensionPrefs: prefs }
  }),

  enableExtension: (id) => set(s => {
    const prefs: ExtensionPrefs = {
      disabled: s.extensionPrefs.disabled.filter(e => e !== id),
      enabled: [...new Set([...s.extensionPrefs.enabled, id])],
    }
    savePrefs(prefs)
    return { extensionPrefs: prefs }
  }),

  isExtensionDisabled: (id) => get().extensionPrefs.disabled.includes(id),
})
