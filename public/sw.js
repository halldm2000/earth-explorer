const CACHE_NAME = 'worldscope-tiles-v1'
const MAX_CACHE_ENTRIES = 15000  // ~750MB at ~50KB per tile
const TTL_MS = 48 * 60 * 60 * 1000  // 48 hours
const BASEMAP_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days (basemaps change rarely)

/** Hosts whose tile requests we cache */
const CACHEABLE_HOSTS = [
  'gibs.earthdata.nasa.gov',     // NASA GIBS temporal imagery
  'basemaps.cartocdn.com',       // CartoDB Dark, Light, Voyager
  'tile.opentopomap.org',        // OpenTopoMap
  'tiles.openseamap.org',        // OpenSeaMap
]

function isCacheable(url) {
  return CACHEABLE_HOSTS.some(host => url.includes(host))
}

function getTTL(url) {
  // Base map tiles change rarely — cache longer
  if (url.includes('cartocdn.com') || url.includes('opentopomap.org') || url.includes('openseamap.org')) {
    return BASEMAP_TTL_MS
  }
  return TTL_MS
}

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  if (!isCacheable(event.request.url)) return
  event.respondWith(handleCachedRequest(event.request))
})

async function handleCachedRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  const ttl = getTTL(request.url)

  // Try cache first
  const cached = await cache.match(request)
  if (cached) {
    const cachedAt = cached.headers.get('x-cached-at')
    if (cachedAt && Date.now() - Number(cachedAt) < ttl) {
      return cached
    }
  }

  // Fetch from network
  try {
    const response = await fetch(request)
    if (response.ok) {
      // Clone and add timestamp header
      const headers = new Headers(response.headers)
      headers.set('x-cached-at', String(Date.now()))
      const cachedResponse = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers
      })
      await cache.put(request, cachedResponse)

      // Evict old entries if over budget
      evictIfNeeded(cache)
    }
    return response
  } catch (err) {
    // Network error — serve stale cache if available
    if (cached) return cached
    throw err
  }
}

async function evictIfNeeded(cache) {
  const keys = await cache.keys()
  if (keys.length <= MAX_CACHE_ENTRIES) return

  // Delete oldest entries (first in list)
  const toDelete = keys.length - MAX_CACHE_ENTRIES + 100  // delete 100 extra for headroom
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i])
  }
}
