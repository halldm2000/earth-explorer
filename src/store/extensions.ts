/**
 * Extension panel state slice for Zustand.
 * Manages the extension catalog panel visibility.
 */

import type { StateCreator } from 'zustand'

export interface ExtensionPanelSlice {
  extensionPanelOpen: boolean
  setExtensionPanelOpen: (open: boolean) => void
  toggleExtensionPanel: () => void
}

export const createExtensionPanelSlice: StateCreator<ExtensionPanelSlice> = (set) => ({
  extensionPanelOpen: false,
  setExtensionPanelOpen: (open) => set({ extensionPanelOpen: open }),
  toggleExtensionPanel: () => set(s => ({ extensionPanelOpen: !s.extensionPanelOpen })),
})
