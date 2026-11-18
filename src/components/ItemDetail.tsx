import { Calendar, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { nameColor } from '../lib/colors'
import { formatAmount } from '../lib/insights'
import {
  CATEGORY_LABELS,
  FORMALITY_LABELS,
  LEVELS,
  SEASON_OPTIONS,
  STATUS_OPTIONS,
  WARMTH_LABELS,
  type ItemStatus,
  type Level,
  type WardrobeItem,
} from '../types'
import { ItemForm } from './ItemForm'

interface ItemDetailProps {
  item: WardrobeItem
  onClose: () => void
  onStatusChange: (status: ItemStatus) => void
  onEditSaved: () => void
  onDelete: () => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatDate(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp))
}

function Meter({
  label,
  value,
  labels,
  fillClass,
}: {
  label: string
  value: Level
  labels: Record<Level, string>
  fillClass: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-ink">{labels[value]}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {LEVELS.map((level) => (
          <span
            key={level}
            className={[
              'h-1.5 flex-1 rounded-full',
              level <= value ? fillClass : 'bg-line/70',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  )
}

export function ItemDetail({
  item,
  onClose,
  onStatusChange,
  onEditSaved,
  onDelete,
}: ItemDetailProps) {
  const imageUrl = useObjectUrl(item.image)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      if (editing) {
        setEditing(false)
      } else {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editing, onClose])

  const selectedSeasons = SEASON_OPTIONS.filter((option) =>
    item.seasons.includes(option.value),
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className={[
          'relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-card shadow-2xl sm:rounded-3xl animate-rise',
          editing ? 'max-w-5xl' : 'max-w-4xl',
        ].join(' ')}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => {
            if (editing) {
              setEditing(false)
            } else {
              onClose()
            }
          }}
          aria-label={editing ? 'Cancel editing' : 'Close item details'}
          className="absolute right-4 top-4 z-10 rounded-full bg-card/90 p-2 text-muted shadow-sm backdrop-blur transition hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-5 w-5" />
        </button>

        {editing ? (
          <div className="p-5 sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
              Editing
            </p>
            <h2
              id="item-dialog-title"
              className="mt-2 font-display text-3xl leading-tight tracking-tight text-ink"
            >
              Edit this piece
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Update any detail, or replace the photo. Nothing leaves this browser.
            </p>

            <div className="mt-7">
              <ItemForm
                item={item}
                onSaved={() => {
                  setEditing(false)
                  onEditSaved()
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </div>
        ) : (
        <div className="grid md:grid-cols-[1.05fr_0.95fr]">
          <div className="relative flex min-h-[300px] items-center justify-center bg-[radial-gradient(circle_at_50%_20%,#fffdf9,#e9e0d3)] p-6 md:min-h-[560px]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.name}
                className="max-h-[45vh] w-full object-contain md:max-h-[70vh]"
              />
            ) : (
              <span className="text-sm text-muted">No photo</span>
            )}
            <span className="absolute left-5 top-5 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted backdrop-blur">
              {CATEGORY_LABELS[item.category]}
            </span>
          </div>

          <div className="flex flex-col p-6 sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
              Wardrobe piece
            </p>
            <h2
              id="item-dialog-title"
              className="mt-2 font-display text-3xl leading-tight tracking-tight text-ink"
            >
              {item.name}
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Calendar className="h-3.5 w-3.5" />
              Added {formatDate(item.createdAt)}
            </p>
            {item.price !== undefined && (
              <p className="mt-1 text-xs tabular-nums text-muted">
                Price paid · {formatAmount(item.price)}
              </p>
            )}

            <div className="mt-6 space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Colors
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.colors.map((color, index) => (
                    <span
                      key={`${color}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-paper/60 px-2 py-1 text-xs text-ink"
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                      {nameColor(color)}
                    </span>
                  ))}
                  {item.colors.length === 0 && (
                    <span className="text-xs text-muted">None recorded</span>
                  )}
                </div>
              </div>

              <Meter
                label="Warmth"
                value={item.warmth}
                labels={WARMTH_LABELS}
                fillClass="bg-accent"
              />
              <Meter
                label="Formality"
                value={item.formality}
                labels={FORMALITY_LABELS}
                fillClass="bg-forest"
              />

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Seasons
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedSeasons.map((season) => (
                    <span
                      key={season.value}
                      className="rounded-full border border-line bg-paper/60 px-2.5 py-1 text-xs text-ink"
                    >
                      {season.label}
                    </span>
                  ))}
                  {selectedSeasons.length === 0 && (
                    <span className="text-xs text-muted">Not set</span>
                  )}
                </div>
              </div>

              {item.notes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Notes
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink/80">{item.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-line/70 pt-5">
              <p className="text-xs font-medium text-ink">Availability</p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-line bg-paper/50 p-1">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onStatusChange(option.value)}
                    aria-pressed={item.status === option.value}
                    className={[
                      'rounded-lg px-2 py-2 text-xs font-medium transition',
                      item.status === option.value
                        ? 'bg-card text-ink shadow-sm'
                        : 'text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto pt-8">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Remove this piece?</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-full bg-red-700 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-red-800"
                  >
                    Yes, remove
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove from wardrobe
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
