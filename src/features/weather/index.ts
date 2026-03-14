/**
 * Weather feature module.
 *
 * Displays current weather conditions on the globe as a colored grid overlay.
 * Data comes from Open-Meteo (free, no API key required).
 *
 * Commands registered:
 *   "show weather" / "show temperature" / "show wind" etc.
 *   "hide weather"
 *   "switch to {variable}"
 *   "refresh weather"
 *
 * Available variables: temperature, wind, precipitation, humidity, clouds, pressure
 */

import { registry } from '@/ai/registry'
import { weatherCommands } from './commands'

let registered = false

/**
 * Initialize the weather feature.
 * Registers commands with the AI system.
 */
export function initWeather(): void {
  if (registered) return

  registry.registerAll(weatherCommands)
  registered = true

  console.log(`[weather] Feature initialized (${weatherCommands.length} commands registered)`)
}

/**
 * Tear down the weather feature.
 * Removes commands and clears any active overlays.
 */
export function destroyWeather(): void {
  if (!registered) return

  const { clearWeather } = require('./renderer')
  clearWeather()
  registry.unregisterModule('weather')
  registered = false

  console.log('[weather] Feature destroyed')
}

export { fetchWeatherGrid, fetchWeatherRegion } from './api'
export { renderWeatherGrid, clearWeather, setVariable, isWeatherVisible } from './renderer'
export { VARIABLES, sampleColormap } from './colormaps'
export type { WeatherVariable, WeatherPoint, VariableConfig } from './types'
