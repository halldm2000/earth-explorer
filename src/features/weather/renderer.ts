/**
 * Weather overlay renderer.
 *
 * Renders weather data as colored rectangles on the globe surface.
 * Each grid cell is a translucent colored rectangle whose color
 * is determined by the active variable's colormap.
 *
 * Uses Cesium Entity API for simplicity (not primitives), which
 * is fine for ~500 entities. For 10k+ we'd switch to primitives.
 */

import * as Cesium from 'cesium'
import { getViewer } from '@/scene/engine'
import type { WeatherPoint, WeatherVariable } from './types'
import { VARIABLES, sampleColormap } from './colormaps'

/** Manage all weather entities through a dedicated data source */
let dataSource: Cesium.CustomDataSource | null = null
let legendElement: HTMLDivElement | null = null
let currentData: WeatherPoint[] = []
let currentVariable: WeatherVariable = 'temperature'
let visible = false

/**
 * Get or create the weather data source.
 */
function getDataSource(): Cesium.CustomDataSource | null {
  const viewer = getViewer()
  if (!viewer) return null

  if (!dataSource) {
    dataSource = new Cesium.CustomDataSource('weather')
    viewer.dataSources.add(dataSource)
  }
  return dataSource
}

/** Add a single colored rectangle entity to the data source. */
function addRect(
  ds: Cesium.CustomDataSource,
  west: number, east: number,
  south: number, north: number,
  material: Cesium.ColorMaterialProperty,
): void {
  if (west >= east || south >= north) return
  ds.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
      material,
      height: 0,
      classificationType: Cesium.ClassificationType.BOTH,
    },
  })
}

/**
 * Render weather points on the globe.
 * Each point becomes a colored rectangle centered on its lat/lon.
 */
export function renderWeatherGrid(
  data: WeatherPoint[],
  variable: WeatherVariable = 'temperature',
  gridStep: number = 10,
): void {
  const ds = getDataSource()
  if (!ds) return

  currentData = data
  currentVariable = variable
  visible = true

  const config = VARIABLES[variable]
  if (!config) return

  // Clear previous entities
  ds.entities.removeAll()

  const halfStep = gridStep / 2

  for (const point of data) {
    const value = config.accessor(point)
    const [r, g, b, a] = sampleColormap(config.colormap, value)
    const color = new Cesium.ColorMaterialProperty(
      new Cesium.Color(r / 255, g / 255, b / 255, a / 255),
    )
    const south = Math.max(-90, point.lat - halfStep)
    const north = Math.min(90, point.lat + halfStep)
    if (south >= north) continue

    let west = point.lon - halfStep
    let east = point.lon + halfStep

    // Handle antimeridian wrap: split into two rectangles
    if (west < -180) {
      // Left piece wraps to the eastern side (e.g., -185 becomes 175)
      addRect(ds, west + 360, 180, south, north, color)
      west = -180
    }
    if (east > 180) {
      // Right piece wraps to the western side (e.g., 185 becomes -175)
      addRect(ds, -180, east - 360, south, north, color)
      east = 180
    }

    addRect(ds, west, east, south, north, color)
  }

  // Show the legend
  showLegend(variable)

  console.log(`[weather] Rendered ${data.length} grid cells for ${variable}`)
}

/**
 * Switch the displayed variable without refetching data.
 */
export function setVariable(variable: WeatherVariable): void {
  if (currentData.length === 0) return
  renderWeatherGrid(currentData, variable, inferGridStep(currentData))
}

/**
 * Remove all weather entities from the globe.
 */
export function clearWeather(): void {
  if (dataSource) {
    dataSource.entities.removeAll()
  }
  hideLegend()
  visible = false
  currentData = []
  console.log('[weather] Cleared')
}

/**
 * Check if the weather layer is currently visible.
 */
export function isWeatherVisible(): boolean {
  return visible && currentData.length > 0
}

/**
 * Get current state for AI context.
 */
export function getWeatherState(): { visible: boolean; variable: WeatherVariable; pointCount: number } {
  return { visible, variable: currentVariable, pointCount: currentData.length }
}

/**
 * Get the current variable.
 */
export function getCurrentVariable(): WeatherVariable {
  return currentVariable
}

// --- Legend overlay ---

function showLegend(variable: WeatherVariable): void {
  hideLegend()

  const config = VARIABLES[variable]
  if (!config) return

  const el = document.createElement('div')
  el.id = 'weather-legend'
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '40',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(10, 12, 18, 0.88)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    pointerEvents: 'none',
    animation: 'fadeIn 0.3s ease',
  })

  // Label
  const label = document.createElement('span')
  label.textContent = config.label
  label.style.fontWeight = '600'
  label.style.color = 'rgba(255,255,255,0.9)'
  el.appendChild(label)

  // Min value
  const minStop = config.colormap[0]
  const maxStop = config.colormap[config.colormap.length - 1]
  const minLabel = document.createElement('span')
  minLabel.textContent = `${minStop.value}${config.unit}`
  el.appendChild(minLabel)

  // Gradient bar
  const bar = document.createElement('div')
  const gradientStops = config.colormap.map(stop => {
    const pct = ((stop.value - minStop.value) / (maxStop.value - minStop.value)) * 100
    return `rgba(${stop.color[0]},${stop.color[1]},${stop.color[2]},0.9) ${pct}%`
  })
  Object.assign(bar.style, {
    width: '180px',
    height: '12px',
    borderRadius: '6px',
    background: `linear-gradient(to right, ${gradientStops.join(', ')})`,
    border: '1px solid rgba(255,255,255,0.1)',
  })
  el.appendChild(bar)

  // Max value
  const maxLabel = document.createElement('span')
  maxLabel.textContent = `${maxStop.value}${config.unit}`
  el.appendChild(maxLabel)

  document.body.appendChild(el)
  legendElement = el
}

function hideLegend(): void {
  if (legendElement) {
    legendElement.remove()
    legendElement = null
  }
}

// --- Utility ---

function inferGridStep(data: WeatherPoint[]): number {
  if (data.length < 2) return 10
  // Find the smallest lat difference between consecutive points
  const sorted = [...data].sort((a, b) => a.lat - b.lat || a.lon - b.lon)
  let minDiff = Infinity
  for (let i = 1; i < Math.min(sorted.length, 20); i++) {
    const diff = Math.abs(sorted[i].lon - sorted[i - 1].lon)
    if (diff > 0.5 && diff < minDiff) minDiff = diff
  }
  return minDiff === Infinity ? 10 : minDiff
}
