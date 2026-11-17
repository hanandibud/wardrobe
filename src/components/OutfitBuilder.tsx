import { ArrowLeft, Check, LoaderCircle, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { db } from '../db'
import { groupItemsByCategory, pieceCountLabel, toggleItemSelection } from '../lib/outfits'
import {
  OCCASION_OPTIONS,
  SEASON_OPTIONS,
  type Occasion,
  type Season,
  type WardrobeItem,
} from '../types'
import { ItemThumbnail } from './ItemThumbnail'

interface OutfitBuilderProps {
  items: WardrobeItem[]
  onCancel: () => void
  onSaved: (name: string) => void
}

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-card px-3.5 text-sm text-ink placeholder:text-muted/60 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20'

export function OutfitBuilder({ items, onCancel, onSaved }: OutfitBuilderProps) {
  const [name, setName] = useState('')
  const [occasion, setOccasion] = useState<Occasion>('casual')
  const [seasons, setSeasons] = useState<Season[]>(
    SEASON_OPTIONS.map((option) => option.value),
  )
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => groupItemsByCategory(items), [items])
  const selectedItems = useMemo(() => {
    const byId = new Map(
      items.flatMap((item) => (item.id === undefined ? [] : [[item.id, item] as const])),
    )

    return selectedIds.flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    })
  }, [items, selectedIds])

  function togglePiece(id: number) {
    setError(null)
    setSelectedIds((current) => toggleItemSelection(current, id))
  }

  function toggleSeason(season: Season) {
    setSeasons((current) =>
      current.includes(season)
        ? current.filter((entry) => entry !== season)
        : [...current, season],
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    if (!name.trim()) {
      setError('Give this outfit a name.')
      return
    }

    if (selectedIds.length === 0) {
      setError('Pick at least one piece for this look.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await db.outfits.add({
        name: name.trim(),
        itemIds: selectedIds,
        occasion,
        seasons,
        createdAt: Date.now(),
      })
      onSaved(name.trim())
    } catch {
      setError('Could not save that outfit. Try again.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            New look
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
            Build an outfit
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Pick pieces from your own wardrobe. A look can hold as many pieces as you
            want, but each piece only once.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to outfits
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <section className="space-y-6 rounded-3xl border border-line/80 bg-card p-5 sm:p-7">
            <div className="space-y-2">
              <label htmlFor="outfit-name" className="text-sm font-medium text-ink">
                Name
              </label>
              <input
                id="outfit-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Monday studio uniform"
                maxLength={80}
                className={inputClass}
              />
            </div>

            <div className="space-y-2.5">
              <span className="text-sm font-medium text-ink">Occasion</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion">
                {OCCASION_OPTIONS.map((option) => {
                  const isActive = occasion === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setOccasion(option.value)}
                      aria-pressed={isActive}
                      className={[
                        'rounded-full border px-3.5 py-2 text-xs font-medium transition',
                        isActive
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">Seasons</span>
                <span className="text-[11px] text-muted">Pick all that apply</span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Outfit seasons">
                {SEASON_OPTIONS.map((option) => {
                  const isActive = seasons.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleSeason(option.value)}
                      aria-pressed={isActive}
                      className={[
                        'rounded-full border px-3.5 py-2 text-xs font-medium transition',
                        isActive
                          ? 'border-forest bg-forest text-paper'
                          : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-line/80 bg-card p-5 sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-ink">Pieces</h2>
              <span className="text-[11px] text-muted">
                {pieceCountLabel(selectedIds.length)} picked
              </span>
            </div>

            {groups.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line bg-paper/50 px-4 py-6 text-center text-sm text-muted">
                Your wardrobe is empty. Add a piece first, then come back to build a look.
              </p>
            ) : (
              <div className="mt-5 space-y-6">
                {groups.map((group) => (
                  <div key={group.category}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {group.label}
                    </p>
                    <div className="mt-2.5 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                      {group.items.map((item) => {
                        const id = item.id
                        const isSelected =
                          id !== undefined && selectedIds.includes(id)

                        return (
                          <button
                            key={id ?? item.createdAt}
                            type="button"
                            onClick={() => {
                              if (id !== undefined) togglePiece(id)
                            }}
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? 'Remove' : 'Add'} ${item.name}`}
                            className={[
                              'group rounded-xl border p-1.5 text-left transition',
                              isSelected
                                ? 'border-ink bg-ink/[0.04] shadow-sm'
                                : 'border-line bg-card hover:border-ink/30',
                            ].join(' ')}
                          >
                            <div className="relative">
                              <ItemThumbnail
                                item={item}
                                className="aspect-square rounded-lg"
                              />
                              {isSelected ? (
                                <span className="absolute right-1.5 top-1.5 rounded-full bg-ink p-1 text-paper">
                                  <Check className="h-3 w-3" strokeWidth={2.4} />
                                </span>
                              ) : (
                                <span className="absolute right-1.5 top-1.5 rounded-full bg-card/90 p-1 text-muted opacity-0 transition group-hover:opacity-100">
                                  <Plus className="h-3 w-3" strokeWidth={2.2} />
                                </span>
                              )}
                              {item.status !== 'clean' && (
                                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-card/90 px-1.5 py-0.5 text-[9px] font-medium text-muted">
                                  {item.status === 'dirty' ? 'Needs wash' : 'In laundry'}
                                </span>
                              )}
                            </div>
                            <span className="mt-1.5 block truncate px-0.5 text-[11px] font-medium text-ink">
                              {item.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 rounded-3xl border border-line/80 bg-card p-5 lg:sticky lg:top-28">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              This look
            </p>
            <p className="mt-1.5 font-display text-2xl leading-tight text-ink">
              {pieceCountLabel(selectedItems.length)}
            </p>
          </div>

          {selectedItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-paper/50 px-3 py-5 text-center text-xs leading-5 text-muted">
              Nothing picked yet. Tap a piece to add it.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {selectedItems.slice(0, 8).map((item) => (
                <ItemThumbnail
                  key={item.id ?? item.createdAt}
                  item={item}
                  className="aspect-square rounded-lg border border-line"
                />
              ))}
              {selectedItems.length > 8 && (
                <span className="flex aspect-square items-center justify-center rounded-lg border border-line bg-paper/60 text-[11px] font-medium text-muted">
                  +{selectedItems.length - 8}
                </span>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || groups.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save outfit'}
          </button>

          <p className="text-[11px] leading-4 text-muted">
            Looks are stored in this browser, like the rest of your wardrobe.
          </p>
        </aside>
      </div>
    </form>
  )
}