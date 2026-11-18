import { Check, LoaderCircle, X } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react'
import { useObjectUrl } from '../hooks/useObjectUrl'
import {
  clampCrop,
  cropImageToFile,
  defaultCrop,
  fitRect,
  resizeCrop,
  type CropHandle,
  type Rect,
  type Size,
} from '../lib/crop'

interface CropDialogProps {
  blob: Blob
  fileName: string
  onCancel: () => void
  onConfirm: (file: File) => void
}

type AspectKey = 'free' | '1:1' | '4:5' | '3:4'

const ASPECTS: { key: AspectKey; label: string; ratio?: number }[] = [
  { key: 'free', label: 'Free' },
  { key: '1:1', label: 'Square', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
]

const HANDLES: { key: CropHandle; className: string }[] = [
  { key: 'nw', className: '-left-2 -top-2 cursor-nwse-resize' },
  { key: 'ne', className: '-right-2 -top-2 cursor-nesw-resize' },
  { key: 'sw', className: '-left-2 -bottom-2 cursor-nesw-resize' },
  { key: 'se', className: '-right-2 -bottom-2 cursor-nwse-resize' },
]

const MIN_CROP = 48

/** Breathing room so corner handles never sit on the clipped stage edge. */
const STAGE_PADDING = 18

type DragState =
  | { mode: 'move'; startX: number; startY: number; crop: Rect }
  | { mode: 'resize'; handle: CropHandle; startX: number; startY: number; crop: Rect }

export function CropDialog({
  blob,
  fileName,
  onCancel,
  onConfirm,
}: CropDialogProps) {
  const url = useObjectUrl(blob)
  const [image, setImage] = useState<Size | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [aspect, setAspect] = useState<AspectKey>('free')
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return

    function update() {
      if (!element) return
      const rect = element.getBoundingClientRect()
      setStage({ width: rect.width, height: rect.height })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fit = useMemo(() => {
    if (!image || stage.width <= 0 || stage.height <= 0) return null

    const inner = fitRect(image, {
      width: Math.max(1, stage.width - STAGE_PADDING * 2),
      height: Math.max(1, stage.height - STAGE_PADDING * 2),
    })

    return {
      x: inner.x + STAGE_PADDING,
      y: inner.y + STAGE_PADDING,
      width: inner.width,
      height: inner.height,
    }
  }, [image, stage])

  const scale = fit && image ? fit.width / image.width : 1
  const ratio = ASPECTS.find((entry) => entry.key === aspect)?.ratio

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const element = event.currentTarget
    const size = { width: element.naturalWidth, height: element.naturalHeight }
    setImage(size)
    setCrop((current) => current ?? defaultCrop(size))
  }

  function chooseAspect(next: AspectKey) {
    setAspect(next)
    const nextRatio = ASPECTS.find((entry) => entry.key === next)?.ratio

    setCrop((current) => {
      if (!image) return current
      const base = current ?? defaultCrop(image, nextRatio)
      const target = defaultCrop(image, nextRatio)
      // Keep the current top-left corner when it still fits.
      return clampCrop(
        {
          x: Math.min(base.x, Math.max(0, image.width - target.width)),
          y: Math.min(base.y, Math.max(0, image.height - target.height)),
          width: target.width,
          height: target.height,
        },
        image,
        MIN_CROP,
      )
    })
  }

  function startMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      mode: 'move',
      startX: event.clientX,
      startY: event.clientY,
      crop,
    }
  }

  function moveCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state || state.mode !== 'move' || !image) return

    const dx = (event.clientX - state.startX) / scale
    const dy = (event.clientY - state.startY) / scale

    setCrop(
      clampCrop(
        { ...state.crop, x: state.crop.x + dx, y: state.crop.y + dy },
        image,
        MIN_CROP,
      ),
    )
  }

  function startResize(
    event: ReactPointerEvent<HTMLSpanElement>,
    handle: CropHandle,
  ) {
    if (!crop) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      mode: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      crop,
    }
  }

  function resize(event: ReactPointerEvent<HTMLSpanElement>) {
    const state = drag.current
    if (!state || state.mode !== 'resize' || !image) return

    const dx = (event.clientX - state.startX) / scale
    const dy = (event.clientY - state.startY) / scale

    setCrop(resizeCrop(state.crop, state.handle, dx, dy, image, ratio, MIN_CROP))
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  async function handleApply() {
    if (!crop || busy) return

    setBusy(true)
    setError(null)

    try {
      const base = fileName.replace(/\.[^.]+$/, '') || 'photo'
      onConfirm(await cropImageToFile(blob, crop, `${base}-crop.webp`))
    } catch {
      setError('Could not crop that photo. Try again.')
      setBusy(false)
    }
  }

  const cropStyle =
    fit && crop
      ? {
          left: fit.x + crop.x * scale,
          top: fit.y + crop.y * scale,
          width: crop.width * scale,
          height: crop.height * scale,
        }
      : undefined

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6 animate-fade-in"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-line bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-7 animate-rise"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel cropping"
          className="absolute right-4 top-4 z-10 rounded-full bg-card/90 p-2 text-muted shadow-sm backdrop-blur transition hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
          Crop
        </p>
        <h2
          id="crop-title"
          className="mt-2 font-display text-3xl leading-tight tracking-tight text-ink"
        >
          Frame the piece
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Drag the frame to move it, or pull a corner to resize. Cropping keeps the
          photo focused, which makes the color extraction more accurate.
        </p>

        <div
          role="group"
          aria-label="Crop shape"
          className="mt-5 flex flex-wrap gap-2"
        >
          {ASPECTS.map((option) => {
            const isActive = aspect === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => chooseAspect(option.key)}
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

        <div
          ref={stageRef}
          className="relative mt-4 w-full touch-none overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_50%_20%,#fffdf9,#e9e0d3)]"
          style={{ height: 'min(56vh, 420px)' }}
        >
          {url ? (
            <img
              src={url}
              alt="Photo to crop"
              onLoad={handleImageLoad}
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={
                fit
                  ? {
                      left: fit.x,
                      top: fit.y,
                      width: fit.width,
                      height: fit.height,
                    }
                  : { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'contain' }
              }
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-muted">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </span>
          )}

          {cropStyle && (
            <div
              className="absolute cursor-move touch-none border-2 border-paper shadow-[0_0_0_9999px_rgba(24,20,18,0.45)]"
              style={cropStyle}
              onPointerDown={startMove}
              onPointerMove={moveCrop}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {HANDLES.map((handle) => (
                <span
                  key={handle.key}
                  onPointerDown={(event) => startResize(event, handle.key)}
                  onPointerMove={resize}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={[
                    'absolute h-3.5 w-3.5 touch-none rounded-full border-2 border-ink bg-paper',
                    handle.className,
                  ].join(' ')}
                />
              ))}
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Cropping happens in this browser. The original is never uploaded.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={busy || !crop}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Cropping...' : 'Use this crop'}
              {!busy && <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
