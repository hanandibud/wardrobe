import type {
  Category,
  Level,
  Season,
} from '../../types'
import type {
  RecognitionAttributes,
  RecognitionConfidence,
  RecognitionResult,
} from './types'
import {
  FIT_OPTIONS,
  MATERIAL_OPTIONS,
  OCCASION_SUGGESTION_OPTIONS,
  PATTERN_OPTIONS,
  SLEEVE_OPTIONS,
  SUBCATEGORY_CATEGORY,
  SUBCATEGORY_OPTIONS,
  type Fit,
  type Material,
  type OccasionSuggestion,
  type Pattern,
  type Sleeve,
  type Subcategory,
} from './vocab'

const CATEGORY_VALUES = new Set<string>([
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'accessory',
])
const SEASON_VALUES = new Set<string>(['spring', 'summer', 'autumn', 'winter'])

function stringSet(options: readonly { value: string }[]): Set<string> {
  return new Set(options.map((option) => option.value))
}

const SUBCATEGORY_VALUES = stringSet(SUBCATEGORY_OPTIONS)
const PATTERN_VALUES = stringSet(PATTERN_OPTIONS)
const MATERIAL_VALUES = stringSet(MATERIAL_OPTIONS)
const FIT_VALUES = stringSet(FIT_OPTIONS)
const SLEEVE_VALUES = stringSet(SLEEVE_OPTIONS)
const OCCASION_VALUES = stringSet(OCCASION_SUGGESTION_OPTIONS)

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Coerce a value to a vocabulary member, or null when it is not one. */
function oneOf<T extends string>(
  value: unknown,
  allowed: Set<string>,
): T | null {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : null
}

/** Coerce a list of strings to vocabulary members, dropping unknowns. */
function manyOf<T extends string>(
  value: unknown,
  allowed: Set<string>,
  max: number,
): T[] {
  if (!Array.isArray(value)) return []

  const picked: T[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    if (!allowed.has(entry)) continue
    if (picked.includes(entry as T)) continue
    picked.push(entry as T)
    if (picked.length >= max) break
  }
  return picked
}

function isLevel(value: unknown): value is Level {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/** Clamp any number into a 0-1 confidence score. Non-numeric becomes 0. */
function confidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function confidenceField(
  source: Record<string, unknown>,
  key: keyof RecognitionConfidence,
): number {
  return confidence(source[key])
}

/**
 * Normalize an external attribute payload into the shape the app trusts.
 *
 * This is the validation boundary between an AI response and saved data.
 * Unknown or unusable values become `null` / `[]` instead of a guessed value,
 * so a hallucinated material or category never reaches the database. Kept
 * pure so the whole contract can be tested without a network or a provider.
 */
export function normalizeAttributes(payload: unknown): RecognitionAttributes {
  const source = isRecord(payload) ? payload : {}

  const rawName = optionalString(source.name)
  const rawCategory = oneOf<Category>(source.category, CATEGORY_VALUES)

  // A subcategory is only kept when it belongs to the recognized category, so a
  // response cannot pair "jeans" with "top".
  const rawSubcategory = oneOf<Subcategory>(
    source.subcategory,
    SUBCATEGORY_VALUES,
  )
  const subcategory =
    rawCategory && rawSubcategory && subcategoryBelongsTo(rawSubcategory, rawCategory)
      ? rawSubcategory
      : null

  const colors = Array.isArray(source.colors)
    ? source.colors.filter(isHexColor).map((color) => color.toLowerCase())
    : []

  return {
    nameSuggestion: rawName ? rawName.slice(0, 80) : null,
    category: rawCategory,
    subcategory,
    colors: dedupe(colors).slice(0, 6),
    pattern: oneOf<Pattern>(source.pattern, PATTERN_VALUES),
    material: oneOf<Material>(source.material, MATERIAL_VALUES),
    fit: oneOf<Fit>(source.fit, FIT_VALUES),
    formality: isLevel(source.formality) ? source.formality : null,
    warmth: isLevel(source.warmth) ? source.warmth : null,
    sleeve: oneOf<Sleeve>(source.sleeve, SLEEVE_VALUES),
    seasons: manyOf<Season>(source.seasons, SEASON_VALUES, 4),
    occasions: manyOf<OccasionSuggestion>(
      source.occasions,
      OCCASION_VALUES,
      3,
    ),
  }
}

/** Every attribute the app cares about, with unknowns left blank. */
export function emptyAttributes(): RecognitionAttributes {
  return {
    nameSuggestion: null,
    category: null,
    subcategory: null,
    colors: [],
    pattern: null,
    material: null,
    fit: null,
    formality: null,
    warmth: null,
    sleeve: null,
    seasons: [],
    occasions: [],
  }
}

export function emptyConfidence(): RecognitionConfidence {
  return {
    category: 0,
    subcategory: 0,
    pattern: 0,
    material: 0,
    fit: 0,
    formality: 0,
    warmth: 0,
    sleeve: 0,
  }
}

/**
 * Validate and normalize a full provider response. Throws when the payload has
 * no usable signal at all, so the client can treat it as a failure and fall
 * back rather than saving a blank result.
 */
export function parseRecognitionResponse(
  payload: unknown,
  provider: string,
  source: 'ai' | 'heuristic',
): RecognitionResult {
  const raw = isRecord(payload) ? payload : {}
  // The bundled server function returns `{ attributes, confidence }` while a
  // flat provider response keeps the fields at the top level. Accept both so
  // the validation boundary does not depend on one transport shape.
  const attributeSource = isRecord(raw.attributes) ? raw.attributes : payload
  const attributes = normalizeAttributes(attributeSource)
  let rawConfidence: Record<string, unknown> = {}
  if (isRecord(raw.confidence)) {
    rawConfidence = raw.confidence
  } else if (isRecord(attributeSource) && isRecord(attributeSource.confidence)) {
    rawConfidence = attributeSource.confidence
  }

  const confidence: RecognitionConfidence = {
    category: confidenceField(rawConfidence, 'category'),
    subcategory: confidenceField(rawConfidence, 'subcategory'),
    pattern: confidenceField(rawConfidence, 'pattern'),
    material: confidenceField(rawConfidence, 'material'),
    fit: confidenceField(rawConfidence, 'fit'),
    formality: confidenceField(rawConfidence, 'formality'),
    warmth: confidenceField(rawConfidence, 'warmth'),
    sleeve: confidenceField(rawConfidence, 'sleeve'),
  }

  const hasSignal =
    attributes.category !== null ||
    attributes.subcategory !== null ||
    attributes.colors.length > 0 ||
    attributes.nameSuggestion !== null

  if (!hasSignal) {
    throw new Error('Recognition returned no usable attributes.')
  }

  return { attributes, confidence, provider, source }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

/** Whether a subcategory is consistent with the recognized main category. */
export function subcategoryBelongsTo(
  subcategory: Subcategory,
  category: Category,
): boolean {
  return SUBCATEGORY_CATEGORY[subcategory] === category
}
