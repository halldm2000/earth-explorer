/**
 * API error parsing and friendly message generation.
 *
 * Translates raw API error responses into short, actionable
 * messages for the chat panel. No raw JSON dumped to users.
 */

interface ParsedError {
  /** Short user-facing message */
  message: string
  /** Whether this is recoverable (e.g. retry might work) */
  recoverable: boolean
}

/**
 * Parse an HTTP error response into a friendly message.
 * Works for Anthropic, OpenAI, and compatible APIs.
 */
export function parseAPIError(status: number, body: string, providerName: string): ParsedError {
  // Try to extract a structured error message
  let errorType = ''
  let errorMessage = ''

  try {
    const json = JSON.parse(body)
    // Anthropic format: { error: { type, message } }
    if (json.error?.message) {
      errorType = json.error.type || ''
      errorMessage = json.error.message
    }
    // OpenAI format: { error: { message, type, code } }
    else if (json.message) {
      errorMessage = json.message
      errorType = json.type || json.code || ''
    }
  } catch {
    // Not JSON, use raw body (truncated)
    errorMessage = body.slice(0, 200)
  }

  // Match known error patterns to friendly messages
  const lower = errorMessage.toLowerCase()

  // Credit / billing issues
  if (lower.includes('credit balance') || lower.includes('insufficient_quota') || lower.includes('billing')) {
    return {
      message: `Your ${providerName} API credits are empty or not yet active. Check your billing at the provider's console.`,
      recoverable: false,
    }
  }

  // Invalid API key
  if (status === 401 || lower.includes('invalid.*api.*key') || lower.includes('authentication') || errorType === 'authentication_error') {
    return {
      message: `Invalid ${providerName} API key. Use "set provider ${providerName} <key>" to update it.`,
      recoverable: false,
    }
  }

  // Rate limiting
  if (status === 429 || errorType === 'rate_limit_error') {
    return {
      message: `Rate limited by ${providerName}. Wait a moment and try again.`,
      recoverable: true,
    }
  }

  // Model not found
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist'))) {
    return {
      message: `Model not available. The requested model may not exist or may not be accessible with your plan.`,
      recoverable: false,
    }
  }

  // Overloaded
  if (status === 529 || lower.includes('overloaded')) {
    return {
      message: `${providerName} is currently overloaded. Try again in a few seconds.`,
      recoverable: true,
    }
  }

  // Server error
  if (status >= 500) {
    return {
      message: `${providerName} server error (${status}). This is on their end, try again shortly.`,
      recoverable: true,
    }
  }

  // Connection refused (Ollama not running)
  if (lower.includes('econnrefused') || lower.includes('failed to fetch') || lower.includes('network')) {
    return {
      message: `Can't reach ${providerName}. ${providerName === 'ollama' ? 'Is Ollama running? Start it with "ollama serve".' : 'Check your internet connection.'}`,
      recoverable: true,
    }
  }

  // Generic fallback (still friendly, not raw JSON)
  return {
    message: `${providerName} error: ${errorMessage.slice(0, 120) || `HTTP ${status}`}`,
    recoverable: status < 500,
  }
}

/**
 * Parse a network/fetch error (no response received).
 */
export function parseNetworkError(err: unknown, providerName: string): ParsedError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('econnrefused')) {
    if (providerName === 'ollama') {
      return {
        message: `Can't connect to Ollama. Is it running? Start it with "ollama serve".`,
        recoverable: true,
      }
    }
    return {
      message: `Network error: can't reach ${providerName}. Check your connection.`,
      recoverable: true,
    }
  }

  if (lower.includes('abort') || lower.includes('timeout')) {
    return {
      message: `Request to ${providerName} timed out. Try again.`,
      recoverable: true,
    }
  }

  return {
    message: `Error connecting to ${providerName}: ${message.slice(0, 100)}`,
    recoverable: false,
  }
}
