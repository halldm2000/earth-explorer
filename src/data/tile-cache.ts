/**
 * Shared LRU in-memory tile cache for imagery providers.
 *
 * Stores decoded tile images keyed by product:date:z:x:y so that scrubbing
 * dates on GIBS temporal layers can reuse already-fetched tiles without
 * hitting the network again. The cache is shared across all dates and layers.
 */

const DEFAULT_MAX_ENTRIES = 10_000 // ~500 MB at ~50 KB per tile

interface CacheEntry {
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  size: number // estimated bytes
}

class TileCache {
  private map = new Map<string, CacheEntry>()
  private maxEntries: number

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries
  }

  /** Look up a cached tile image. Promotes the entry to most-recently-used. */
  get(key: string): CacheEntry['image'] | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    // Move to end (most recently used)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.image
  }

  /** Insert a tile image. Evicts the oldest entry if over budget. */
  set(key: string, image: CacheEntry['image']): void {
    // If key already exists, remove it first so it moves to end
    if (this.map.has(key)) {
      this.map.delete(key)
    }
    // Evict oldest if over budget
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
      else break
    }
    this.map.set(key, { image, size: estimateSize(image) })
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this.map.size
  }

  /** Change the maximum entry count. Evicts oldest entries if the new limit is smaller. */
  setMaxEntries(max: number): void {
    this.maxEntries = max
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
      else break
    }
  }

  /** Drop all cached tiles. */
  clear(): void {
    this.map.clear()
  }
}

/** Estimate the in-memory byte size of a decoded image. */
function estimateSize(img: HTMLImageElement | HTMLCanvasElement | ImageBitmap): number {
  if ('width' in img && 'height' in img && img.width > 0 && img.height > 0) {
    return img.width * img.height * 4 // RGBA
  }
  return 50_000 // ~50 KB fallback
}

// ── Singleton shared cache ──

export const tileCache = new TileCache()

/** Adjust the tile cache size to match a quality preset's memory budget. */
export function setTileCacheBudget(preset: 'performance' | 'quality' | 'ultra'): void {
  const budgets: Record<string, number> = {
    performance: 5_000,
    quality: 10_000,
    ultra: 20_000,
  }
  tileCache.setMaxEntries(budgets[preset] ?? DEFAULT_MAX_ENTRIES)
  console.log(`[tile-cache] Budget set to ${budgets[preset] ?? DEFAULT_MAX_ENTRIES} entries (${preset})`)
}
