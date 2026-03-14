/**
 * Open-Meteo API client.
 *
 * Fetches current weather conditions for a grid of lat/lon points.
 * Free API, no key required. Rate limit is generous (~10k/day).
 * Docs: https://open-meteo.com/en/docs
 */

import type { WeatherPoint, WeatherGridConfig } from './types'

/** Default global grid: 10-degree spacing, avoiding poles */
export const DEFAULT_GRID: WeatherGridConfig = {
  latRange: [-60, 70],
  lonRange: [-180, 180],
  step: 10,
}

/** Dense grid for zoomed-in views (5-degree spacing) */
export const DENSE_GRID: WeatherGridConfig = {
  latRange: [-60, 70],
  lonRange: [-180, 180],
  step: 5,
}

/**
 * Generate grid points from a config.
 */
function generateGridPoints(config: WeatherGridConfig): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = []
  for (let lat = config.latRange[0]; lat <= config.latRange[1]; lat += config.step) {
    for (let lon = config.lonRange[0]; lon < config.lonRange[1]; lon += config.step) {
      points.push({ lat, lon })
    }
  }
  return points
}

/**
 * Fetch current weather for a batch of coordinates.
 * Open-Meteo supports up to ~100 locations per request.
 */
async function fetchBatch(points: { lat: number; lon: number }[]): Promise<WeatherPoint[]> {
  const lats = points.map(p => p.lat).join(',')
  const lons = points.map(p => p.lon).join(',')

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code&wind_speed_unit=ms`

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Open-Meteo API error: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()

  // Single location returns an object; multiple returns an array
  const results = Array.isArray(data) ? data : [data]

  return results.map((item: any, i: number) => ({
    lat: points[i].lat,
    lon: points[i].lon,
    temperature: item.current?.temperature_2m ?? 0,
    windSpeed: item.current?.wind_speed_10m ?? 0,
    windDirection: item.current?.wind_direction_10m ?? 0,
    precipitation: item.current?.precipitation ?? 0,
    humidity: item.current?.relative_humidity_2m ?? 0,
    pressure: item.current?.surface_pressure ?? 1013,
    cloudCover: item.current?.cloud_cover ?? 0,
    weatherCode: item.current?.weather_code ?? 0,
  }))
}

/**
 * Fetch weather for an entire grid, batching requests as needed.
 * Open-Meteo handles comma-separated coords but large grids need splitting.
 */
export async function fetchWeatherGrid(config: WeatherGridConfig = DEFAULT_GRID): Promise<WeatherPoint[]> {
  const points = generateGridPoints(config)
  console.log(`[weather] Fetching ${points.length} grid points (${config.step}° spacing)`)

  const BATCH_SIZE = 50
  const allResults: WeatherPoint[] = []

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE)
    try {
      const results = await fetchBatch(batch)
      allResults.push(...results)
    } catch (err) {
      console.warn(`[weather] Batch ${i / BATCH_SIZE} failed:`, err)
      // Continue with other batches
    }

    // Small delay between batches to be polite to the API
    if (i + BATCH_SIZE < points.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log(`[weather] Received ${allResults.length} weather points`)
  return allResults
}

/**
 * Fetch weather for a specific region (used when zoomed in).
 */
export async function fetchWeatherRegion(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  step: number = 2,
): Promise<WeatherPoint[]> {
  return fetchWeatherGrid({
    latRange: [Math.max(-60, latMin), Math.min(70, latMax)],
    lonRange: [Math.max(-180, lonMin), Math.min(180, lonMax)],
    step,
  })
}
