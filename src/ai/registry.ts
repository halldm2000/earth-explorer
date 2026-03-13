/**
 * Command Registry
 *
 * Single source of truth for "what can this app do right now."
 * Three layers: core (always available), feature (dynamic), user (macros).
 * Append/remove only. No central manifest.
 */

import type { CommandEntry } from './types'

class CommandRegistry {
  private commands = new Map<string, CommandEntry>()
  private listeners = new Set<() => void>()

  /** Register a command. Overwrites if ID already exists. */
  register(entry: CommandEntry): void {
    this.commands.set(entry.id, entry)
    this.notify()
  }

  /** Register multiple commands at once. */
  registerAll(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.commands.set(entry.id, entry)
    }
    this.notify()
  }

  /** Remove a command by ID. */
  unregister(id: string): void {
    this.commands.delete(id)
    this.notify()
  }

  /** Remove all commands from a specific module. */
  unregisterModule(module: string): void {
    for (const [id, entry] of this.commands) {
      if (entry.module === module) {
        this.commands.delete(id)
      }
    }
    this.notify()
  }

  /** Get a command by ID. */
  get(id: string): CommandEntry | undefined {
    return this.commands.get(id)
  }

  /** Get all registered commands. */
  getAll(): CommandEntry[] {
    return Array.from(this.commands.values())
  }

  /** Get commands filtered by module. */
  getByModule(module: string): CommandEntry[] {
    return this.getAll().filter(c => c.module === module)
  }

  /** Get commands filtered by category. */
  getByCategory(category: string): CommandEntry[] {
    return this.getAll().filter(c => c.category === category)
  }

  /** Search commands by query string (matches name, description, patterns). */
  search(query: string): CommandEntry[] {
    const q = query.toLowerCase().trim()
    if (!q) return this.getAll()

    return this.getAll().filter(cmd => {
      if (cmd.name.toLowerCase().includes(q)) return true
      if (cmd.description.toLowerCase().includes(q)) return true
      if (cmd.patterns.some(p => p.toLowerCase().includes(q))) return true
      return false
    })
  }

  /** Subscribe to registry changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** Singleton registry instance */
export const registry = new CommandRegistry()
