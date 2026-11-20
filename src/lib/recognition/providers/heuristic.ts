import { extractPalette } from '../../colors'
import type { RecognitionHint, RecognitionProvider, RecognitionResult } from '../types'
import { emptyAttributes, emptyConfidence } from '../parse'

/**
 * The free, local, offline recognizer.
 *
 * It reuses the app's existing color extraction and nothing else, because that
 * is the only attribute pixels can tell you without a trained model. Every
 * other attribute stays blank rather than guessed — no invented material,
 * pattern, or fit. This is the default provider and the fallback whenever a
 * vision provider is unavailable, so the add flow never depends on a network
 * or a key.
 */
export const heuristicProvider: RecognitionProvider = {
  name: 'heuristic',
  source: 'heuristic',

  async recognize(hint: RecognitionHint): Promise<RecognitionResult> {
    const colors = await extractPalette(hint.image)

    // A blank palette is still a valid result: the caller keeps the form open
    // and the user types colors by hand. It is not treated as a hard failure.
    return {
      attributes: { ...emptyAttributes(), colors },
      confidence: { ...emptyConfidence() },
      provider: this.name,
      source: 'heuristic',
    }
  },
}
