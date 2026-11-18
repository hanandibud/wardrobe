import { Ban, Heart, Palette, RotateCcw, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { nameColor } from '../lib/colors'
import {
  clearPreferences,
  CONTRAST_OPTIONS,
  defaultPreferences,
  hasPreferences,
  MAX_PREFERENCE_COLORS,
  normalizeHex,
  readPreferences,
  UNDERTONE_OPTIONS,
  wardrobePalette,
  writePreferences,
  type ColorPreferences,
  type Contrast,
  type PaletteColor,
  type Undertone,
} from '../lib/preferences'
import type { WardrobeItem } from '../types'

interface PalettePanelProps {
  items: WardrobeItem[]
}

type ColorListKey = 'lovedColors' | 'avoidColors'

interface SegmentedProps<T extends string> {
  legend: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {legend}
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-paper/60 p-1 sm:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={[
              'rounded-xl px-2 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              value === option.value
                ? 'bg-ink text-paper shadow-sm'
                : 'text-muted hover:bg-black/5 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

interface ColorPreferenceListProps {
  id: string
  legend: string
  hint: string
  emptyCopy: string
  initialColor: string
  colors: string[]
  onAdd: (hex: string) => void
  onRemove: (hex: string) => void
}

function ColorPreferenceList({
  id,
  legend,
  hint,
  emptyCopy,
  initialColor,
  colors,
  onAdd,
  onRemove,
}: ColorPreferenceListProps) {
  const [draft, setDraft] = useState(initialColor)
  const full = colors.length >= MAX_PREFERENCE_COLORS

  return (
    <fieldset className="min-w-0 rounded-2xl border border-line/80 bg-paper/40 p-4">
      <legend className="px-1 font-display text-xl tracking-tight text-ink">
        {legend}
      </legend>
      <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>

      {colors.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {colors.map((hex) => {
            const name = nameColor(hex)

            return (
              <li
                key={hex}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-1.5"
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-xs text-ink" title={hex}>
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(hex)}
                  aria-label={`Remove ${name} from ${legend.toLowerCase()}`}
                  className="rounded-full p-1 text-muted transition hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2 text-xs leading-5 text-muted">
          {emptyCopy}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={`${id}-color`}
          type="color"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Custom color for ${legend.toLowerCase()}`}
          className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-card p-1"
        />
        <button
          type="button"
          onClick={() => onAdd(draft)}
          disabled={full || normalizeHex(draft) === null}
          aria-label={`Add color to ${legend.toLowerCase()}`}
          className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add color
        </button>
        <span className="text-[11px] text-muted">
          {colors.length}/{MAX_PREFERENCE_COLORS}
        </span>
      </div>
    </fieldset>
  )
}

interface PaletteSwatchProps {
  entry: PaletteColor
  loved: boolean
  avoided: boolean
  onToggle: (list: ColorListKey, hex: string) => void
}

function PaletteSwatch({
  entry,
  loved,
  avoided,
  onToggle,
}: PaletteSwatchProps) {
  return (
    <li className="rounded-xl border border-line/80 bg-paper/60 p-2">
      <span
        aria-hidden="true"
        className="block h-9 rounded-lg border border-black/5"
        style={{ backgroundColor: entry.hex }}
      />
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink" title={entry.hex}>
            {entry.name}
          </p>
          <p className="text-[10px] text-muted">
            {entry.count} {entry.count === 1 ? 'piece' : 'pieces'}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => onToggle('lovedColors', entry.hex)}
            aria-label={`${loved ? 'Remove' : 'Love'} ${entry.name}`}
            aria-pressed={loved}
            title={loved ? 'Remove from loved colors' : 'Add to loved colors'}
            className={[
              'rounded-full p-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              loved
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-black/5 hover:text-ink',
            ].join(' ')}
          >
            <Heart
              className="h-3.5 w-3.5"
              strokeWidth={1.8}
              fill={loved ? 'currentColor' : 'none'}
            />
          </button>
          <button
            type="button"
            onClick={() => onToggle('avoidColors', entry.hex)}
            aria-label={`${avoided ? 'Stop avoiding' : 'Avoid'} ${entry.name}`}
            aria-pressed={avoided}
            title={avoided ? 'Remove from avoided colors' : 'Add to avoided colors'}
            className={[
              'rounded-full p-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              avoided
                ? 'bg-red-50 text-red-700'
                : 'text-muted hover:bg-black/5 hover:text-ink',
            ].join(' ')}
          >
            <Ban className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </li>
  )
}

interface PaletteStatus {
  tone: 'saved' | 'failed' | 'notice'
  message: string
}

const STORAGE_FAILED =
  'This browser blocked storage, so the choice may not survive a reload.'

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
      {children}
    </h3>
  )
}

export function PalettePanel({ items }: PalettePanelProps) {
  const [preferences, setPreferences] = useState<ColorPreferences>(() =>
    readPreferences(),
  )
  const [status, setStatus] = useState<PaletteStatus | null>(null)
  const palette = useMemo(() => wardrobePalette(items), [items])

  function commit(next: ColorPreferences) {
    const stamped = { ...next, updatedAt: Date.now() }
    setPreferences(stamped)
    setStatus(
      writePreferences(stamped)
        ? { tone: 'saved', message: 'Saved on this device.' }
        : { tone: 'failed', message: STORAGE_FAILED },
    )
  }

  function toggleColor(list: ColorListKey, hex: string) {
    const normalized = normalizeHex(hex)
    if (!normalized) return

    const other: ColorListKey =
      list === 'lovedColors' ? 'avoidColors' : 'lovedColors'
    const current = preferences[list]
    const adding = !current.includes(normalized)

    if (adding && current.length >= MAX_PREFERENCE_COLORS) {
      setStatus({
        tone: 'notice',
        message: 'That list is full. Remove a color first.',
      })
      return
    }

    const next = adding
      ? [...current, normalized]
      : current.filter((color) => color !== normalized)

    commit({
      ...preferences,
      [list]: next,
      [other]: preferences[other].filter((color) => color !== normalized),
    })
  }

  function addColor(list: ColorListKey, hex: string) {
    const normalized = normalizeHex(hex)
    if (!normalized) return

    const other: ColorListKey =
      list === 'lovedColors' ? 'avoidColors' : 'lovedColors'
    const current = preferences[list]
    const adding = !current.includes(normalized)

    if (adding && current.length >= MAX_PREFERENCE_COLORS) {
      setStatus({
        tone: 'notice',
        message: 'That list is full. Remove a color first.',
      })
      return
    }

    const next = adding ? [...current, normalized] : current

    commit({
      ...preferences,
      [list]: next,
      [other]: preferences[other].filter((color) => color !== normalized),
    })
  }

  function removeColor(list: ColorListKey, hex: string) {
    commit({
      ...preferences,
      [list]: preferences[list].filter((color) => color !== hex),
    })
  }

  function reset() {
    const cleared = clearPreferences()
    setPreferences(defaultPreferences())
    setStatus(
      cleared
        ? { tone: 'saved', message: 'Preferences cleared.' }
        : { tone: 'failed', message: STORAGE_FAILED },
    )
  }

  return (
    <section
      aria-labelledby="palette-heading"
      className="rounded-3xl border border-line bg-card p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Palette className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            The preferences
          </p>
          <h2
            id="palette-heading"
            className="mt-1 font-display text-3xl leading-none tracking-tight text-ink"
          >
            Your palette
          </h2>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
        Mark the colors you reach for and the ones you would rather skip. Picks
        lean toward your loves and away from your avoids. Tone and contrast are
        small tie-breakers, not a verdict about your skin.
      </p>

      <div className="mt-6">
        <SectionHeading>Colors in your wardrobe</SectionHeading>
        {palette.length > 0 ? (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {palette.map((entry) => (
              <PaletteSwatch
                key={entry.hex}
                entry={entry}
                loved={preferences.lovedColors.includes(entry.hex)}
                avoided={preferences.avoidColors.includes(entry.hex)}
                onToggle={toggleColor}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-5 text-muted">
            Add a piece and the colors from its photo will show up here. You can
            still set a tone, contrast, and custom colors below.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Segmented
          legend="Undertone"
          options={UNDERTONE_OPTIONS}
          value={preferences.undertone}
          onChange={(undertone: Undertone) =>
            commit({ ...preferences, undertone })
          }
        />
        <Segmented
          legend="Contrast"
          options={CONTRAST_OPTIONS}
          value={preferences.contrast}
          onChange={(contrast: Contrast) =>
            commit({ ...preferences, contrast })
          }
        />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">
        Warm or cool nudges picks toward that color family. Low or high
        contrast nudges toward that spread of light and dark. Neutral and Not
        sure leave the ranking alone.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ColorPreferenceList
          id="loved"
          legend="Colors you love"
          hint="These get a small lift when picks are ranked."
          emptyCopy="Tap a heart on the palette above, or add a custom color."
          initialColor="#6b6b3a"
          colors={preferences.lovedColors}
          onAdd={(hex) => addColor('lovedColors', hex)}
          onRemove={(hex) => removeColor('lovedColors', hex)}
        />
        <ColorPreferenceList
          id="avoid"
          legend="Colors to avoid"
          hint="These are quietly pushed down, not banned."
          emptyCopy="Tap a crossed circle on the palette above, or add a custom color."
          initialColor="#a83232"
          colors={preferences.avoidColors}
          onAdd={(hex) => addColor('avoidColors', hex)}
          onRemove={(hex) => removeColor('avoidColors', hex)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-line/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-muted">
          Stored in this browser only. Preferences are not part of a backup.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {status && (
            <p
              role={status.tone === 'failed' ? 'alert' : 'status'}
              className={
                status.tone === 'failed'
                  ? 'text-xs leading-5 text-red-800'
                  : 'text-xs leading-5 text-muted'
              }
            >
              {status.message}
            </p>
          )}
          {hasPreferences(preferences) && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
