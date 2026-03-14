/**
 * Weather feature commands.
 *
 * Registered with the AI command system so users can
 * control weather overlays with natural language.
 */

import type { CommandEntry } from '@/ai/types'
import type { WeatherVariable } from './types'
import { fetchWeatherGrid, DEFAULT_GRID, DENSE_GRID } from './api'
import {
  renderWeatherGrid,
  clearWeather,
  setVariable,
  isWeatherVisible,
  getCurrentVariable,
} from './renderer'
import { VARIABLES } from './colormaps'
import { playPing, playSuccess } from '@/audio/sounds'

const VALID_VARIABLES = Object.keys(VARIABLES) as WeatherVariable[]

const showWeather: CommandEntry = {
  id: 'weather:show',
  name: 'Show weather',
  module: 'weather',
  category: 'data',
  description: 'Show current weather conditions on the globe',
  patterns: [
    'show weather',
    'show temperature',
    'show wind',
    'show precipitation',
    'show humidity',
    'show clouds',
    'show pressure',
    'weather overlay',
    'weather on',
    'current weather',
    'show {variable} weather',
    'show weather {variable}',
  ],
  params: [
    {
      name: 'variable',
      type: 'enum',
      required: false,
      description: 'Weather variable to display',
      options: VALID_VARIABLES,
    },
  ],
  handler: async (params) => {
    // Parse which variable to show
    let variable: WeatherVariable = 'temperature'
    const raw = String(params.variable || '').toLowerCase().trim()

    if (raw && VALID_VARIABLES.includes(raw as WeatherVariable)) {
      variable = raw as WeatherVariable
    } else {
      // Try to infer from the full input pattern
      for (const v of VALID_VARIABLES) {
        if (raw.includes(v)) {
          variable = v
          break
        }
      }
      // Handle aliases
      if (raw.includes('temp')) variable = 'temperature'
      if (raw.includes('rain')) variable = 'precipitation'
      if (raw.includes('cloud')) variable = 'clouds'
    }

    // If already visible with different variable, just switch
    if (isWeatherVisible() && getCurrentVariable() !== variable) {
      setVariable(variable)
      playPing()
      console.log(`[weather] Switched to ${variable}`)
      return
    }

    // Fetch and render
    playPing()
    console.log(`[weather] Loading ${variable} data...`)

    try {
      const data = await fetchWeatherGrid(DEFAULT_GRID)
      renderWeatherGrid(data, variable, DEFAULT_GRID.step)
      playSuccess()
    } catch (err) {
      console.error('[weather] Failed to load weather data:', err)
    }
  },
}

const hideWeather: CommandEntry = {
  id: 'weather:hide',
  name: 'Hide weather',
  module: 'weather',
  category: 'data',
  description: 'Remove the weather overlay from the globe',
  patterns: [
    'hide weather',
    'weather off',
    'clear weather',
    'remove weather',
    'no weather',
  ],
  params: [],
  handler: () => {
    clearWeather()
    playPing()
  },
}

const switchVariable: CommandEntry = {
  id: 'weather:switch',
  name: 'Switch weather variable',
  module: 'weather',
  category: 'data',
  description: 'Change which weather variable is displayed',
  patterns: [
    'switch to {variable}',
    'show {variable}',
    'display {variable}',
    'change to {variable}',
  ],
  params: [
    {
      name: 'variable',
      type: 'enum',
      required: true,
      description: 'Weather variable to display',
      options: VALID_VARIABLES,
    },
  ],
  handler: (params) => {
    const raw = String(params.variable || '').toLowerCase().trim()

    let variable: WeatherVariable | null = null
    for (const v of VALID_VARIABLES) {
      if (raw.includes(v) || raw === v) {
        variable = v
        break
      }
    }
    // Aliases
    if (!variable && raw.includes('temp')) variable = 'temperature'
    if (!variable && raw.includes('rain')) variable = 'precipitation'
    if (!variable && raw.includes('cloud')) variable = 'clouds'

    if (!variable) {
      console.warn(`[weather] Unknown variable: ${raw}. Options: ${VALID_VARIABLES.join(', ')}`)
      return
    }

    if (!isWeatherVisible()) {
      console.log('[weather] No weather overlay active. Use "show weather" first.')
      return
    }

    setVariable(variable)
    playPing()
  },
}

const refreshWeather: CommandEntry = {
  id: 'weather:refresh',
  name: 'Refresh weather',
  module: 'weather',
  category: 'data',
  description: 'Refresh weather data from the API',
  patterns: [
    'refresh weather',
    'update weather',
    'reload weather',
  ],
  params: [],
  handler: async () => {
    if (!isWeatherVisible()) {
      console.log('[weather] No weather overlay active. Use "show weather" first.')
      return
    }

    playPing()
    console.log('[weather] Refreshing...')

    try {
      const data = await fetchWeatherGrid(DEFAULT_GRID)
      renderWeatherGrid(data, getCurrentVariable(), DEFAULT_GRID.step)
      playSuccess()
    } catch (err) {
      console.error('[weather] Refresh failed:', err)
    }
  },
}

/** All weather commands for registration */
export const weatherCommands: CommandEntry[] = [
  showWeather,
  hideWeather,
  switchVariable,
  refreshWeather,
]
