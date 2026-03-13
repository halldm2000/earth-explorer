import { create } from 'zustand'
import { createChatSlice, type ChatSlice } from './chat'

export interface AppState extends ChatSlice {
  cesiumToken: string | null
  googleMapsKey: string | null
  setTokens: (cesium: string, google?: string) => void
}

export const useStore = create<AppState>((set, get, store) => ({
  // App tokens
  cesiumToken: import.meta.env.VITE_CESIUM_ION_TOKEN || null,
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || null,
  setTokens: (cesium, google) => set({ cesiumToken: cesium, googleMapsKey: google || null }),

  // Chat slice
  ...createChatSlice(set, get, store),
}))
