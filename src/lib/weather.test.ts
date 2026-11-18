import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeWeatherCode,
  formatUpdatedAt,
  isCacheFresh,
  isWetCondition,
  parsePlaceResults,
  parseWeatherPayload,
  readCachedWeather,
  readSavedPlace,
  savePlace,
  weatherBand,
  writeCachedWeather,
  WEATHER_CACHE_TTL_MS,
  type WeatherSnapshot,
} from './weather'

function memoryStorage() {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('weatherBand', () => {
  it('splits feels-like temperatures into clothing bands', () => {
    expect(weatherBand(-4)).toBe('cold')
    expect(weatherBand(4.9)).toBe('cold')
    expect(weatherBand(5)).toBe('cool')
    expect(weatherBand(13.9)).toBe('cool')
    expect(weatherBand(14)).toBe('mild')
    expect(weatherBand(21.9)).toBe('mild')
    expect(weatherBand(22)).toBe('warm')
    expect(weatherBand(27.9)).toBe('warm')
    expect(weatherBand(28)).toBe('hot')
    expect(weatherBand(38)).toBe('hot')
  })
})

describe('describeWeatherCode', () => {
  it('maps the common WMO codes to a condition and label', () => {
    expect(describeWeatherCode(0)).toEqual({ condition: 'clear', label: 'Clear sky' })
    expect(describeWeatherCode(1)).toEqual({ condition: 'clear', label: 'Mainly clear' })
    expect(describeWeatherCode(2)).toEqual({
      condition: 'cloudy',
      label: 'Partly cloudy',
    })
    expect(describeWeatherCode(3)).toEqual({ condition: 'cloudy', label: 'Overcast' })
    expect(describeWeatherCode(45)).toEqual({ condition: 'fog', label: 'Fog' })
    expect(describeWeatherCode(51)).toEqual({ condition: 'drizzle', label: 'Drizzle' })
    expect(describeWeatherCode(61)).toEqual({ condition: 'rain', label: 'Rain' })
    expect(describeWeatherCode(66)).toEqual({
      condition: 'rain',
      label: 'Freezing rain',
    })
    expect(describeWeatherCode(71)).toEqual({ condition: 'snow', label: 'Snow' })
    expect(describeWeatherCode(80)).toEqual({
      condition: 'rain',
      label: 'Rain showers',
    })
    expect(describeWeatherCode(85)).toEqual({
      condition: 'snow',
      label: 'Snow showers',
    })
    expect(describeWeatherCode(95)).toEqual({
      condition: 'storm',
      label: 'Thunderstorm',
    })
    expect(describeWeatherCode(96)).toEqual({
      condition: 'storm',
      label: 'Thunderstorm with hail',
    })
  })

  it('falls back to cloud cover for a code it does not know', () => {
    expect(describeWeatherCode(42)).toEqual({
      condition: 'cloudy',
      label: 'Unknown conditions',
    })
  })
})

describe('isWetCondition', () => {
  it('treats precipitation, snow, and storms as wet', () => {
    expect(isWetCondition('drizzle')).toBe(true)
    expect(isWetCondition('rain')).toBe(true)
    expect(isWetCondition('snow')).toBe(true)
    expect(isWetCondition('storm')).toBe(true)
  })

  it('keeps dry conditions dry', () => {
    expect(isWetCondition('clear')).toBe(false)
    expect(isWetCondition('cloudy')).toBe(false)
    expect(isWetCondition('fog')).toBe(false)
  })
})

describe('isCacheFresh', () => {
  const now = new Date(2026, 10, 18, 9).getTime()

  it('accepts a reading inside the window', () => {
    expect(isCacheFresh(now - 10 * 60 * 1000, now)).toBe(true)
    expect(isCacheFresh(now, now)).toBe(true)
  })

  it('rejects a reading at or past the window', () => {
    expect(isCacheFresh(now - WEATHER_CACHE_TTL_MS, now)).toBe(false)
    expect(isCacheFresh(now - 2 * 60 * 60 * 1000, now)).toBe(false)
  })

  it('rejects a timestamp in the future', () => {
    expect(isCacheFresh(now + 60_000, now)).toBe(false)
  })

  it('honours a custom window', () => {
    expect(isCacheFresh(now - 5_000, now, 4_000)).toBe(false)
  })
})

describe('formatUpdatedAt', () => {
  const now = 1_000_000_000_000

  it('says just now for the last few seconds', () => {
    expect(formatUpdatedAt(now - 5_000, now)).toBe('just now')
    expect(formatUpdatedAt(now, now)).toBe('just now')
  })

  it('counts minutes under an hour', () => {
    expect(formatUpdatedAt(now - 60_000, now)).toBe('1 min ago')
    expect(formatUpdatedAt(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(formatUpdatedAt(now - 59 * 60_000, now)).toBe('59 min ago')
  })

  it('switches to hours after that', () => {
    expect(formatUpdatedAt(now - 60 * 60_000, now)).toBe('1 hour ago')
    expect(formatUpdatedAt(now - 3 * 60 * 60_000, now)).toBe('3 hours ago')
  })
})

describe('parseWeatherPayload', () => {
  const payload = {
    current: {
      temperature_2m: 12.4,
      apparent_temperature: 10.1,
      precipitation: 0.6,
      weather_code: 61,
      wind_speed_10m: 14,
      is_day: 1,
    },
  }

  it('builds a snapshot from a current-conditions payload', () => {
    expect(parseWeatherPayload(payload, 'Bandung', 123)).toEqual({
      temperature: 12.4,
      feelsLike: 10.1,
      precipitation: 0.6,
      windSpeed: 14,
      code: 61,
      condition: 'rain',
      label: 'Rain',
      isDay: true,
      fetchedAt: 123,
      placeLabel: 'Bandung',
    })
  })

  it('falls back to zero for missing optional measures', () => {
    const snapshot = parseWeatherPayload(
      {
        current: {
          temperature_2m: 20,
          apparent_temperature: 20,
          weather_code: 0,
        },
      },
      'Jakarta',
      7,
    )

    expect(snapshot.precipitation).toBe(0)
    expect(snapshot.windSpeed).toBe(0)
    expect(snapshot.isDay).toBe(false)
  })

  it('rejects a response without current conditions', () => {
    expect(() => parseWeatherPayload(null, 'X', 1)).toThrow()
    expect(() => parseWeatherPayload({}, 'X', 1)).toThrow()
    expect(() => parseWeatherPayload({ current: 'warm' }, 'X', 1)).toThrow()
  })

  it('rejects a current block that is missing values', () => {
    expect(() =>
      parseWeatherPayload({ current: { temperature_2m: 12 } }, 'X', 1),
    ).toThrow()
  })
})

describe('parsePlaceResults', () => {
  it('reads name, coordinates, and the admin/country detail', () => {
    const results = parsePlaceResults({
      results: [
        {
          id: 1,
          name: 'Bandung',
          latitude: -6.9,
          longitude: 107.6,
          admin1: 'West Java',
          country: 'Indonesia',
        },
      ],
    })

    expect(results).toEqual([
      {
        id: 1,
        latitude: -6.9,
        longitude: 107.6,
        label: 'Bandung',
        detail: 'West Java, Indonesia',
      },
    ])
  })

  it('skips malformed rows instead of failing the whole list', () => {
    const results = parsePlaceResults({
      results: [
        { name: 'No coordinates' },
        'not a place',
        { id: 2, name: 'Ubud', latitude: -8.5, longitude: 115.2 },
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0].label).toBe('Ubud')
    expect(results[0].detail).toBe('')
  })

  it('falls back to a coordinate-derived id', () => {
    const [result] = parsePlaceResults({
      results: [{ name: 'Somewhere', latitude: 1, longitude: 2 }],
    })

    expect(result.id).toBe(1002)
  })

  it('returns an empty list for missing or broken results', () => {
    expect(parsePlaceResults(null)).toEqual([])
    expect(parsePlaceResults({})).toEqual([])
    expect(parsePlaceResults({ results: 'Bandung' })).toEqual([])
  })
})

describe('place and weather cache', () => {
  const place = { latitude: -6.9, longitude: 107.6, label: 'Bandung' }
  const snapshot: WeatherSnapshot = {
    temperature: 24,
    feelsLike: 25,
    precipitation: 0,
    windSpeed: 6,
    code: 1,
    condition: 'clear',
    label: 'Mainly clear',
    isDay: true,
    fetchedAt: 42,
    placeLabel: 'Bandung',
  }

  it('round-trips the saved place', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })

    expect(readSavedPlace()).toBeNull()
    savePlace(place)
    expect(readSavedPlace()).toEqual(place)
  })

  it('ignores an unreadable or malformed saved place', () => {
    const storage = memoryStorage()
    storage.setItem('wardrobe.place.v1', '{not json')
    vi.stubGlobal('window', { localStorage: storage })

    expect(readSavedPlace()).toBeNull()
  })

  it('round-trips the cached reading for the same place', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })

    writeCachedWeather(place, snapshot)
    expect(readCachedWeather(place)).toEqual(snapshot)
  })

  it('does not reuse a reading from another place', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })

    writeCachedWeather(place, snapshot)
    expect(
      readCachedWeather({ latitude: 51.5, longitude: -0.1, label: 'London' }),
    ).toBeNull()
  })

  it('returns nothing when storage is unavailable', () => {
    expect(readCachedWeather(place)).toBeNull()
    expect(readSavedPlace()).toBeNull()
  })
})