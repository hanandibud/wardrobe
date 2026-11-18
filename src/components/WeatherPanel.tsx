import {
  Check,
  Droplets,
  LoaderCircle,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Wind,
  X,
} from 'lucide-react'
import { useWeather } from '../hooks/useWeather'
import {
  formatUpdatedAt,
  isWetCondition,
  samePlace,
  WEATHER_BAND_LABELS,
  type WeatherSnapshot,
} from '../lib/weather'
import { bandClass, WeatherGlyph } from './WeatherGlyph'

interface WeatherPanelProps {
  onSnapshotChange?: (snapshot: WeatherSnapshot | null) => void
}

export function WeatherPanel({ onSnapshotChange }: WeatherPanelProps) {
  const {
    place,
    snapshot,
    band,
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
      setQuery,
    },
  } = useWeather(onSnapshotChange)

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
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-[11px] font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
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
            onClick={toggleSearch}
            aria-expanded={searchOpen}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-[11px] font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
              onClick={openSearch}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
          <form onSubmit={search} className="flex gap-2">
            <label htmlFor="place-search" className="sr-only">
              Search for a city
            </label>
            <input
              id="place-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                clearSearchError()
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