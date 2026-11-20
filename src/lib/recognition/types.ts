import type { Category, Level, Season } from '../../types'
import type {
  Fit,
  Material,
  OccasionSuggestion,
  Pattern,
  Sleeve,
  Subcategory,
} from './vocab'

/**
 * Every attribute recognition can fill. `null` means "not recognized" and maps
 * to an empty or default form field, never to a guessed value.
 */
export interface RecognitionAttributes {
  nameSuggestion: string | null
  category: Category | null
  subcategory: Subcategory | null
  colors: string[]
  pattern: Pattern | null
  material: Material | null
  fit: Fit | null
  /** 1-5, aligned with the app's existing formality levels. */
  formality: Level | null
  /** 1-5, aligned with the app's existing warmth levels. */
  warmth: Level | null
  sleeve: Sleeve | null
  seasons: Season[]
  occasions: OccasionSuggestion[]
}

/** 0-1 confidence per attribute. Fields without a score default to 0. */
export interface RecognitionConfidence {
  category: number
  subcategory: number
  pattern: number
  material: number
  fit: number
  formality: number
  warmth: number
  sleeve: number
}

export type RecognitionField = keyof RecognitionConfidence

/** Form fields whose recognized value the user can reject from the panel. */
export type RecognitionClearField =
  | 'colors'
  | 'subcategory'
  | 'pattern'
  | 'material'
  | 'fit'
  | 'sleeve'
  | 'formality'
  | 'warmth'
  | 'seasons'
  | 'occasions'

export interface RecognitionResult {
  attributes: RecognitionAttributes
  confidence: RecognitionConfidence
  /** Identifier of the provider that produced this result. */
  provider: string
  /** Whether the result came from a vision model or the local heuristic. */
  source: 'ai' | 'heuristic'
}

/** The input every provider receives. Kept provider-agnostic on purpose. */
export interface RecognitionHint {
  image: Blob
}

/**
 * A swappable vision provider. Implementations must validate their own raw
 * response and resolve to a `RecognitionResult`, throwing only on a hard
 * failure (network, auth, malformed payload) so the client can fall back.
 */
export interface RecognitionProvider {
  readonly name: string
  /** Whether this provider is a vision model or the local heuristic. */
  readonly source: 'ai' | 'heuristic'
  recognize(
    hint: RecognitionHint,
    signal?: AbortSignal,
  ): Promise<RecognitionResult>
}

/** Confidence at or below this is surfaced in the UI as "not sure". */
export const LOW_CONFIDENCE = 0.6

/**
 * Whether a recognized value is weak enough to flag for review. A missing
 * result is not uncertain; there is simply nothing to review yet.
 */
export function isLowConfidence(
  result: RecognitionResult | null,
  field: RecognitionField,
): boolean {
  if (!result) return false
  return result.confidence[field] <= LOW_CONFIDENCE
}
