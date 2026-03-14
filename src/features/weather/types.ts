/**
 * Types for the weather feature module.
 */

export type WeatherVariable = 'temperature' | 'wind' | 'precipitation' | 'humidity' | 'pressure' | 'clouds'

export interface WeatherPoint {
  lat: number
  lon: number
  temperature: number      // °C
  windSpeed: number        // m/s
  windDirection: number    // degrees
  precipitation: number    // mm
  humidity: number         // %
  pressure: number         // hPa
  cloudCover: number       // %
  weatherCode: number      // WMO weather code
}

export interface WeatherGridConfig {
  /** Latitude range */
  latRange: [number, number]
  /** Longitude range */
  lonRange: [number, number]
  /** Grid spacing in degrees */
  step: number
}

export interface ColormapStop {
  value: number
  color: [number, number, number, number]  // RGBA 0-255
}

export interface VariableConfig {
  label: string
  unit: string
  colormap: ColormapStop[]
  /** Extract this variable's value from a WeatherPoint */
  accessor: (p: WeatherPoint) => number
}
