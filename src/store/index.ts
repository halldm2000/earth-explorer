import { create } from 'zustand'

export interface AppState {
  cesiumToken: string | null
  googleMapsKey: string | null
  setTokens: (cesium: string, google?: string) => void
}

export const useStore = create<AppState>((set) => ({
  cesiumToken: import.meta.env.VITE_CESIUM_ION_TOKEN || null,
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || null,
  setTokens: (cesium, google) => set({ cesiumToken: cesium, googleMapsKey: google || null }),
}))
