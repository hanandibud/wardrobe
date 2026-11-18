import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchWeather,
  isCacheFresh,
  readCachedWeather,
  readSavedPlace,
  resolveWeatherSource,
  savePlace,
  searchPlaces,
  weatherBand,
  writeCachedWeather,
  type Place,
  type PlaceResult,
  type WeatherBand,
  type WeatherSnapshot,
} from '../lib/weather'

const NOW_TICK_MS = 60_000
const LOCATION_TIMEOUT_MS = 10_000
const LOCATION_MAX_AGE_MS = 10 * 60 * 1000

export interface WeatherActions {
  refresh: () => void
  choosePlace: (next: Place) => void
  useMyLocation: () => void
  search: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  openSearch: () => void
  toggleSearch: () => void
  clearSearchError: () => void
  setQuery: (value: string) => void
}

export interface Weather {
  place: Place | null
  snapshot: WeatherSnapshot | null
  band: WeatherBand | null
  loading: boolean
  now: number
  locating: boolean
  searchOpen: boolean
  query: string
  results: PlaceResult[]
  searching: boolean
  error: string | null
  searchError: string | null
  actions: WeatherActions
}

/**
 * All weather orchestration — cache, fetch, geolocation, place search, the
 * request-race guard, and the clock used for "updated N minutes ago" — so the
 * panel only renders. Pure rules live in `lib/weather.ts`.
 */
export function useWeather(
  onSnapshotChange?: (snapshot: WeatherSnapshot | null) => void,
): Weather {
  const [place, setPlace] = useState<Place | null>(() => readSavedPlace())
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(() => {
    const saved = readSavedPlace()
    return saved ? readCachedWeather(saved) : null
  })
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(() => {
    const saved = readSavedPlace()
    const cached = saved ? readCachedWeather(saved) : null
    return saved !== null && !(cached && isCacheFresh(cached.fetchedAt, Date.now()))
  })
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const requestId = useRef(0)

  const loadWeather = useCallback(
    async (target: Place, force: boolean) => {
      const currentRequest = ++requestId.current
      const source = resolveWeatherSource(target, force, Date.now())

      if (!source.shouldFetch && source.cached) {
        setSnapshot(source.cached)
        setNow(Date.now())
        setError(null)
        setLoading(false)
        onSnapshotChange?.(source.cached)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const fresh = await fetchWeather(target)
        if (requestId.current !== currentRequest) return

        writeCachedWeather(target, fresh)
        setSnapshot(fresh)
        setNow(Date.now())
        onSnapshotChange?.(fresh)
      } catch {
        if (requestId.current !== currentRequest) return

        if (source.cached) {
          setSnapshot(source.cached)
          setNow(Date.now())
          onSnapshotChange?.(source.cached)
          setError(
            'Showing the last reading — the weather service could not be reached.',
          )
        } else {
          onSnapshotChange?.(null)
          setError(
            'Could not reach the weather service. Check your connection and try again.',
          )
        }
      } finally {
        if (requestId.current === currentRequest) setLoading(false)
      }
    },
    [onSnapshotChange],
  )

  useEffect(() => {
    if (!place) return
    // Fetching is this effect's whole job; a fresh cache entry short-circuits it.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadWeather(place, false)
  }, [place, loadWeather])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const choosePlace = useCallback(
    (next: Place) => {
      const cached = readCachedWeather(next)
      savePlace(next)
      setSnapshot(cached)
      setPlace(next)
      setSearchOpen(false)
      setQuery('')
      setResults([])
      setSearchError(null)
      onSnapshotChange?.(cached)
    },
    [onSnapshotChange],
  )

  const refresh = useCallback(() => {
    if (place) void loadWeather(place, true)
  }, [place, loadWeather])

  const useMyLocation = useCallback(() => {
    if (locating) return

    setSearchOpen(false)

    if (!('geolocation' in navigator)) {
      setError('This browser cannot share a location. Search for a city instead.')
      return
    }

    setLocating(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        choosePlace({
          latitude: Number(position.coords.latitude.toFixed(3)),
          longitude: Number(position.coords.longitude.toFixed(3)),
          label: 'My location',
        })
      },
      () => {
        setLocating(false)
        setError('Location was unavailable. Search for a city instead.')
      },
      {
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: LOCATION_MAX_AGE_MS,
      },
    )
  }, [locating, choosePlace])

  const search = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (searching) return

      const trimmed = query.trim()
      if (trimmed.length < 2) {
        setSearchError('Type at least two letters of a city name.')
        return
      }

      setSearching(true)
      setSearchError(null)

      try {
        const found = await searchPlaces(trimmed)
        setResults(found)
        if (found.length === 0) {
          setSearchError('No places matched. Try a nearby city.')
        }
      } catch {
        setSearchError('Could not search places. Check your connection.')
      } finally {
        setSearching(false)
      }
    },
    [searching, query],
  )

  const openSearch = useCallback(() => setSearchOpen(true), [])

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => !open)
    setSearchError(null)
  }, [])

  const clearSearchError = useCallback(() => setSearchError(null), [])

  const setQueryValue = useCallback((value: string) => setQuery(value), [])

  return {
    place,
    snapshot,
    band: snapshot ? weatherBand(snapshot.feelsLike) : null,
    loading,
    now,
    locating,
    searchOpen,
    query,
    results,
    searching,
    error,
    searchError,
    actions: {
      refresh,
      choosePlace,
      useMyLocation,
      search,
      openSearch,
      toggleSearch,
      clearSearchError,
      setQuery: setQueryValue,
    },
  }
}
