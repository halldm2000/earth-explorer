/**
 * Tile-cache wrapper for Cesium ImageryProviders.
 *
 * Monkey-patches `requestImage` on the given provider so that tile requests
 * check the shared LRU cache before hitting the network. Cached hits resolve
 * immediately as a fulfilled promise, making date-scrubbing on GIBS temporal
 * layers nearly instant for already-visited dates.
 *
 * In Cesium 1.126 ImageryProvider is not subclass-friendly, so we patch the
 * instance method in-place rather than extending the class.
 */

import { tileCache } from './tile-cache'

/**
 * Wrap a Cesium ImageryProvider to use the shared tile cache.
 *
 * Monkey-patches `requestImage` to check the cache before fetching.
 * The `cacheKeyPrefix` should uniquely identify the product and date,
 * e.g. `"VIIRS_SNPP:2026-03-15"`.
 */
export function wrapWithCache(
  provider: any, // Cesium.ImageryProvider — typed as any to avoid version-coupling
  cacheKeyPrefix: string,
): void {
  const originalRequestImage = provider.requestImage.bind(provider)

  provider.requestImage = function (
    x: number,
    y: number,
    level: number,
    request?: any,
  ) {
    const key = `${cacheKeyPrefix}:${level}:${x}:${y}`

    const cached = tileCache.get(key)
    if (cached) return Promise.resolve(cached)

    const result = originalRequestImage(x, y, level, request)
    if (result && typeof result.then === 'function') {
      return result.then((img: any) => {
        if (img) tileCache.set(key, img)
        return img
      })
    }
    return result
  }
}
