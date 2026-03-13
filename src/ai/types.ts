/**
 * Core types for the AI system.
 * Providers, commands, intents, and routing.
 */

// --- Provider types ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  /** Additional context docs injected via RAG */
  context?: string[]
}

export interface ClassifyResult {
  intent: string
  confidence: number
  params: Record<string, unknown>
}

export interface AIProvider {
  readonly name: string
  readonly tier: 'cloud' | 'local' | 'browser'
  available(): Promise<boolean>
  chat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>
  classify?(text: string, intents: CommandEntry[]): Promise<ClassifyResult | null>
}

// --- Command registry types ---

export interface CommandParam {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  required?: boolean
  description?: string
  /** For enum type */
  options?: string[]
  /** For number type */
  range?: [number, number]
  unit?: string
}

export interface CommandEntry {
  /** Unique identifier, e.g. "core:go-to" or "flood-sim:set-water-level" */
  id: string
  /** Human-readable name */
  name: string
  /** Which module owns this command */
  module: string
  /** Short description for autocomplete / help */
  description: string
  /** Example phrases that trigger this command */
  patterns: string[]
  /** Parameters this command accepts */
  params: CommandParam[]
  /** The function to execute */
  handler: (params: Record<string, unknown>) => void | Promise<void>
  /** Optional: command category for grouping in help */
  category?: 'navigation' | 'view' | 'data' | 'audio' | 'system' | 'feature'
}

// --- Router types ---

export type RoutingTier = 'pattern' | 'classify' | 'local-chat' | 'cloud-chat'

export interface RouteResult {
  tier: RoutingTier
  /** If matched a command, which one */
  command?: CommandEntry
  /** Extracted parameters */
  params?: Record<string, unknown>
  /** If routed to chat, the streamed response */
  response?: AsyncIterable<string>
}

// --- Chat panel types ---

export type PanelState = 'minimized' | 'peek' | 'full'

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** If this message triggered a command */
  command?: string
}
