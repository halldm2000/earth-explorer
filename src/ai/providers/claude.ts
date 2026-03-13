/**
 * Claude AI Provider
 *
 * Connects to the Anthropic API for cloud-based reasoning.
 * Supports streaming responses.
 */

import type { AIProvider, ChatMessage, ChatOptions, ClassifyResult, CommandEntry } from '../types'

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude'
  readonly tier = 'cloud' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async available(): Promise<boolean> {
    return !!this.apiKey && navigator.onLine
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const apiMessages = messages.map(m => ({
      role: m.role === 'system' ? 'user' as const : m.role,
      content: m.content,
    })).filter(m => m.role === 'user' || m.role === 'assistant')

    const body: Record<string, unknown> = {
      model: options?.model || 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens || 1024,
      stream: true,
      messages: apiMessages,
    }

    if (options?.systemPrompt) {
      body.system = options.systemPrompt
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      yield `Error: ${response.status} - ${err}`
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield 'Error: No response stream'
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process SSE lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return

          try {
            const event = JSON.parse(data)
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield event.delta.text
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  async classify(text: string, intents: CommandEntry[]): Promise<ClassifyResult | null> {
    // Could use Haiku for fast classification, but for now
    // we rely on Tier 0 pattern matching. This is here for
    // future Tier 1 implementation.
    return null
  }
}
