/**
 * Chat state slice for Zustand.
 * Manages messages, panel state, and AI configuration.
 */

import type { StateCreator } from 'zustand'
import type { PanelState, ChatEntry } from '@/ai/types'

export interface ChatSlice {
  // Panel
  panelState: PanelState
  setPanelState: (state: PanelState) => void
  cyclePanelState: () => void

  // Messages
  messages: ChatEntry[]
  addMessage: (entry: Omit<ChatEntry, 'id' | 'timestamp'>) => void
  updateLastAssistant: (content: string, isError?: boolean) => void
  clearMessages: () => void

  // Input
  inputValue: string
  setInputValue: (value: string) => void

  // Status line (ephemeral, fades out)
  statusText: string | null
  setStatusText: (text: string | null) => void

  // Processing state
  isProcessing: boolean
  setIsProcessing: (v: boolean) => void

  // AI config
  anthropicKey: string | null
  setAnthropicKey: (key: string | null) => void
}

let msgCounter = 0

export const createChatSlice: StateCreator<ChatSlice> = (set, get) => ({
  panelState: 'minimized',
  setPanelState: (state) => set({ panelState: state }),
  cyclePanelState: () => {
    const order: PanelState[] = ['minimized', 'peek', 'full']
    const current = get().panelState
    const idx = order.indexOf(current)
    set({ panelState: order[(idx + 1) % order.length] })
  },

  messages: [],
  addMessage: (entry) => {
    const id = `msg-${++msgCounter}-${Date.now()}`
    set(s => ({
      messages: [...s.messages, { ...entry, id, timestamp: Date.now() }],
    }))
  },
  updateLastAssistant: (content, isError) => {
    set(s => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content, ...(isError !== undefined ? { isError } : {}) }
          break
        }
      }
      return { messages: msgs }
    })
  },
  clearMessages: () => set({ messages: [] }),

  inputValue: '',
  setInputValue: (value) => set({ inputValue: value }),

  statusText: null,
  setStatusText: (text) => set({ statusText: text }),

  isProcessing: false,
  setIsProcessing: (v) => set({ isProcessing: v }),

  anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY || localStorage.getItem('ee-anthropic-key'),
  setAnthropicKey: (key) => {
    if (key) {
      localStorage.setItem('ee-anthropic-key', key)
    } else {
      localStorage.removeItem('ee-anthropic-key')
    }
    set({ anthropicKey: key })
  },
})
