/**
 * Extension System Types
 *
 * A single Extension interface replaces both WorldscopeApp and DataPack.
 * The `kind` field determines lifecycle behavior:
 *  - 'data-pack': static layers/commands, registered immediately, no lifecycle
 *  - 'app': has activate/deactivate lifecycle, dynamic resources
 *  - 'capability', 'globe', 'theme', etc.: use plugin.setup(api) for custom init
 *
 * Distribution tiers (all produce the same Extension object):
 *  - Tier 1: Bundled in source tree, discovered at build time via import.meta.glob
 *  - Tier 2: Runtime-loaded from URL via dynamic import() (future)
 *  - Tier 3: npm packages (future)
 */

import type { ComponentType, ReactNode } from 'react'
import type { CommandEntry, ContentBlock, AIProvider } from '@/ai/types'
import type { LayerDef } from '@/features/layers/types'
import type { DataSource } from '@/sources/types'
import type * as Cesium from 'cesium'

// ── Extension kinds ──

export type ExtensionKind =
  | 'app'              // Full lifecycle (activate/deactivate, commands, layers, UI)
  | 'data-pack'        // Layer bundle, always-on, no lifecycle
  | 'capability'       // File format reader, visual effect, data connector
  | 'globe'            // Alternate celestial body (Moon, Mars, Sun)
  | 'compute-backend'  // GPU/remote inference (DGX Spark, cloud, Ollama)
  | 'ai-provider'      // Chat/inference service (Claude, GPT, Ollama)
  | 'ai-skill'         // Knowledge/tool package for the AI assistant
  | 'theme'            // Visual theme (colormaps, effects, UI style)

// ── Resources returned by activate() ──

export interface ExtensionResources {
  commands?: CommandEntry[]
  layers?: LayerDef[]
  panel?: ComponentType
  welcome?: string
  toolbar?: ToolbarConfig
}

export interface ToolbarConfig {
  icon: ReactNode
  label: string
  isVisible?: () => boolean
  contextButtons?: Array<{
    id: string
    icon: ReactNode
    label: string
    onClick: () => void
  }>
}

// ── The API surface passed to extension activate() ──

export interface ExtensionAPI {
  readonly version: string

  layers: {
    register(def: LayerDef): void
    show(id: string): Promise<boolean>
    hide(id: string): boolean
    toggle(id: string): Promise<boolean>
    remove(id: string): void
    reload(id: string): Promise<boolean>
    getAll(): Array<{ id: string; name: string; visible: boolean; category: string }>
  }

  commands: {
    register(cmd: CommandEntry): void
    registerAll(cmds: CommandEntry[]): void
    unregisterModule(module: string): void
  }

  camera: {
    flyTo(lon: number, lat: number, height: number, duration?: number): void
    getPosition(): { lon: number; lat: number; height: number; heading: number }
    onMove(callback: (pos: { lon: number; lat: number; height: number }) => void): () => void
  }

  viz: {
    registerSource(source: DataSource): void
    registerSources(sources: DataSource[]): void
  }

  ui: {
    showStatus(text: string): void
    addChatMessage(role: 'assistant' | 'system', content: string): void
  }

  /** Per-frame tick callback. Returns unsubscribe function. */
  onTick(callback: (dt: number) => void): () => void

  /** Direct Cesium viewer access. Use for custom rendering not covered by the stable API. */
  unsafe: {
    getViewer(): Cesium.Viewer | null
  }
}

// ── The Extension interface ──

export interface Extension {
  // ── Identity ──
  id: string
  name: string
  kind: ExtensionKind
  version?: string
  description: string
  author?: string
  tags?: string[]

  // ── Lifecycle (for 'app' and other active kinds) ──
  autoActivate?: boolean
  activate?: (api: ExtensionAPI) => ExtensionResources | Promise<ExtensionResources>
  deactivate?: () => void

  // ── Static resources (for 'data-pack' — no activate needed) ──
  layers?: LayerDef[]
  commands?: CommandEntry[]
  sources?: DataSource[]
  /** Category for UI grouping */
  category?: string
  /** Welcome message shown on first interaction */
  welcome?: string

  // ── Dependencies ──
  dependencies?: string[]
  conflicts?: string[]

  // ── Compute requirements ──
  compute?: {
    gpu?: boolean
    backends?: string[]
    minVram?: number
  }

  // ── Kind-specific payloads (future phases) ──
  globe?: GlobeDef
  aiSkill?: AISkillDef
  computeBackend?: ComputeBackendDef
  aiProvider?: AIProviderFactory
}

// ── Globe definition (Phase 4) ──

export interface GlobeDef {
  id: string
  name: string
  radius: number
  terrainProvider?: () => Promise<Cesium.TerrainProvider>
  imageryProvider?: () => Cesium.ImageryProvider
  defaultView: { lon: number; lat: number; height: number }
  /** Extensions to activate when this globe is active */
  extensions?: string[]
  /** Features that don't apply to this body */
  disabledFeatures?: string[]
}

// ── AI skill definition (Phase 2) ──

export interface AISkillDef {
  commands?: CommandEntry[]
  /** System prompt fragments injected into AI context */
  systemPrompts?: string[]
  /** Knowledge base entries the AI can reference */
  knowledge?: Array<{ topic: string; content: string }>
}

// ── Compute backend definition (Phase 3) ──

export interface ComputeBackendDef {
  type: 'local-gpu' | 'remote-gpu' | 'cloud-api'
  probe(): Promise<{ available: boolean; info?: string }>
  submit(job: InferenceJob): Promise<InferenceResult>
  listModels?(): Promise<Array<{ id: string; name: string }>>
}

export interface InferenceJob {
  modelId: string
  inputs: Record<string, ArrayBuffer | number[] | string>
  parameters?: Record<string, unknown>
}

export interface InferenceResult {
  outputs: Record<string, ArrayBuffer | number[] | string>
  metadata?: Record<string, unknown>
  timing?: { queueMs: number; computeMs: number; totalMs: number }
}

// ── AI provider factory (Phase 5) ──

export type AIProviderFactory = () => AIProvider | Promise<AIProvider>

// ── Registry state ──

export type ExtensionState = 'registered' | 'active' | 'error'

export interface ExtensionEntry {
  extension: Extension
  state: ExtensionState
  resources?: ExtensionResources
  error?: string
}
