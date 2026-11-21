import { AlertTriangle, RotateCcw, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import type { RecognitionPatch } from '../lib/recognition/draft'
import type {
  RecognitionClearField,
  RecognitionField,
  RecognitionResult,
} from '../lib/recognition/types'
import {
  FIT_LABELS,
  MATERIAL_LABELS,
  OCCASION_SUGGESTION_LABELS,
  PATTERN_LABELS,
  SLEEVE_LABELS,
  SUBCATEGORY_LABELS,
} from '../lib/recognition/vocab'
import { CATEGORY_LABELS } from '../types'

const chipClass =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition'

const EMPTY_REJECTED_FIELDS: ReadonlySet<RecognitionClearField> = new Set()

/**
 * The "suggested from your photo" review card.
 *
 * Every value is already reflected in the editable form fields; this card only
 * reports what recognition actually applied, how confident the model claimed to
 * be, and which suggestions are uncertain. Dismissing the card hides the report
 * but never changes the form — nothing is auto-saved.
 *
 * Confidence is the model's self-reported estimate, not a calibrated
 * probability. The copy says so, and no row is ever labelled as verified.
 */
export function RecognitionPanel({
  result,
  patch,
  warning,
  isLowConfidence,
  onRetry,
  onDismiss,
  onClear,
}: {
  result: RecognitionResult
  patch: RecognitionPatch
  warning: string | null
  isLowConfidence: (field: RecognitionField) => boolean
  onRetry: () => void
  onDismiss: () => void
  onClear: (field: RecognitionClearField) => void
}) {
  const [rejected, setRejected] = useState<{
    result: RecognitionResult
    fields: ReadonlySet<RecognitionClearField>
  } | null>(null)

  // A new recognition run gets a fresh review. Tracking the result the
  // rejections belong to avoids an effect that resets state after render.
  const rejectedFields =
    rejected?.result === result
      ? rejected.fields
      : EMPTY_REJECTED_FIELDS

  function reject(field: RecognitionClearField) {
    setRejected((current) => {
      const fields = new Set(
        current?.result === result ? current.fields : EMPTY_REJECTED_FIELDS,
      )
      fields.add(field)
      return { result, fields }
    })
    onClear(field)
  }

  const rows = buildRows(patch, isLowConfidence).filter(
    (row) => !rejectedFields.has(row.field),
  )

  if (rows.length === 0 && !warning) return null

  const isAi = result.source === 'ai'

  return (
    <div className="mt-3 rounded-2xl border border-line/80 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {isAi
              ? 'Model suggestions from your photo'
              : 'Measured from your photo'}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            {isAi
              ? 'These are model estimates, not verified facts; confidence is the model’s own guess, not a calibrated probability. Reject or change anything wrong. Nothing is saved until you press Save.'
              : 'Measured locally from the photo. Reject or change anything wrong; nothing is saved until you press Save.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry recognition"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1.5 text-[11px] font-medium text-ink transition hover:border-ink/30"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss recognition details"
            className="rounded-full p-1 text-muted transition hover:bg-black/5 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {warning && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {warning}
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <li
            key={row.field}
            className={[
              chipClass,
              row.unsure
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-line bg-paper/60 text-ink',
            ].join(' ')}
          >
            <span className="text-muted">{row.label}</span>
            <span>{row.value}</span>
            {isAi && (
              <span className={row.unsure ? 'text-amber-700' : 'text-muted'}>
                · {row.unsure ? 'low confidence' : 'model estimate'}
              </span>
            )}
            <button
              type="button"
              onClick={() => reject(row.field)}
              aria-label={`Reject ${row.label} suggestion`}
              title="Reject this suggestion"
              className="ml-0.5 rounded-full p-0.5 text-muted transition hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface RecognitionRow {
  label: string
  value: string
  unsure: boolean
  field: RecognitionClearField
}

function buildRows(
  patch: RecognitionPatch,
  isLowConfidence: (field: RecognitionField) => boolean,
): RecognitionRow[] {
  const rows: RecognitionRow[] = []

  if (patch.name) {
    rows.push({
      label: 'Name',
      value: patch.name,
      unsure: isLowConfidence('name'),
      field: 'name',
    })
  }
  if (patch.category) {
    rows.push({
      label: 'Category',
      value: CATEGORY_LABELS[patch.category],
      unsure: isLowConfidence('category'),
      field: 'category',
    })
  }
  if (patch.subcategory) {
    rows.push({
      label: 'Type',
      value: SUBCATEGORY_LABELS[patch.subcategory],
      unsure: isLowConfidence('subcategory'),
      field: 'subcategory',
    })
  }
  if (patch.pattern) {
    rows.push({
      label: 'Pattern',
      value: PATTERN_LABELS[patch.pattern],
      unsure: isLowConfidence('pattern'),
      field: 'pattern',
    })
  }
  if (patch.material) {
    rows.push({
      label: 'Material',
      value: MATERIAL_LABELS[patch.material],
      unsure: isLowConfidence('material'),
      field: 'material',
    })
  }
  if (patch.fit) {
    rows.push({
      label: 'Fit',
      value: FIT_LABELS[patch.fit],
      unsure: isLowConfidence('fit'),
      field: 'fit',
    })
  }
  if (patch.sleeve) {
    rows.push({
      label: 'Sleeve',
      value: SLEEVE_LABELS[patch.sleeve],
      unsure: isLowConfidence('sleeve'),
      field: 'sleeve',
    })
  }
  if (patch.formality !== undefined) {
    rows.push({
      label: 'Formality',
      value: `${patch.formality}/5`,
      unsure: isLowConfidence('formality'),
      field: 'formality',
    })
  }
  if (patch.warmth !== undefined) {
    rows.push({
      label: 'Warmth',
      value: `${patch.warmth}/5`,
      unsure: isLowConfidence('warmth'),
      field: 'warmth',
    })
  }
  if (patch.seasons && patch.seasons.length > 0) {
    rows.push({
      label: 'Seasons',
      value: patch.seasons.join(', '),
      unsure: isLowConfidence('seasons'),
      field: 'seasons',
    })
  }
  if (patch.occasions && patch.occasions.length > 0) {
    rows.push({
      label: 'Occasions',
      value: patch.occasions
        .map((occasion) => OCCASION_SUGGESTION_LABELS[occasion])
        .join(', '),
      unsure: isLowConfidence('occasions'),
      field: 'occasions',
    })
  }

  return rows
}
