/**
 * AI system initialization.
 * Registers core commands and sets up providers.
 */

import { registry } from './registry'
import { registerProvider } from './router'
import { coreCommands } from './core-commands'
import { ClaudeProvider } from './providers/claude'

let initialized = false

export function initAI(options?: { anthropicKey?: string | null }): void {
  if (initialized) return
  initialized = true

  // Register core commands
  registry.registerAll(coreCommands)

  // Set up Claude provider if API key is available
  if (options?.anthropicKey) {
    registerProvider(new ClaudeProvider(options.anthropicKey))
  }

  console.log(
    `[AI] Initialized with ${registry.getAll().length} commands` +
    (options?.anthropicKey ? ', Claude provider active' : ', no cloud provider')
  )
}

/**
 * Hot-add a Claude provider (e.g. after user enters API key).
 */
export function addClaudeProvider(apiKey: string): void {
  registerProvider(new ClaudeProvider(apiKey))
  console.log('[AI] Claude provider added')
}
