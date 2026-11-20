import type { Category, Level, Season } from '../../types'
import type { RecognitionResult } from './types'
import type {
  Fit,
  Material,
  OccasionSuggestion,
  Pattern,
  Sleeve,
  Subcategory,
} from './vocab'

/** The fields recognition can contribute to the form, before user edits. */
export interface RecognitionPatch {
  name?: string
  category?: Category
  subcategory?: Subcategory
  colors?: string[]
  pattern?: Pattern
  material?: Material
  fit?: Fit
  sleeve?: Sleeve
  warmth?: Level
  formality?: Level
  seasons?: Season[]
  occasions?: OccasionSuggestion[]
}

/**
 * The part of a recognition result that should fill the form.
 *
 * A field in `touched` is skipped, so recognition never overwrites a value the
 * user typed, a saved item loaded in edit mode, or an earlier correction. This
 * is the core "review, edit, confirm" rule expressed as pure data: the UI only
 * applies the returned patch, and the user always gets the final say.
 */
export function recognitionPatch(
  result: RecognitionResult,
  touched: ReadonlySet<string>,
): RecognitionPatch {
  const { attributes } = result
  const patch: RecognitionPatch = {}

  if (!touched.has('name') && attributes.nameSuggestion) {
    patch.name = attributes.nameSuggestion
  }
  if (!touched.has('category') && attributes.category) {
    patch.category = attributes.category
  }
  if (!touched.has('subcategory') && attributes.subcategory) {
    patch.subcategory = attributes.subcategory
  }
  if (!touched.has('colors') && attributes.colors.length > 0) {
    patch.colors = attributes.colors
  }
  if (!touched.has('pattern') && attributes.pattern) {
    patch.pattern = attributes.pattern
  }
  if (!touched.has('material') && attributes.material) {
    patch.material = attributes.material
  }
  if (!touched.has('fit') && attributes.fit) {
    patch.fit = attributes.fit
  }
  if (!touched.has('sleeve') && attributes.sleeve) {
    patch.sleeve = attributes.sleeve
  }
  if (!touched.has('warmth') && attributes.warmth !== null) {
    patch.warmth = attributes.warmth
  }
  if (!touched.has('formality') && attributes.formality !== null) {
    patch.formality = attributes.formality
  }
  if (!touched.has('seasons') && attributes.seasons.length > 0) {
    patch.seasons = attributes.seasons
  }
  if (!touched.has('occasions') && attributes.occasions.length > 0) {
    patch.occasions = attributes.occasions
  }

  return patch
}

/** A form value that may be unset, using `''` for the empty option. */
export interface RecognitionFormValues {
  subcategory: Subcategory | ''
  pattern: Pattern | ''
  material: Material | ''
  fit: Fit | ''
  sleeve: Sleeve | ''
  occasions: OccasionSuggestion[]
}

/**
 * Convert form values into the optional fields stored on an item. An unset
 * value becomes `undefined`, so "not set" never persists as an empty string.
 * Keeping this pure makes "the corrected value is what gets saved" testable.
 */
export function toStoredRecognitionFields(values: RecognitionFormValues): {
  subcategory?: Subcategory
  pattern?: Pattern
  material?: Material
  fit?: Fit
  sleeve?: Sleeve
  occasions?: OccasionSuggestion[]
} {
  const fields: ReturnType<typeof toStoredRecognitionFields> = {}

  if (values.subcategory) fields.subcategory = values.subcategory
  if (values.pattern) fields.pattern = values.pattern
  if (values.material) fields.material = values.material
  if (values.fit) fields.fit = values.fit
  if (values.sleeve) fields.sleeve = values.sleeve
  if (values.occasions.length > 0) fields.occasions = values.occasions

  return fields
}
