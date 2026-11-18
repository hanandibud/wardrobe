import { Calendar, Check, LoaderCircle, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { db } from '../db'
import { pieceCountLabel, resolveOutfitItems } from '../lib/outfits'
import {
  OCCASION_LABELS,
  SEASON_LABELS,
  type Outfit,
  type WardrobeItem,
} from '../types'
import { ItemThumbnail } from './ItemThumbnail'

interface OutfitDetailProps {
  outfit: Outfit
  items: WardrobeItem[]
  onClose: () => void
  onRenamed: (name: string) => void
  onDelete: () => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function OutfitDetail({
  outfit,
  items,
  onClose,
  onRenamed,
  onDelete,
}: OutfitDetailProps) {
  const pieces = resolveOutfitItems(outfit, items)
  const missingCount = outfit.itemIds.length - pieces.length

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(outfit.name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      if (renaming) {
        setRenaming(false)
        setName(outfit.name)
        setError(null)
      } else {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [renaming, outfit.name, onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function startRenaming() {
    setName(outfit.name)
    setError(null)
    setRenaming(true)
  }

  function cancelRenaming() {
    setRenaming(false)
    setName(outfit.name)
    setError(null)
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give this look a name.')
      return
    }

    if (outfit.id === undefined) return

    setError(null)
    setSaving(true)

    try {
      await db.outfits.update(outfit.id, { name: trimmed })
      setRenaming(false)
      onRenamed(trimmed)
    } catch {
      setError('Could not rename that look. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (deleting || outfit.id === undefined) return

    setError(null)
    setDeleting(true)

    try {
      await db.outfits.delete(outfit.id)
      onDelete()
    } catch {
      setError('Could not remove that look. Try again.')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="outfit-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-line bg-card shadow-2xl animate-rise sm:rounded-3xl"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close outfit details"
          className="absolute right-4 top-4 z-10 rounded-full bg-card/90 p-2 text-muted shadow-sm backdrop-blur transition hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            Saved look
          </p>
          <h2
            id="outfit-dialog-title"
            className="mt-2 pr-12 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl"
          >
            {outfit.name}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Added {dateFormatter.format(new Date(outfit.createdAt))}
            </span>
            <span aria-hidden="true">·</span>
            <span>{OCCASION_LABELS[outfit.occasion]}</span>
          </p>

          <div className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Pieces
              </p>
              <span className="text-[11px] text-muted">
                {pieceCountLabel(pieces.length)}
              </span>
            </div>

            {pieces.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line bg-paper/50 px-4 py-6 text-center text-sm leading-6 text-muted">
                None of the pieces in this look are still in your wardrobe.
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {pieces.map((item) => (
                  <li
                    key={item.id ?? item.createdAt}
                    className="rounded-xl border border-line bg-paper/40 p-1.5"
                  >
                    <ItemThumbnail
                      item={item}
                      className="aspect-square rounded-lg"
                    />
                    <p className="truncate px-1 pt-1.5 text-[11px] text-ink">
                      {item.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {missingCount > 0 && (
              <p className="mt-2 text-[11px] leading-5 text-muted">
                {missingCount === 1
                  ? '1 saved piece is no longer in your wardrobe.'
                  : `${missingCount} saved pieces are no longer in your wardrobe.`}
              </p>
            )}
          </div>

          <div className="mt-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Seasons
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {outfit.seasons.map((season) => (
                <span
                  key={season}
                  className="rounded-full border border-line bg-paper/60 px-2.5 py-1 text-xs text-ink"
                >
                  {SEASON_LABELS[season]}
                </span>
              ))}
              {outfit.seasons.length === 0 && (
                <span className="text-xs text-muted">No seasons set</span>
              )}
            </div>
          </div>

          {renaming && (
            <form
              onSubmit={handleRename}
              className="mt-7 rounded-2xl border border-line bg-paper/40 p-4"
            >
              <label
                htmlFor="outfit-name-input"
                className="text-xs font-medium text-ink"
              >
                New name
              </label>
              <input
                id="outfit-name-input"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError(null)
                }}
                maxLength={80}
                autoFocus
                className="mt-2 h-11 w-full rounded-xl border border-line bg-card px-3.5 text-sm text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              {error && (
                <p
                  role="alert"
                  className="mt-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
                >
                  {error}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving ? 'Saving...' : 'Save name'}
                </button>
                <button
                  type="button"
                  onClick={cancelRenaming}
                  className="rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!renaming && error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
            >
              {error}
            </p>
          )}

          <div className="mt-8 border-t border-line/70 pt-5">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Remove this look?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {deleting ? 'Removing...' : 'Yes, remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-full border border-line px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink/30"
                >
                  Cancel
                </button>
              </div>
            ) : (
              !renaming && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={startRenaming}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove look
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}