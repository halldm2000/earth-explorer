/**
 * Layer panel state slice for Zustand.
 * Manages panel visibility, property editor expansion, category collapse,
 * and a reactivity bridge so React re-renders when the layer manager mutates.
 */

import type { StateCreator } from 'zustand'

export interface LayerPanelSlice {
  // Panel visibility
  layerPanelOpen: boolean
  setLayerPanelOpen: (open: boolean) => void
  toggleLayerPanel: () => void

  // Which layer's property editor is expanded (null = none)
  expandedLayerId: string | null
  setExpandedLayerId: (id: string | null) => void

  // Category collapse state
  collapsedCategories: Set<string>
  toggleCategory: (category: string) => void

  // Reactivity bridge: bumped whenever layer state changes so React re-renders
  layerRevision: number
  bumpLayerRevision: () => void

  // Tile prefetch loading progress (0 = idle)
  prefetchLoading: number
  prefetchTotal: number
  setPrefetchProgress: (loading: number, total: number) => void
}

export const createLayerPanelSlice: StateCreator<LayerPanelSlice> = (set, get) => ({
  layerPanelOpen: false,
  setLayerPanelOpen: (open) => set({ layerPanelOpen: open }),
  toggleLayerPanel: () => set(s => ({ layerPanelOpen: !s.layerPanelOpen })),

  expandedLayerId: null,
  setExpandedLayerId: (id) => set({ expandedLayerId: id }),

  collapsedCategories: new Set<string>(),
  toggleCategory: (category) => set(s => {
    const next = new Set(s.collapsedCategories)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    return { collapsedCategories: next }
  }),

  layerRevision: 0,
  bumpLayerRevision: () => set(s => ({ layerRevision: s.layerRevision + 1 })),

  prefetchLoading: 0,
  prefetchTotal: 0,
  setPrefetchProgress: (loading, total) => set({ prefetchLoading: loading, prefetchTotal: total }),
})
