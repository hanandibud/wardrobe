import { useLiveQuery } from 'dexie-react-hooks'
import { Check, LoaderCircle, Shirt, SkipForward, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { pieceCountLabel } from '../lib/outfits'
import { preferenceSummary, readPreferences } from '../lib/preferences'
import {
  findMatchingOutfit,
  lastWornByItem,
  lovedItemIds,
  readSkippedKeys,
  recommend,
  seasonForMonth,
  suggestionName,
  writeSkippedKeys,
  type Suggestion,
} from '../lib/recommend'
import { localIsoDate } from '../lib/wear'
import { isWetCondition, weatherBand, type WeatherSnapshot } from '../lib/weather'
import { OCCASION_OPTIONS, type Occasion, type WardrobeItem } from '../types'
import { ItemThumbnail } from './ItemThumbnail'

interface SuggestionsPanelProps {
  items: WardrobeItem[]
  weather: WeatherSnapshot | null
  onAddItems: () => void
  onSaved: (message: string) => void
}

export function SuggestionsPanel({
  items,
  weather,
  onAddItems,
  onSaved,
}: SuggestionsPanelProps) {
  const [today] = useState(() => new Date())
  const [occasion, setOccasion] = useState<Occasion>('casual')
  const [preferences] = useState(() => readPreferences())
  const [skipped, setSkipped] = useState<string[]>(() =>
    readSkippedKeys(localIsoDate(new Date())),
  )
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const events = useLiveQuery(() => db.wearEvents.toArray(), [])

  const todayKey = localIsoDate(today)
  const band = weather ? weatherBand(weather.feelsLike) : null
  const wet = weather ? isWetCondition(weather.condition) : false
  const paletteNote = preferenceSummary(preferences)

  const lastWorn = useMemo(
    () => lastWornByItem(outfits ?? [], events ?? []),
    [outfits, events],
  )
  const loved = useMemo(
    () => lovedItemIds(outfits ?? [], events ?? []),
    [outfits, events],
  )
  const wornToday = useMemo(
    () =>
      new Set(
        (events ?? [])
          .filter((event) => event.wornOn === todayKey)
          .map((event) => event.outfitId),
      ),
    [events, todayKey],
  )

  const result = useMemo(
    () =>
      recommend({
        items,
        occasion,
        band,
        wet,
        today,
        lastWornByItem: lastWorn,
        lovedItemIds: loved,
        skippedKeys: skipped,
      }),
    [items, occasion, band, wet, today, lastWorn, loved, skipped],
  )

  function matchingOutfit(suggestion: Suggestion) {
    const itemIds = suggestion.items.flatMap((item) =>
      item.id === undefined ? [] : [item.id],
    )
    return findMatchingOutfit(outfits ?? [], itemIds)
  }

  function isWornToday(suggestion: Suggestion): boolean {
    const match = matchingOutfit(suggestion)
    return match?.id !== undefined && wornToday.has(match.id)
  }

  async function handleWear(suggestion: Suggestion) {
    if (pendingKey !== null) return

    const itemIds = suggestion.items.flatMap((item) =>
      item.id === undefined ? [] : [item.id],
    )
    if (itemIds.length !== suggestion.items.length) {
      setError('That look refers to a piece that is no longer saved.')
      return
    }

    setError(null)
    setPendingKey(suggestion.key)

    try {
      const existing = findMatchingOutfit(outfits ?? [], itemIds)
      const creating = existing?.id === undefined

      await db.transaction('rw', db.outfits, db.wearEvents, async () => {
        const outfitId =
          existing?.id ??
          (await db.outfits.add({
            name: suggestionName(suggestion, occasion),
            itemIds,
            occasion,
            seasons: [seasonForMonth(today.getMonth())],
            createdAt: Date.now(),
          }))

        const already = await db.wearEvents
          .where('outfitId')
          .equals(outfitId)
          .and((event) => event.wornOn === todayKey)
          .first()

        if (!already) {
          await db.wearEvents.add({
            outfitId,
            wornOn: todayKey,
            createdAt: Date.now(),
          })
        }
      })

      onSaved(
        creating
          ? 'Saved as a look and added to today’s log.'
          : 'Added to your wear log.',
      )
    } catch {
      setError('Could not log that look. Try again.')
    } finally {
      setPendingKey(null)
    }
  }

  function skipSuggestion(key: string) {
    const next = [...skipped, key]
    setSkipped(next)
    writeSkippedKeys(todayKey, next)
  }

  function resetSkips() {
    setSkipped([])
    writeSkippedKeys(todayKey, [])
  }

  return (
    <section aria-labelledby="suggestions-heading" className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            The suggestion
          </p>
          <h2
            id="suggestions-heading"
            className="mt-2 font-display text-3xl leading-none tracking-tight text-ink sm:text-4xl"
          >
            What to wear
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
            {weather
              ? `Built for ${Math.round(weather.feelsLike)}° and ${weather.label.toLowerCase()}, from pieces that are clean today.`
              : 'Built from what is clean. Set a location above for weather-aware picks.'}
          </p>
          {paletteNote && (
            <p className="mt-1 text-xs leading-5 text-muted">
              Your palette: {paletteNote}.
            </p>
          )}
        </div>

        <div
          role="group"
          aria-label="Occasion"
          className="grid w-full grid-cols-4 gap-1 rounded-full border border-line bg-card p-1 sm:w-auto"
        >
          {OCCASION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setOccasion(option.value)}
              aria-pressed={occasion === option.value}
              className={[
                'rounded-full px-2 py-2 text-xs transition',
                occasion === option.value
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-muted hover:bg-black/5 hover:text-ink',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
        >
          {error}
        </p>
      )}

      {result.suggestions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <h3 className="mt-4 font-display text-2xl tracking-tight text-ink">
            No picks yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {result.message ?? 'Nothing to suggest right now.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onAddItems}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent"
            >
              Add a piece
            </button>
            {skipped.length > 0 && (
              <button
                type="button"
                onClick={resetSkips}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30"
              >
                Show skipped picks
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.suggestions.map((suggestion, index) => {
              const worn = isWornToday(suggestion)
              const pending = pendingKey === suggestion.key

              return (
                <article
                  key={suggestion.key}
                  className="flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_1px_0_rgba(33,30,25,0.04)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      {index === 0 ? 'Best match' : `Pick ${index + 1}`}
                    </span>
                    <span className="text-[10px] text-muted">
                      {pieceCountLabel(suggestion.items.length)}
                    </span>
                  </div>

                  <div className="flex gap-1.5 px-4 pt-4">
                    {suggestion.items.map((piece) => (
                      <div
                        key={piece.id ?? piece.createdAt}
                        className="min-w-0 flex-1"
                      >
                        <ItemThumbnail
                          item={piece}
                          className="aspect-square rounded-lg border border-line/70"
                        />
                        <p className="mt-1.5 truncate text-[10px] leading-4 text-muted">
                          {piece.name}
                        </p>
                      </div>
                    ))}
                  </div>

                  <ul className="flex-1 space-y-1.5 px-4 py-3.5">
                    {suggestion.reasons.map((reason) => (
                      <li
                        key={reason}
                        className="flex gap-1.5 text-[11px] leading-5 text-muted"
                      >
                        <Check
                          className="mt-0.5 h-3 w-3 shrink-0 text-forest"
                          strokeWidth={2}
                        />
                        {reason}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-2 border-t border-line/70 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleWear(suggestion)
                      }}
                      disabled={pendingKey !== null || worn}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2.5 text-[11px] font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {worn ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : pending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Shirt className="h-3.5 w-3.5" />
                      )}
                      {worn
                        ? 'In today’s log'
                        : pending
                          ? 'Logging...'
                          : 'Wear this'}
                    </button>
                    <button
                      type="button"
                      onClick={() => skipSuggestion(suggestion.key)}
                      disabled={pendingKey !== null}
                      aria-label={`Skip ${suggestion.items.map((piece) => piece.name).join(', ')}`}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-[11px] font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {skipped.length > 0 && (
            <button
              type="button"
              onClick={resetSkips}
              className="text-xs font-medium text-muted transition hover:text-ink"
            >
              Show {skipped.length} skipped{' '}
              {skipped.length === 1 ? 'pick' : 'picks'}
            </button>
          )}
        </>
      )}
    </section>
  )
}