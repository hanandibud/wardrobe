export interface Place {
  latitude: number
  longitude: number
  label: string
}

export interface PlaceResult extends Place {
  id: number
  detail: string
}

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'

export interface WeatherSnapshot {
  temperature: number
  feelsLike: number
  precipitation: number
  windSpeed: number
  code: number
  condition: WeatherCondition
  label: string
  isDay: boolean
  fetchedAt: number
  placeLabel: string
}

export type WeatherBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot'

export const WEATHER_BAND_LABELS: Record<WeatherBand, string> = {
  cold: 'Cold',
  cool: 'Cool',
  mild: 'Mild',
  warm: 'Warm',
  hot: 'Hot',
}

const CACHE_KEY = 'wardrobe.weather.v1'
const PLACE_KEY = 'wardrobe.place.v1'
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000

/** WMO weather code, as used by Open-Meteo. */
export function describeWeatherCode(code: number): {
  condition: WeatherCondition
  label: string
} {
  if (code === 0) return { condition: 'clear', label: 'Clear sky' }
  if (code === 1) return { condition: 'clear', label: 'Mainly clear' }
  if (code === 2) return { condition: 'cloudy', label: 'Partly cloudy' }
  if (code === 3) return { condition: 'cloudy', label: 'Overcast' }
  if (code === 45 || code === 48) return { condition: 'fog', label: 'Fog' }
  if (code === 51 || code === 53 || code === 55) {
    return { condition: 'drizzle', label: 'Drizzle' }
  }
  if (code === 56 || code === 57) {
    return { condition: 'drizzle', label: 'Freezing drizzle' }
  }
  if (code === 61 || code === 63 || code === 65) {
    return { condition: 'rain', label: 'Rain' }
  }
  if (code === 66 || code === 67) {
    return { condition: 'rain', label: 'Freezing rain' }
  }
  if (code === 71 || code === 73 || code === 75 || code === 77) {
    return { condition: 'snow', label: 'Snow' }
  }
  if (code === 80 || code === 81 || code === 82) {
    return { condition: 'rain', label: 'Rain showers' }
  }
  if (code === 85 || code === 86) {
    return { condition: 'snow', label: 'Snow showers' }
  }
  if (code === 95) return { condition: 'storm', label: 'Thunderstorm' }
  if (code === 96 || code === 99) {
    return { condition: 'storm', label: 'Thunderstorm with hail' }
  }

  return { condition: 'cloudy', label: 'Unknown conditions' }
}

export function isWetCondition(condition: WeatherCondition): boolean {
  return (
    condition === 'drizzle' ||
    condition === 'rain' ||
    condition === 'snow' ||
    condition === 'storm'
  )
}

/**
 * A clothing band from the feels-like temperature. These thresholds are a
 * starting heuristic, not a scientific model, and are easy to tune later.
 */
export function weatherBand(feelsLike: number): WeatherBand {
  if (feelsLike < 5) return 'cold'
  if (feelsLike < 14) return 'cool'
  if (feelsLike < 22) return 'mild'
  if (feelsLike < 28) return 'warm'
  return 'hot'
}

export function isCacheFresh(
  fetchedAt: number,
  now: number,
  ttlMs = WEATHER_CACHE_TTL_MS,
): boolean {
  const age = now - fetchedAt
  return age >= 0 && age < ttlMs
}

/** "just now" / "5 min ago" / "2 hours ago", for the weather card. */
export function formatUpdatedAt(fetchedAt: number, now: number): string {
  const minutes = Math.round((now - fetchedAt) / 60_000)

  if (minutes <= 0) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Turn one Open-Meteo `current` payload into the app's snapshot. Kept pure so
 * the API shape can be tested without a network call.
 */
export function parseWeatherPayload(
  payload: unknown,
  placeLabel: string,
  now: number,
): WeatherSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Weather response was not an object.')
  }

  const current = (payload as { current?: unknown }).current
  if (typeof current !== 'object' || current === null) {
    throw new Error('Weather response had no current conditions.')
  }

  const source = current as Record<string, unknown>
  const temperature = readNumber(source, 'temperature_2m')
  const feelsLike = readNumber(source, 'apparent_temperature')
  const code = readNumber(source, 'weather_code')

  if (temperature === null || feelsLike === null || code === null) {
    throw new Error('Weather response was missing current values.')
  }

  const { condition, label } = describeWeatherCode(code)

  return {
    temperature,
    feelsLike,
    precipitation: readNumber(source, 'precipitation') ?? 0,
    windSpeed: readNumber(source, 'wind_speed_10m') ?? 0,
    code,
    condition,
    label,
    isDay: source.is_day === 1,
    fetchedAt: now,
    placeLabel,
  }
}

export function parsePlaceResults(payload: unknown): PlaceResult[] {
  if (typeof payload !== 'object' || payload === null) return []

  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results)) return []

  return results.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []

    const row = entry as Record<string, unknown>
    const latitude = row.latitude
    const longitude = row.longitude
    const name = row.name

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      typeof name !== 'string'
    ) {
      return []
    }

    const detail = [row.admin1, row.country]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(', ')

    return [
      {
        id: typeof row.id === 'number' ? row.id : latitude * 1000 + longitude,
        latitude,
        longitude,
        label: name,
        detail,
      },
    ]
  })
}

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export async function fetchWeather(place: Place): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    timezone: 'auto',
    forecast_days: '1',
  })

  const response = await fetch(`${WEATHER_URL}?${params}`)
  if (!response.ok) {
    throw new Error(`Weather request failed with ${response.status}.`)
  }

  return parseWeatherPayload(await response.json(), place.label, Date.now())
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    name: query,
    count: '6',
    language: 'en',
    format: 'json',
  })

  const response = await fetch(`${GEOCODING_URL}?${params}`)
  if (!response.ok) {
    throw new Error(`Place search failed with ${response.status}.`)
  }

  return parsePlaceResults(await response.json())
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or blocked storage should never break the page; the cache is optional.
  }
}

function isPlace(value: unknown): value is Place {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    typeof candidate.label === 'string'
  )
}

export function readSavedPlace(): Place | null {
  const stored = readJson<unknown>(PLACE_KEY)
  return isPlace(stored) ? stored : null
}

export function savePlace(place: Place): void {
  writeJson(PLACE_KEY, place)
}

interface WeatherCache {
  place: Place
  snapshot: WeatherSnapshot
}

export function readCachedWeather(place: Place): WeatherSnapshot | null {
  const cached = readJson<WeatherCache>(CACHE_KEY)
  if (!cached || !isPlace(cached.place)) return null

  const samePlace =
    Math.abs(cached.place.latitude - place.latitude) < 0.0001 &&
    Math.abs(cached.place.longitude - place.longitude) < 0.0001

  return samePlace && cached.snapshot ? cached.snapshot : null
}

export function writeCachedWeather(
  place: Place,
  snapshot: WeatherSnapshot,
): void {
  writeJson(CACHE_KEY, { place, snapshot })
}