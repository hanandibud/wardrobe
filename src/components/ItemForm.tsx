import {
  Camera,
  Check,
  Crop,
  ImagePlus,
  Lock,
  Plus,
  RotateCcw,
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
import { useRecognition } from '../hooks/useRecognition'
import { isRemoteRecognitionEnabled } from '../lib/recognition/client'
import { extractPalette, nameColor } from '../lib/colors'
import { cutOutBackground, type CutoutProgress } from '../lib/cutout'
import { prepareImage, validateImageFile } from '../lib/images'
import { parsePrice } from '../lib/insights'
import { isQuotaError } from '../lib/storage'
import {
  FIT_OPTIONS,
  MATERIAL_OPTIONS,
  OCCASION_SUGGESTION_OPTIONS,
  PATTERN_OPTIONS,
  SLEEVE_OPTIONS,
  subcategoriesForCategory,
} from '../lib/recognition/vocab'
import { subcategoryBelongsTo } from '../lib/recognition/parse'
import {
  applicableRecognitionPatch,
  savedFieldsToProtect,
  shouldAutoRecognizeOnPhotoChange,
  toStoredRecognitionFields,
} from '../lib/recognition/draft'
import type {
  RecognitionClearField,
  RecognitionField,
  RecognitionResult,
} from '../lib/recognition/types'
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
import type {
  Fit,
  Material,
  OccasionSuggestion,
  Pattern,
  Sleeve,
  Subcategory,
} from '../lib/recognition/vocab'
import { CropDialog } from './CropDialog'
import { RecognitionPanel } from './RecognitionPanel'

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
  const remoteRecognition = isRemoteRecognitionEnabled()

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
  const [subcategory, setSubcategory] = useState<Subcategory | ''>(
    item?.subcategory ?? '',
  )
  const [pattern, setPattern] = useState<Pattern | ''>(item?.pattern ?? '')
  const [material, setMaterial] = useState<Material | ''>(item?.material ?? '')
  const [fit, setFit] = useState<Fit | ''>(item?.fit ?? '')
  const [sleeve, setSleeve] = useState<Sleeve | ''>(item?.sleeve ?? '')
  const [occasions, setOccasions] = useState<OccasionSuggestion[]>(
    item?.occasions ?? [],
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
  const [recognitionDismissed, setRecognitionDismissed] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const paletteRequest = useRef(0)
  const fileUrl = useObjectUrl(file)
  const existingImageUrl = useObjectUrl(item?.image)
  const previewUrl = fileUrl ?? existingImageUrl

  /**
   * Fields the user has touched, or that came from a saved item. Recognition
   * never overwrites one of these, so a retry or a cutout re-run cannot undo a
   * manual correction or wipe details loaded in edit mode. In edit mode every
   * saved field is protected, not just the recognition-only ones.
   */
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<string>>(
    () => savedFieldsToProtect(item),
  )

  function markTouched(field: string) {
    setTouchedFields((current) => {
      if (current.has(field)) return current
      const next = new Set(current)
      next.add(field)
      return next
    })
  }

  /**
   * Fill form fields from a recognition result, skipping anything the user has
   * already set and any subcategory the category rules reject. Recognition is a
   * starting point, never a correction, and it never touches colors: the local
   * palette is the measured source of truth.
   */
  function applyRecognition(next: RecognitionResult) {
    const patch = applicableRecognitionPatch(next, {
      touched: touchedFields,
      category,
      subcategory,
    })
    const nextCategory = patch.category ?? category

    if (patch.name) setName(patch.name)
    if (patch.category) setCategory(patch.category)
    if (patch.subcategory) {
      setSubcategory(patch.subcategory)
    } else if (
      subcategory &&
      !subcategoryBelongsTo(subcategory, nextCategory)
    ) {
      setSubcategory('')
    }
    if (patch.pattern) setPattern(patch.pattern)
    if (patch.material) setMaterial(patch.material)
    if (patch.fit) setFit(patch.fit)
    if (patch.sleeve) setSleeve(patch.sleeve)
    if (patch.warmth !== undefined) setWarmth(patch.warmth)
    if (patch.formality !== undefined) setFormality(patch.formality)
    if (patch.seasons) setSeasons(patch.seasons)
    if (patch.occasions) setOccasions(patch.occasions)
  }

  const recognition = useRecognition(applyRecognition)
  // What recognition actually contributed after the touched-field guard and the
  // category/subcategory consistency rules. The review card reads this, not the
  // raw provider result, so it never lists a guess the form deliberately kept.
  const recognitionDraft = recognition.result
    ? applicableRecognitionPatch(recognition.result, {
        touched: touchedFields,
        category,
        subcategory,
      })
    : null
  const hasAppliedRecognition =
    recognitionDraft !== null && Object.keys(recognitionDraft).length > 0
  const recognitionPanelVisible =
    recognition.state === 'ready' &&
    recognition.result !== null &&
    !recognitionDismissed &&
    (hasAppliedRecognition || recognition.warning !== null)

  async function handleFile(nextFile: File) {
    const validationError = validateImageFile(nextFile)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)

    // A new photo invalidates any analysis still in flight: its result would
    // describe a picture the user has already replaced. Abort it now, before
    // the palette work, so a slow response cannot fill this draft later.
    recognition.reset()
    paletteRequest.current += 1

    setFile(nextFile)
    setPaletteState('detecting')
    setCutoutState('idle')
    setCutoutError(null)
    setRecognitionDismissed(false)
    // Never show or save the previous photo's palette against the new image.
    setColors([])

    const request = paletteRequest.current + 1
    paletteRequest.current = request

    let palette: string[] | undefined
    try {
      palette = await extractPalette(nextFile)
      if (paletteRequest.current !== request) return
      setColors(palette)
      setPaletteState('ready')
    } catch {
      if (paletteRequest.current !== request) return
      setPaletteState('failed')
      setColors([])
      // Tell the heuristic not to decode the same failing photo again. An
      // empty palette is a valid local result; the user can add colors by hand.
      palette = []
    }

    // In edit mode recognition is an explicit action. Replacing a photo or
    // cutting out an existing item must not rewrite saved details on its own.
    if (shouldAutoRecognizeOnPhotoChange(isEditing)) {
      recognition.run(nextFile, { palette })
    }
  }

  /** Explicitly analyze the current photo, used in edit mode. */
  function analyzeCurrentPhoto() {
    const source = file ?? item?.image
    if (!source || recognition.state === 'working') return
    setRecognitionDismissed(false)
    recognition.run(source, { palette: colors })
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
    recognition.reset()
    // Only reset recognized fields when there is no saved item; in edit mode the
    // saved values were seeded from the item and must not be wiped.
    if (!isEditing) clearRecognizedFields()
  }

  /** Reset the recognition-only fields back to blank. */
  function clearRecognizedFields() {
    setSubcategory('')
    setPattern('')
    setMaterial('')
    setFit('')
    setSleeve('')
    setOccasions([])
  }

  /**
   * Reject one prediction from the review card. The field is marked touched, so
   * a later retry cannot bring the guess back, and the value returns to the
   * app's own default rather than silently keeping the prediction.
   */
  function clearRecognitionField(field: RecognitionClearField) {
    markTouched(field)
    switch (field) {
      case 'name':
        setName('')
        break
      case 'category':
        setCategory('top')
        if (subcategory && !subcategoryBelongsTo(subcategory, 'top')) {
          markTouched('subcategory')
          setSubcategory('')
        }
        break
      case 'subcategory':
        setSubcategory('')
        break
      case 'pattern':
        setPattern('')
        break
      case 'material':
        setMaterial('')
        break
      case 'fit':
        setFit('')
        break
      case 'sleeve':
        setSleeve('')
        break
      case 'formality':
        setFormality(2)
        break
      case 'warmth':
        setWarmth(3)
        break
      case 'seasons':
        setSeasons(SEASON_OPTIONS.map((option) => option.value))
        break
      case 'occasions':
        setOccasions([])
        break
    }
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
    markTouched('colors')
    setColors((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    )
  }

  function removeColor(color: string) {
    markTouched('colors')
    setColors((current) => current.filter((entry) => entry !== color))
  }

  function toggleSeason(season: Season) {
    markTouched('seasons')
    setSeasons((current) =>
      current.includes(season)
        ? current.filter((entry) => entry !== season)
        : [...current, season],
    )
  }

  function toggleOccasion(occasion: OccasionSuggestion) {
    markTouched('occasions')
    setOccasions((current) =>
      current.includes(occasion)
        ? current.filter((entry) => entry !== occasion)
        : [...current, occasion],
    )
  }

  /** Whether recognition's guess for this field was uncertain. */
  function isLowConfidence(field: RecognitionField): boolean {
    return recognition.isLowConfidence(field)
  }

  /**
   * A hint for a recognized field. Only mention a suggestion when recognition
   * actually produced an applied value. Confidence is the model's own estimate,
   * not a calibrated probability, so the label never says "Detected".
   */
  function recognizedHint(
    field: RecognitionField,
    hasValue: boolean,
    fallback: string,
  ): string {
    if (!hasValue) return fallback
    return isLowConfidence(field) ? 'Model estimate · check' : 'Model estimate'
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
    setTouchedFields(new Set())
    setRecognitionDismissed(false)
    paletteRequest.current += 1
    clearRecognizedFields()
    recognition.reset()
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
        // Recognition-only attributes. Blank becomes undefined so an item never
        // stores an empty string where "not set" is meant.
        ...toStoredRecognitionFields(
          {
            subcategory,
            pattern,
            material,
            fit,
            sleeve,
            occasions,
          },
          category,
        ),
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
                    className="rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {isEditing ? 'Replace photo' : 'Change photo'}
                  </button>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startCropCurrent}
                      aria-label="Crop photo"
                      className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-ink shadow-sm backdrop-blur transition hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Crop className="h-3.5 w-3.5" />
                      Crop
                    </button>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="rounded-full bg-card/90 px-3.5 py-2 text-xs font-medium text-muted shadow-sm backdrop-blur transition hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
              : remoteRecognition
                ? 'This photo is sent to the configured recognition service for analysis. You can still fill the form yourself.'
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

        {isEditing &&
          remoteRecognition &&
          previewUrl &&
          (recognition.state === 'idle' ||
            (recognition.state === 'ready' && !recognitionPanelVisible)) && (
            <button
              type="button"
              onClick={analyzeCurrentPhoto}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {recognition.state === 'ready' ? 'Analyze again' : 'Analyze photo'}
            </button>
          )}

        {isEditing &&
          remoteRecognition &&
          recognition.state === 'ready' &&
          recognition.result &&
          !hasAppliedRecognition &&
          !recognition.warning &&
          !recognitionDismissed && (
            <p className="mt-3 text-xs text-muted">
              No new details were applied. Saved values are unchanged.
            </p>
          )}

        {recognition.state === 'working' && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
            Analyzing the photo…
          </p>
        )}
        {recognition.state === 'failed' && (
          <div className="mt-3 space-y-2">
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900"
            >
              {recognition.error ?? 'Could not analyze that photo.'}
            </p>
            <button
              type="button"
              onClick={recognition.retry}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-ink transition hover:border-ink/30"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {recognition.state === 'ready' && recognition.result && recognitionDraft && !recognitionDismissed && (
          <RecognitionPanel
            result={recognition.result}
            patch={recognitionDraft}
            warning={recognition.warning}
            isLowConfidence={recognition.isLowConfidence}
            onRetry={recognition.retry}
            onDismiss={() => setRecognitionDismissed(true)}
            onClear={clearRecognitionField}
          />
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
            onChange={(event) => {
              markTouched('name')
              setName(event.target.value)
            }}
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
                  onClick={() => {
                    markTouched('category')
                    setCategory(option.value)
                    // A subcategory only makes sense inside its category, and
                    // clearing it is a user decision recognition must respect.
                    if (
                      subcategory &&
                      !subcategoryBelongsTo(subcategory, option.value)
                    ) {
                      markTouched('subcategory')
                      setSubcategory('')
                    }
                  }}
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

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Type"
            hint={recognizedHint(
              'subcategory',
              Boolean(recognitionDraft?.subcategory),
              'Optional',
            )}
          >
            <select
              value={subcategory}
              onChange={(event) => {
                markTouched('subcategory')
                setSubcategory(event.target.value as Subcategory | '')
              }}
              aria-label="Type"
              className={inputClass}
            >
              <option value="">Not set</option>
              {subcategoriesForCategory(category).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Pattern"
            hint={recognizedHint(
              'pattern',
              Boolean(recognitionDraft?.pattern),
              'Optional',
            )}
          >
            <select
              value={pattern}
              onChange={(event) => {
                markTouched('pattern')
                setPattern(event.target.value as Pattern | '')
              }}
              aria-label="Pattern"
              className={inputClass}
            >
              <option value="">Not set</option>
              {PATTERN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Material"
            hint={recognizedHint(
              'material',
              Boolean(recognitionDraft?.material),
              'If visible',
            )}
          >
            <select
              value={material}
              onChange={(event) => {
                markTouched('material')
                setMaterial(event.target.value as Material | '')
              }}
              aria-label="Material"
              className={inputClass}
            >
              <option value="">Not set</option>
              {MATERIAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Fit"
            hint={recognizedHint(
              'fit',
              Boolean(recognitionDraft?.fit),
              'Optional',
            )}
          >
            <select
              value={fit}
              onChange={(event) => {
                markTouched('fit')
                setFit(event.target.value as Fit | '')
              }}
              aria-label="Fit"
              className={inputClass}
            >
              <option value="">Not set</option>
              {FIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Sleeve"
            hint={recognizedHint(
              'sleeve',
              Boolean(recognitionDraft?.sleeve),
              'If it has sleeves',
            )}
          >
            <select
              value={sleeve}
              onChange={(event) => {
                markTouched('sleeve')
                setSleeve(event.target.value as Sleeve | '')
              }}
              aria-label="Sleeve length"
              className={inputClass}
            >
              <option value="">Not set</option>
              {SLEEVE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Suggested occasions"
          hint={
            recognitionDraft?.occasions?.length
              ? 'Model estimate, editable'
              : 'Optional'
          }
        >
          <div className="flex flex-wrap gap-2">
            {OCCASION_SUGGESTION_OPTIONS.map((option) => {
              const isActive = occasions.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleOccasion(option.value)}
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
        </Field>

        <Field label="Colors" hint="Measured locally from the photo">
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
                  className="rounded-full p-0.5 text-muted transition hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                  onClick={() => {
                    markTouched('warmth')
                    setWarmth(level)
                  }}
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
                  onClick={() => {
                    markTouched('formality')
                    setFormality(level)
                  }}
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
                className="rounded-full border border-line px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
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
