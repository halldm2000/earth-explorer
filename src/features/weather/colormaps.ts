/**
 * Scientific colormaps for weather variables.
 *
 * Each colormap is a sorted array of (value, RGBA) stops.
 * Values between stops are linearly interpolated.
 * Inspired by matplotlib/viridis perceptual colormaps.
 */

import type { ColormapStop, VariableConfig, WeatherPoint } from './types'

// --- Temperature: cool blues through warm reds ---
const temperatureMap: ColormapStop[] = [
  { value: -40, color: [48,   18, 130, 220] },   // deep indigo
  { value: -20, color: [64,   67, 175, 220] },   // blue-purple
  { value: -10, color: [60,  136, 193, 220] },   // steel blue
  { value:   0, color: [72,  178, 197, 220] },   // cyan
  { value:  10, color: [117, 206, 149, 220] },   // green
  { value:  20, color: [199, 225,  95, 220] },   // yellow-green
  { value:  25, color: [245, 200,  60, 220] },   // warm yellow
  { value:  30, color: [245, 140,  40, 220] },   // orange
  { value:  35, color: [220,  60,  30, 220] },   // red
  { value:  45, color: [165,  15,  20, 220] },   // dark red
]

// --- Wind speed: calm greens through strong purples ---
const windMap: ColormapStop[] = [
  { value:  0, color: [200, 230, 200, 180] },   // pale green (calm)
  { value:  3, color: [120, 200, 120, 200] },   // light green
  { value:  6, color: [ 80, 180, 180, 210] },   // teal
  { value: 10, color: [ 60, 120, 200, 220] },   // blue
  { value: 15, color: [100,  60, 200, 230] },   // purple
  { value: 20, color: [180,  40, 160, 240] },   // magenta
  { value: 30, color: [220,  20,  60, 250] },   // crimson
]

// --- Precipitation: dry white through wet blues ---
const precipMap: ColormapStop[] = [
  { value:  0.0, color: [180, 180, 180, 120] },  // gray (dry)
  { value:  0.5, color: [160, 200, 230, 180] },  // light blue
  { value:  2.0, color: [100, 160, 220, 210] },  // medium blue
  { value:  5.0, color: [ 40, 100, 200, 230] },  // blue
  { value: 10.0, color: [ 20,  50, 170, 240] },  // deep blue
  { value: 20.0, color: [ 80,  20, 140, 250] },  // purple
]

// --- Humidity: dry tan through humid greens ---
const humidityMap: ColormapStop[] = [
  { value:   0, color: [200, 170, 120, 180] },  // tan (dry)
  { value:  30, color: [220, 200, 100, 200] },  // yellow
  { value:  50, color: [160, 210, 100, 210] },  // yellow-green
  { value:  70, color: [ 80, 190, 120, 220] },  // green
  { value:  90, color: [ 40, 140, 160, 230] },  // teal
  { value: 100, color: [ 30, 100, 180, 240] },  // blue
]

// --- Cloud cover: clear yellow through overcast gray ---
const cloudMap: ColormapStop[] = [
  { value:   0, color: [255, 220, 80, 140] },   // sunny yellow
  { value:  25, color: [220, 220, 180, 160] },  // hazy
  { value:  50, color: [190, 195, 200, 180] },  // partly cloudy
  { value:  75, color: [160, 165, 175, 200] },  // mostly cloudy
  { value: 100, color: [130, 135, 145, 220] },  // overcast
]

// --- Pressure: low red through high blue ---
const pressureMap: ColormapStop[] = [
  { value:  970, color: [200,  40,  40, 220] },  // deep low
  { value:  990, color: [230, 140,  40, 210] },  // low
  { value: 1000, color: [220, 210,  80, 200] },  // slightly low
  { value: 1013, color: [160, 220, 160, 200] },  // normal
  { value: 1025, color: [ 80, 160, 220, 210] },  // high
  { value: 1040, color: [ 40,  80, 180, 220] },  // deep high
]

/** All variable configurations */
export const VARIABLES: Record<string, VariableConfig> = {
  temperature: {
    label: 'Temperature',
    unit: '°C',
    colormap: temperatureMap,
    accessor: (p: WeatherPoint) => p.temperature,
  },
  wind: {
    label: 'Wind Speed',
    unit: 'm/s',
    colormap: windMap,
    accessor: (p: WeatherPoint) => p.windSpeed,
  },
  precipitation: {
    label: 'Precipitation',
    unit: 'mm',
    colormap: precipMap,
    accessor: (p: WeatherPoint) => p.precipitation,
  },
  humidity: {
    label: 'Humidity',
    unit: '%',
    colormap: humidityMap,
    accessor: (p: WeatherPoint) => p.humidity,
  },
  clouds: {
    label: 'Cloud Cover',
    unit: '%',
    colormap: cloudMap,
    accessor: (p: WeatherPoint) => p.cloudCover,
  },
  pressure: {
    label: 'Pressure',
    unit: 'hPa',
    colormap: pressureMap,
    accessor: (p: WeatherPoint) => p.pressure,
  },
}

/**
 * Interpolate a colormap at a given value.
 * Returns [r, g, b, a] with components 0-255.
 */
export function sampleColormap(stops: ColormapStop[], value: number): [number, number, number, number] {
  if (stops.length === 0) return [128, 128, 128, 200]
  if (value <= stops[0].value) return stops[0].color
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value)
      return [
        Math.round(a.color[0] + t * (b.color[0] - a.color[0])),
        Math.round(a.color[1] + t * (b.color[1] - a.color[1])),
        Math.round(a.color[2] + t * (b.color[2] - a.color[2])),
        Math.round(a.color[3] + t * (b.color[3] - a.color[3])),
      ]
    }
  }

  return stops[stops.length - 1].color
}
