/**
 * AI system initialization.
 *
 * Registers core commands (the kernel) and loads all extensions via
 * auto-discovery. Extensions are found in features, packs, and
 * extensions directories (see extensions/loader.ts).
 */

import { registry } from './registry'
import { registerProvider, removeProvider } from './router'
import { coreCommands } from './core-commands'
import { queryCommands, installConsoleCapture } from './query-commands'
import { ClaudeProvider } from './providers/claude'
import { OpenAIProvider, createOpenAIProvider, createOllamaProvider, createOpenRouterProvider } from './providers/openai'
import { initLayers } from '@/features/layers'
import { startMcpBridge } from '@/mcp'
import { loadExtensions } from '@/extensions'
import { gibsCatalogCommands } from '@/data/gibs-catalog-commands'

let commandsRegistered = false

export function initAI(options?: { anthropicKey?: string | null }): void {
  // Register core commands once
  if (!commandsRegistered) {
    registry.registerAll(coreCommands)
    registry.registerAll(queryCommands)
    commandsRegistered = true

    // Initialize layer system (generic commands: toggle, list, hide-all)
    initLayers()

    // Register GIBS catalog commands (search/add/remove from 1,100+ products)
    registry.registerAll(gibsCatalogCommands)

    // Load all extensions via auto-discovery (apps, data packs, capabilities)
    loadExtensions()

    // Install console error/warning capture for MCP debugging
    if (typeof window !== 'undefined') {
      installConsoleCapture()
    }

    // Start MCP bridge (connects to MCP server if running)
    startMcpBridge()

    // Expose registry for console access (debugging, testing)
    if (typeof window !== 'undefined') {
      ;(window as any).__registry = registry
    }
  }

  // Auto-add provider from env / stored key
  if (options?.anthropicKey) {
    addProvider('anthropic', options.anthropicKey)
  }

  // Auto-detect Ollama (local models, works offline)
  detectOllama()

  console.log(`[AI] Initialized with ${registry.getAll().length} commands`)
}

/**
 * Add or replace an AI provider by type.
 * Called from the "set provider" command or at init time.
 */
export function addProvider(
  type: 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'custom',
  apiKey: string,
  options?: { model?: string; baseUrl?: string; preferred?: boolean },
): void {
  let provider

  switch (type) {
    case 'anthropic':
      provider = new ClaudeProvider(apiKey)
      break
    case 'openai':
      provider = createOpenAIProvider(apiKey, options?.model)
      break
    case 'ollama':
      provider = createOllamaProvider(options?.model, options?.baseUrl)
      break
    case 'openrouter':
      provider = createOpenRouterProvider(apiKey, options?.model)
      break
    case 'custom':
      provider = new OpenAIProvider({
        name: 'custom',
        baseUrl: options?.baseUrl || 'http://localhost:8000/v1',
        apiKey,
        defaultModel: options?.model || 'default',
      })
      break
  }

  registerProvider(provider, options?.preferred)
  console.log(`[AI] Provider added: ${provider.name}${options?.preferred ? ' (preferred)' : ''}`)
}

/**
 * Auto-detect Ollama running locally and register it as a provider.
 * Picks the first available model, preferring any previously selected one.
 */
async function detectOllama(): Promise<void> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return
    const data = await res.json()
    const models: { name: string }[] = data.models || []
    if (models.length === 0) return

    // Use saved model preference, or first available
    const saved = localStorage.getItem('ee-ollama-model')
    const model = models.find(m => m.name === saved)?.name
      || models.find(m => m.name.includes('nemotron'))?.name
      || models[0].name

    localStorage.setItem('ee-ollama-model', model)
    addProvider('ollama', '', { model })
    console.log(`[AI] Ollama auto-detected with model: ${model}`)
  } catch {
    // Ollama not running, that's fine
  }
}

// Re-export for use by the set-provider command
export { removeProvider }
