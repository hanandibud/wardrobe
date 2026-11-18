import {
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LoaderCircle,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Sun,
  Wind,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  fetchWeather,
  formatUpdatedAt,
  isCacheFresh,
  isWetCondition,
  readCachedWeather,
  readSavedPlace,
  savePlace,
  searchPlaces,
  weatherBand,
  writeCachedWeather,
  WEATHER_BAND_LABELS,
  type Place,
  type PlaceResult,
  type WeatherCondition,
  type WeatherSnapshot,
} from '../lib/weather'

function WeatherGlyph({
  condition,
  isDay,
  className,
}: {
  condition: WeatherCondition
  isDay: boolean
  className?: string
}) {
  if (condition === 'clear') {
    return isDay ? (
      <Sun className={className} strokeWidth={1.5} />
    ) : (
      <CloudMoon className={className} strokeWidth={1.5} />
    )
  }

  if (condition === 'cloudy') {
    return isDay ? (
      <CloudSun className={className} strokeWidth={1.5} />
    ) : (
      <Cloud className={className} strokeWidth={1.5} />
    )
  }

  if (condition === 'fog') {
    return <CloudFog className={className} strokeWidth={1.5} />
  }

  if (condition === 'drizzle') {
    return <CloudDrizzle className={className} strokeWidth={1.5} />
  }

  if (condition === 'rain') {
    return <CloudRain className={className} strokeWidth={1.5} />
  }

  if (condition === 'snow') {
    return <CloudSnow className={className} strokeWidth={1.5} />
  }

  return <CloudLightning className={className} strokeWidth={1.5} />
}

const bandClass: Record<ReturnType<typeof weatherBand>, string> = {
  cold: 'border-forest/25 bg-forest/10 text-forest',
  cool: 'border-forest/25 bg-forest/10 text-forest',
  mild: 'border-accent/25 bg-accent-soft text-accent',
  warm: 'border-accent/25 bg-accent-soft text-accent',
  hot: 'border-accent/25 bg-accent-soft text-accent',
}

function samePlace(a: Place, b: PlaceResult): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 0.0001 &&
    Math.abs(a.longitude - b.longitude) < 0.0001
  )
}

interface WeatherPanelProps {
  onSnapshotChange?: (snapshot: WeatherSnapshot | null) => void
}

export function WeatherPanel({ onSnapshotChange }: WeatherPanelProps) {
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
      const cached = readCachedWeather(target)

      if (!force && cached && isCacheFresh(cached.fetchedAt, Date.now())) {
        setSnapshot(cached)
        setNow(Date.now())
        setError(null)
        setLoading(false)
        onSnapshotChange?.(cached)
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

        if (cached) {
          setSnapshot(cached)
          setNow(Date.now())
          onSnapshotChange?.(cached)
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
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  function choosePlace(next: Place) {
    const cached = readCachedWeather(next)
    savePlace(next)
    setSnapshot(cached)
    setPlace(next)
    setSearchOpen(false)
    setQuery('')
    setResults([])
    setSearchError(null)
    onSnapshotChange?.(cached)
  }

  function useMyLocation() {
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
      { timeout: 10_000, maximumAge: 10 * 60 * 1000 },
    )
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
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
  }

  const band = snapshot ? weatherBand(snapshot.feelsLike) : null

  return (
    <section
      aria-labelledby="weather-heading"
      className="overflow-hidden rounded-3xl border border-line/80 bg-card shadow-[0_1px_0_rgba(33,30,25,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MapPin className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              The weather
            </p>
            <h2
              id="weather-heading"
              className="truncate font-display text-lg leading-tight text-ink"
            >
              {place?.label ?? 'Set your location'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {place && (
            <button
              type="button"
              onClick={() => {
                void loadWeather(place, true)
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-[11px] font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open)
              setSearchError(null)
            }}
            aria-expanded={searchOpen}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-[11px] font-medium text-ink transition hover:border-ink/30"
          >
            {searchOpen ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <MapPin className="h-3.5 w-3.5" />
            )}
            {place ? 'Change' : 'City'}
          </button>
        </div>
      </div>

      {!place && (
        <div className="px-5 py-6">
          <p className="max-w-lg text-sm leading-6 text-muted">
            Share your location, or search for a city, and the daily picks can
            account for the day you are actually having. The choice stays in
            this browser.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {locating ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="h-3.5 w-3.5" />
              )}
              {locating ? 'Finding you...' : 'Use my location'}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              <Search className="h-3.5 w-3.5" />
              Search a city
            </button>
          </div>
        </div>
      )}

      {place && loading && !snapshot && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Reading the sky...
        </div>
      )}

      {snapshot && band && (
        <div className="grid gap-6 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8">
          <div className="flex items-center gap-4">
            <WeatherGlyph
              condition={snapshot.condition}
              isDay={snapshot.isDay}
              className="h-14 w-14 shrink-0 text-accent"
            />
            <div>
              <p className="font-display text-5xl leading-none tracking-tight text-ink">
                {Math.round(snapshot.temperature)}°
              </p>
              <p className="mt-2 text-sm text-ink">{snapshot.label}</p>
              <p className="text-xs text-muted">
                Feels like {Math.round(snapshot.feelsLike)}°
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 sm:w-64">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">
                Layer
              </dt>
              <dd className="mt-1.5">
                <span
                  className={[
                    'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                    bandClass[band],
                  ].join(' ')}
                >
                  {WEATHER_BAND_LABELS[band]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                <Wind className="h-3 w-3" /> Wind
              </dt>
              <dd className="mt-1.5 text-sm text-ink">
                {Math.round(snapshot.windSpeed)} km/h
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                <Droplets className="h-3 w-3" /> Rain
              </dt>
              <dd className="mt-1.5 text-sm text-ink">
                {isWetCondition(snapshot.condition) || snapshot.precipitation > 0
                  ? `${snapshot.precipitation.toFixed(1)} mm`
                  : 'Dry'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {snapshot && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 bg-paper/40 px-5 py-2.5 text-[11px] text-muted">
          <span>Updated {formatUpdatedAt(snapshot.fetchedAt, now)}</span>
          <span>Open-Meteo · no account needed</span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900"
        >
          {error}
        </p>
      )}

      {searchOpen && (
        <div className="border-t border-line/70 bg-paper/40 px-5 py-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <label htmlFor="place-search" className="sr-only">
              Search for a city
            </label>
            <input
              id="place-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSearchError(null)
              }}
              placeholder="City name"
              autoComplete="off"
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-sm text-ink placeholder:text-muted/70 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={searching}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Search
            </button>
          </form>

          {searchError && (
            <p role="alert" className="mt-2.5 text-xs text-accent">
              {searchError}
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {results.map((result) => {
                const selected = place ? samePlace(place, result) : false

                return (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() =>
                        choosePlace({
                          latitude: result.latitude,
                          longitude: result.longitude,
                          label: result.label,
                        })
                      }
                      aria-pressed={selected}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition',
                        selected
                          ? 'border-forest/30 bg-forest/10'
                          : 'border-line bg-card hover:border-ink/30',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {result.label}
                        </span>
                        {result.detail && (
                          <span className="block truncate text-[11px] text-muted">
                            {result.detail}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-forest" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent transition hover:text-ink disabled:opacity-60"
          >
            <Navigation className="h-3.5 w-3.5" />
            {locating ? 'Finding you...' : 'Use my location instead'}
          </button>
        </div>
      )}
    </section>
  )
}