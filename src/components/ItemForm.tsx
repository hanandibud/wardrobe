import {
  Camera,
  Check,
  Crop,
  ImagePlus,
  Lock,
  Plus,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react'
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { db } from '../db'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { extractPalette, nameColor } from '../lib/colors'
import { cutOutBackground, type CutoutProgress } from '../lib/cutout'
import { prepareImage, validateImageFile } from '../lib/images'
import { parsePrice } from '../lib/insights'
import { isQuotaError } from '../lib/storage'
import {
  CATEGORY_OPTIONS,
  FORMALITY_LABELS,
  LEVELS,
  SEASON_OPTIONS,
  STATUS_OPTIONS,
  WARMTH_LABELS,
  type Category,
  type ItemStatus,
  type Level,
  type Season,
  type WardrobeItem,
} from '../types'
import { CropDialog } from './CropDialog'

interface ItemFormProps {
  item?: WardrobeItem
  onSaved: () => void
  onCancel?: () => void
}

type PaletteState = 'idle' | 'detecting' | 'ready' | 'failed'
type CutoutState = 'idle' | 'working' | 'failed'

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-card px-3.5 text-sm text-ink placeholder:text-muted/60 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function ItemForm({ item, onSaved, onCancel }: ItemFormProps) {
  const isEditing = item !== undefined
  const formId = useId()

  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<Category>(item?.category ?? 'top')
  const [colors, setColors] = useState<string[]>(item?.colors ?? [])
  const [warmth, setWarmth] = useState<Level>(item?.warmth ?? 3)
  const [formality, setFormality] = useState<Level>(item?.formality ?? 2)
  const [seasons, setSeasons] = useState<Season[]>(
    item?.seasons ?? SEASON_OPTIONS.map((option) => option.value),
  )
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? 'clean')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [price, setPrice] = useState(
    item?.price !== undefined ? String(item.price) : '',
  )
  const [file, setFile] = useState<File | null>(null)
  const [cropSource, setCropSource] = useState<{
    blob: Blob
    name: string
  } | null>(null)
  const [customColor, setCustomColor] = useState('#8a6f5a')
  const [paletteState, setPaletteState] = useState<PaletteState>('idle')
  const [cutoutState, setCutoutState] = useState<CutoutState>('idle')
  const [cutoutProgress, setCutoutProgress] = useState<CutoutProgress | null>(null)
  const [cutoutError, setCutoutError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const paletteRequest = useRef(0)
  const fileUrl = useObjectUrl(file)
  const existingImageUrl = useObjectUrl(item?.image)
  const previewUrl = fileUrl ?? existingImageUrl

  async function handleFile(nextFile: File) {
    const validationError = validateImageFile(nextFile)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setFile(nextFile)
    setPaletteState('detecting')
    setCutoutState('idle')
    setCutoutError(null)

    const request = paletteRequest.current + 1
    paletteRequest.current = request

    try {
      const palette = await extractPalette(nextFile)
      if (paletteRequest.current !== request) return
      setColors(palette)
      setPaletteState('ready')
    } catch {
      if (paletteRequest.current !== request) return
      setPaletteState('failed')
      setColors([])
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    event.target.value = ''
    if (!nextFile) return

    const validationError = validateImageFile(nextFile)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setCropSource({ blob: nextFile, name: nextFile.name })
  }

  function startCropCurrent() {
    const source = file ?? item?.image
    if (!source) return

    setError(null)
    setCropSource({ blob: source, name: file?.name ?? 'wardrobe-photo.webp' })
  }

  function handleCropConfirm(cropped: File) {
    setCropSource(null)
    void handleFile(cropped)
  }

  function clearPhoto() {
    paletteRequest.current += 1
    setFile(null)
    setColors([])
    setPaletteState('idle')
    setCutoutState('idle')
    setCutoutProgress(null)
    setCutoutError(null)
  }

  async function handleRemoveBackground() {
    const source = file ?? item?.image
    if (!source || cutoutState === 'working') return

    setError(null)
    setCutoutError(null)
    setCutoutState('working')
    setCutoutProgress({ stage: 'Preparing the photo', percent: 0 })

    try {
      const cut = await cutOutBackground(source, setCutoutProgress)
      const base = file?.name.replace(/\.[^.]+$/, '') || 'wardrobe-photo'
      await handleFile(new File([cut], `${base}-cutout.png`, { type: 'image/png' }))
      setCutoutState('idle')
      setCutoutProgress(null)
    } catch {
      setCutoutState('failed')
      setCutoutProgress(null)
      setCutoutError(
        'Could not remove the background. The first cutout needs a connection to fetch the model, so check that and try again.',
      )
    }
  }

  function addColor(color: string) {
    const normalized = color.toLowerCase()
    setColors((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    )
  }

  function removeColor(color: string) {
    setColors((current) => current.filter((entry) => entry !== color))
  }

  function toggleSeason(season: Season) {
    setSeasons((current) =>
      current.includes(season)
        ? current.filter((entry) => entry !== season)
        : [...current, season],
    )
  }

  function resetForm() {
    setName('')
    setCategory('top')
    setColors([])
    setWarmth(3)
    setFormality(2)
    setSeasons(SEASON_OPTIONS.map((option) => option.value))
    setStatus('clean')
    setNotes('')
    setPrice('')
    setFile(null)
    setPaletteState('idle')
    setCutoutState('idle')
    setCutoutProgress(null)
    setCutoutError(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    if (!name.trim()) {
      setError('Give this piece a name.')
      return
    }

    if (!file && !item) {
      setError('Add a photo first.')
      return
    }

    const trimmedPrice = price.trim()
    let parsedPrice: number | undefined
    if (trimmedPrice !== '') {
      const parsed = parsePrice(trimmedPrice)
      if (parsed === null) {
        setError('Enter the price as a number, or leave it blank.')
        return
      }
      parsedPrice = parsed
    }

    setError(null)
    setSaving(true)

    try {
      const image = file ? await prepareImage(file) : item?.image
      if (!image) {
        setError('Add a photo first.')
        return
      }

      const changes = {
        name: name.trim(),
        category,
        colors,
        warmth,
        formality,
        seasons,
        status,
        notes: notes.trim() || undefined,
        price: parsedPrice,
        image,
      }

      if (isEditing && item?.id !== undefined) {
        await db.items.update(item.id, changes)
      } else {
        await db.items.add({ ...changes, createdAt: Date.now() })
        resetForm()
      }

      onSaved()
    } catch (error) {
      setError(
        isQuotaError(error)
          ? 'This browser is out of storage. Export a backup, remove a few pieces or free space, then try again.'
          : isEditing
            ? 'Could not save your changes. Try again.'
            : 'Could not save that photo. Try a different image.',
      )
    } finally {
      setSaving(false)
    }
  }

  const nameId = `${formId}-name`
  const notesId = `${formId}-notes`
  const priceId = `${formId}-price`
  const priceHintId = `${formId}-price-hint`

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
      <div className="lg:sticky lg:top-28">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="sr-only"
          tabIndex={-1}
        />

        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <div className="relative aspect-[4/5] bg-[radial-gradient(circle_at_50%_20%,#fffdf9,#e9e0d3)]">
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt={isEditing ? item.name : 'Selected garment'}
                  className="h-full w-full object-contain p-4"
                />
                <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-card"
                  >
                    {isEditing ? 'Replace photo' : 'Change photo'}
                  </button>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startCropCurrent}
                      aria-label="Crop photo"
                      className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-card"
                    >
                      <Crop className="h-3.5 w-3.5" />
                      Crop
                    </button>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-muted shadow-sm backdrop-blur transition hover:bg-card hover:text-ink"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center transition hover:bg-black/[0.02] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Camera className="h-6 w-6" strokeWidth={1.7} />
                </span>
                <span>
                  <span className="block font-display text-2xl text-ink">
                    Add a photo
                  </span>
                  <span className="mt-1 block max-w-xs text-xs leading-5 text-muted">
                    A flat lay on a plain background works best. Take one now or choose
                    from your library.
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-xs font-medium text-ink">
                  <ImagePlus className="h-4 w-4" />
                  Choose photo
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-line/70 px-4 py-3 text-xs text-muted">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            {isEditing
              ? 'A new photo replaces the saved one only when you save.'
              : 'Photos stay in this browser. Nothing is uploaded.'}
          </div>
        </div>

        {paletteState === 'detecting' && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
            Detecting the main colors…
          </p>
        )}
        {paletteState === 'failed' && (
          <p className="mt-3 text-xs text-muted">
            Could not detect colors. Add them manually below.
          </p>
        )}

        {previewUrl && (
          <div className="mt-3 rounded-2xl border border-line/80 bg-card p-4">
            {cutoutState === 'working' ? (
              <div>
                <p className="flex items-center gap-2 text-xs font-medium text-ink">
                  <Scissors className="h-3.5 w-3.5 animate-pulse text-accent" />
                  <span>{cutoutProgress?.stage ?? 'Removing the background'}…</span>
                  <span className="ml-auto font-normal tabular-nums text-muted">
                    {cutoutProgress?.percent ?? 0}%
                  </span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${cutoutProgress?.percent ?? 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-4 text-muted">
                  The model runs in this browser. The first cutout downloads it, so it
                  can take a moment.
                </p>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-ink">Remove background</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted">
                    Cuts the piece out on a transparent background and keeps only its
                    colors.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveBackground()}
                  disabled={paletteState === 'detecting'}
                  aria-label="Remove background"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  {cutoutState === 'failed' ? 'Retry' : 'Cut out'}
                </button>
              </div>
            )}

            {cutoutState === 'failed' && cutoutError && (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-800"
              >
                {cutoutError}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-3xl border border-line/80 bg-card p-5 sm:p-7"
      >
        <div className="space-y-2">
          <label htmlFor={nameId} className="text-sm font-medium text-ink">
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Olive linen shirt"
            maxLength={80}
            className={inputClass}
          />
        </div>

        <Field label="Category" hint="Required">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Category">
            {CATEGORY_OPTIONS.map((option) => {
              const isActive = category === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  aria-pressed={isActive}
                  className={[
                    'rounded-xl border px-2 py-2.5 text-xs font-medium transition',
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
        </Field>

        <Field label="Colors" hint="Detected from the photo">
          <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/50 p-2">
            {colors.map((color, index) => (
              <span
                key={`${color}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-1.5 text-[11px]"
              >
                <span
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted">{nameColor(color)}</span>
                <button
                  type="button"
                  onClick={() => removeColor(color)}
                  aria-label={`Remove ${nameColor(color)}`}
                  className="rounded-full p-0.5 text-muted transition hover:bg-black/5 hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            {colors.length === 0 && (
              <span className="px-1 text-xs text-muted">
                No colors yet. Add one below.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-xs font-medium text-ink transition hover:border-ink/30">
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: customColor }}
              />
              Pick a color
              <input
                type="color"
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
                className="sr-only"
                tabIndex={-1}
              />
            </label>
            <button
              type="button"
              onClick={() => addColor(customColor)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {nameColor(customColor)}
            </button>
            <span className="font-mono text-[11px] uppercase text-muted">
              {customColor}
            </span>
          </div>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Warmth" hint={WARMTH_LABELS[warmth]}>
            <div className="flex gap-1.5" role="group" aria-label="Warmth">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setWarmth(level)}
                  aria-pressed={warmth === level}
                  aria-label={`Warmth ${level}: ${WARMTH_LABELS[level]}`}
                  className={[
                    'h-10 flex-1 rounded-xl border text-sm font-medium transition',
                    level <= warmth
                      ? 'border-accent bg-accent text-paper'
                      : 'border-line bg-card text-muted hover:border-ink/30',
                    warmth === level
                      ? 'ring-2 ring-accent/25 ring-offset-1 ring-offset-card'
                      : '',
                  ].join(' ')}
                >
                  {level}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Formality" hint={FORMALITY_LABELS[formality]}>
            <div className="flex gap-1.5" role="group" aria-label="Formality">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormality(level)}
                  aria-pressed={formality === level}
                  aria-label={`Formality ${level}: ${FORMALITY_LABELS[level]}`}
                  className={[
                    'h-10 flex-1 rounded-xl border text-sm font-medium transition',
                    level <= formality
                      ? 'border-forest bg-forest text-paper'
                      : 'border-line bg-card text-muted hover:border-ink/30',
                    formality === level
                      ? 'ring-2 ring-forest/25 ring-offset-1 ring-offset-card'
                      : '',
                  ].join(' ')}
                >
                  {level}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Seasons" hint="Pick all that apply">
          <div className="flex flex-wrap gap-2">
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
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Availability" hint="Used later for outfit suggestions">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-paper/50 p-1">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                aria-pressed={status === option.value}
                className={[
                  'rounded-lg px-2 py-2 text-xs font-medium transition',
                  status === option.value
                    ? 'bg-card text-ink shadow-sm'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="space-y-2">
          <label htmlFor={priceId} className="text-sm font-medium text-ink">
            Price paid <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={priceId}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 48"
            aria-describedby={priceHintId}
            className={inputClass}
          />
          <p id={priceHintId} className="text-[11px] leading-5 text-muted">
            In the currency you use for your wardrobe. Only used for cost per
            wear.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor={notesId} className="text-sm font-medium text-ink">
            Notes <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Fit, fabric, care, or anything you want to remember."
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-line/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            {isEditing
              ? 'Changes are saved in this browser.'
              : 'You can edit details later.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="rounded-full border border-line px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? 'Saving…'
                : isEditing
                  ? 'Save changes'
                  : 'Save to wardrobe'}
              {!saving && <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </div>

      {cropSource && (
        <CropDialog
          blob={cropSource.blob}
          fileName={cropSource.name}
          onCancel={() => setCropSource(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  )
}
