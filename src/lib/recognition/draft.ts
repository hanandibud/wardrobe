import type { Category, Level, Season, WardrobeItem } from '../../types'
import type { RecognitionResult } from './types'
import type {
  Fit,
  Material,
  OccasionSuggestion,
  Pattern,
  Sleeve,
  Subcategory,
} from './vocab'
import { subcategoryBelongsTo } from './parse'

/**
 * The fields recognition can contribute to the form, before user edits.
 *
 * Colors are deliberately absent: the locally measured palette is the source
 * of truth and recognition must never replace it.
 */
export interface RecognitionPatch {
  name?: string
  category?: Category
  subcategory?: Subcategory
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

/**
 * The part of a recognition result that can actually be applied given the
 * current form state. The panel reads this too, so it never reports a category
 * or subcategory that the consistency rules kept out of the form.
 */
export function applicableRecognitionPatch(
  result: RecognitionResult,
  context: {
    touched: ReadonlySet<string>
    category: Category
    subcategory: Subcategory | ''
  },
): RecognitionPatch {
  const patch = recognitionPatch(result, context.touched)
  const categoryLocked =
    context.touched.has('subcategory') && context.subcategory !== ''

  // A chosen type implies its category: recognition must not move the item to
  // a different category underneath it.
  if (categoryLocked) delete patch.category

  const nextCategory = patch.category ?? context.category
  if (
    patch.subcategory &&
    !subcategoryBelongsTo(patch.subcategory, nextCategory)
  ) {
    delete patch.subcategory
  }

  return patch
}

type SavedItemFields = Pick<
  WardrobeItem,
  | 'name'
  | 'category'
  | 'colors'
  | 'subcategory'
  | 'pattern'
  | 'material'
  | 'fit'
  | 'sleeve'
  | 'occasions'
  | 'warmth'
  | 'formality'
  | 'seasons'
>

/**
 * Every field already stored on an item. Recognition must skip all of them, so
 * replacing a photo or running Cut out cannot silently rewrite saved details.
 * Empty optional fields are not included: there is no saved value to protect.
 */
export function savedFieldsToProtect(
  item?: SavedItemFields,
): ReadonlySet<string> {
  const fields = new Set<string>()
  if (!item) return fields

  if (item.name) fields.add('name')
  fields.add('category')
  if (item.colors.length > 0) fields.add('colors')
  if (item.subcategory) fields.add('subcategory')
  if (item.pattern) fields.add('pattern')
  if (item.material) fields.add('material')
  if (item.fit) fields.add('fit')
  if (item.sleeve) fields.add('sleeve')
  if (item.occasions && item.occasions.length > 0) fields.add('occasions')
  if (item.warmth !== undefined) fields.add('warmth')
  if (item.formality !== undefined) fields.add('formality')
  if (item.seasons.length > 0) fields.add('seasons')

  return fields
}

/**
 * Recognition runs automatically only for a brand-new item. In edit mode it is
 * an explicit action, so replacing a photo or cutting out an existing item does
 * not apply predictions without the user asking.
 */
export function shouldAutoRecognizeOnPhotoChange(isEditing: boolean): boolean {
  return !isEditing
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

export interface StoredRecognitionFields {
  subcategory: Subcategory | undefined
  pattern: Pattern | undefined
  material: Material | undefined
  fit: Fit | undefined
  sleeve: Sleeve | undefined
  occasions: OccasionSuggestion[] | undefined
}

/**
 * Convert form values into the optional fields stored on an item.
 *
 * Every key is always present, with `undefined` for a cleared value. Dexie
 * deletes a property when `update` receives `undefined`, so clearing a field in
 * edit mode actually removes the old value instead of leaving it untouched. On
 * insert, undefined keys are inert. A category is optional so callers that do
 * not have one can still use the helper, but when supplied it also drops an
 * incompatible subcategory as a final consistency guard.
 */
export function toStoredRecognitionFields(
  values: RecognitionFormValues,
  category?: Category,
): StoredRecognitionFields {
  const subcategory =
    values.subcategory &&
    (!category || subcategoryBelongsTo(values.subcategory, category))
      ? values.subcategory
      : undefined

  return {
    subcategory,
    pattern: values.pattern || undefined,
    material: values.material || undefined,
    fit: values.fit || undefined,
    sleeve: values.sleeve || undefined,
    occasions: values.occasions.length > 0 ? values.occasions : undefined,
  }
}
