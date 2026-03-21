/**
 * Quality preset state slice for Zustand.
 * Controls GPU visual effects: shadows, bloom, AO, FXAA, resolution scaling.
 */

import type { StateCreator } from 'zustand'

export type QualityPreset = 'performance' | 'quality' | 'ultra'

export interface QualitySlice {
  qualityPreset: QualityPreset
  setQualityPreset: (preset: QualityPreset) => void
  cycleQualityPreset: () => void
}

const CYCLE_ORDER: QualityPreset[] = ['performance', 'quality', 'ultra']

function getInitialPreset(): QualityPreset {
  try {
    const saved = localStorage.getItem('worldscope_quality_preset')
    if (saved && CYCLE_ORDER.includes(saved as QualityPreset)) return saved as QualityPreset
  } catch {}
  return 'quality'
}

export const createQualitySlice: StateCreator<QualitySlice, [], [], QualitySlice> = (set, get) => ({
  qualityPreset: getInitialPreset(),

  setQualityPreset: (preset) => {
    try { localStorage.setItem('worldscope_quality_preset', preset) } catch {}
    set({ qualityPreset: preset })
  },

  cycleQualityPreset: () => {
    const current = get().qualityPreset
    const idx = CYCLE_ORDER.indexOf(current)
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
    get().setQualityPreset(next)
  },
})
