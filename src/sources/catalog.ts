/**
 * Source Catalog — global registry of data source configurations.
 *
 * Sources are cheap (just metadata + URL config) and never auto-removed.
 * Multiple layers can reference the same source by ID.
 */

import type { DataSource } from './types'

const _sources = new Map<string, DataSource>()

export function registerSource(source: DataSource): void {
  if (_sources.has(source.id)) {
    console.warn(`[sources] Duplicate source id: ${source.id} (skipping)`)
    return
  }
  _sources.set(source.id, source)
}

export function registerSources(sources: DataSource[]): void {
  for (const s of sources) registerSource(s)
}

export function getSource(id: string): DataSource | undefined {
  return _sources.get(id)
}

export function getAllSources(): DataSource[] {
  return Array.from(_sources.values())
}

export function getSourcesByType<T extends DataSource['type']>(type: T): Extract<DataSource, { type: T }>[] {
  return getAllSources().filter(s => s.type === type) as Extract<DataSource, { type: T }>[]
}

export function removeSource(id: string): boolean {
  return _sources.delete(id)
}
