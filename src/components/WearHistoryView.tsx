import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Heart, Sun } from 'lucide-react'
import { useState } from 'react'
import { db } from '../db'
import { pieceCountLabel } from '../lib/outfits'
import { buildWearHistory, describeWornOn } from '../lib/wear'
import {
  OCCASION_LABELS,
  type WardrobeItem,
  type WearEvent,
} from '../types'
import { ItemThumbnail } from './ItemThumbnail'

interface WearHistoryViewProps {
  items: WardrobeItem[]
  onSeeOutfits: () => void
}

export function WearHistoryView({ items, onSeeOutfits }: WearHistoryViewProps) {
  const [today] = useState(() => new Date())
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const events = useLiveQuery(
    () => db.wearEvents.orderBy('wornOn').reverse().toArray(),
    [],
  )

  const entries =
    events && outfits ? buildWearHistory(events, outfits, items) : null

  async function toggleLoved(event: WearEvent) {
    if (event.id === undefined || pendingId !== null) return

    setError(null)
    setPendingId(event.id)

    try {
      await db.wearEvents.update(event.id, {
        feedback: event.feedback === 'loved' ? undefined : 'loved',
      })
    } catch {
      setError('Could not save that. Try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            The record
          </p>
          <h2 className="mt-2 font-display text-3xl leading-none tracking-tight text-ink sm:text-4xl">
            Wear log
          </h2>
          <p className="mt-3 text-sm text-muted">
            {entries
              ? entries.length === 0
                ? 'Nothing logged yet'
                : `${entries.length} ${entries.length === 1 ? 'wear' : 'wears'} logged · newest first`
              : 'Loading your wear log'}
          </p>
          {entries && entries.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              Love a wear to nudge tomorrow’s picks.
            </p>
          )}
        </div>

        {entries && entries.length > 0 && (
          <button
            type="button"
            onClick={onSeeOutfits}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View outfits
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </section>

      {entries === null ? (
        <section className="min-h-[30vh] rounded-3xl border border-dashed border-line bg-card/40" />
      ) : entries.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-16 text-center sm:px-10 sm:py-20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sun className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <h3 className="mt-6 font-display text-3xl tracking-tight text-ink sm:text-4xl">
            {outfits?.length ? 'Nothing worn yet.' : 'Save a look first.'}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            {outfits?.length
              ? 'Open a saved look and press Wore this today. Every wear lands here, so you can remember what worked.'
              : 'The wear log fills up once you have a look to wear. Build one from the pieces you own.'}
          </p>
          <button
            type="button"
            onClick={onSeeOutfits}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-ink px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {outfits?.length ? 'View outfits' : 'Build your first look'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <section aria-label="Wear history" className="space-y-3">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
            >
              {error}
            </p>
          )}

          {entries.map((entry, index) => {
            const showDate =
              index === 0 ||
              entries[index - 1].event.wornOn !== entry.event.wornOn
            const loved = entry.event.feedback === 'loved'
            const pending = pendingId === entry.event.id

            return (
              <div
                key={
                  entry.event.id ??
                  `${entry.event.outfitId}-${entry.event.createdAt}`
                }
                className="flex flex-col gap-1.5 sm:flex-row sm:gap-4"
              >
                <p className="shrink-0 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted sm:w-24">
                  {showDate
                    ? describeWornOn(entry.event.wornOn, today)
                    : ''}
                </p>

                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line/80 bg-card p-3">
                  <div className="flex shrink-0 gap-1">
                    {entry.pieces.slice(0, 3).map((piece) => (
                      <ItemThumbnail
                        key={piece.id ?? piece.createdAt}
                        item={piece}
                        className="h-12 w-12 rounded-lg border border-line"
                      />
                    ))}
                    {entry.pieces.length === 0 && (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-line text-[9px] text-muted">
                        Gone
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {entry.outfit?.name ?? 'Removed look'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {entry.outfit
                        ? `${OCCASION_LABELS[entry.outfit.occasion]} · ${pieceCountLabel(entry.pieces.length)}`
                        : 'This look is no longer saved'}
                    </p>
                  </div>

                  {entry.event.id !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        void toggleLoved(entry.event)
                      }}
                      disabled={pendingId !== null}
                      aria-pressed={loved}
                      aria-label={
                        loved
                          ? 'Remove love from this wear'
                          : 'Love this wear'
                      }
                      className={[
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60',
                        loved
                          ? 'border-accent/40 bg-accent-soft text-accent'
                          : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                      ].join(' ')}
                    >
                      <Heart
                        className={[
                          'h-3.5 w-3.5',
                          loved ? 'fill-current' : '',
                          pending ? 'animate-pulse' : '',
                        ].join(' ')}
                        strokeWidth={1.8}
                      />
                      <span className="hidden sm:inline">
                        {loved ? 'Loved' : 'Love'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}