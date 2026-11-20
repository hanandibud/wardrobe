import { describe, expect, it } from 'vitest'
import { isLowConfidence, type RecognitionResult } from './types'

function resultWith(score: number): RecognitionResult {
  return {
    attributes: {
      nameSuggestion: null,
      category: 'top',
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
    },
    confidence: {
      category: score,
      subcategory: 0,
      pattern: 0,
      material: 0,
      fit: 0,
      formality: 0,
      warmth: 0,
      sleeve: 0,
    },
    provider: 'test',
    source: 'ai',
  }
}

describe('isLowConfidence', () => {
  it('flags a field at or below the review threshold', () => {
    expect(isLowConfidence(resultWith(0.6), 'category')).toBe(true)
    expect(isLowConfidence(resultWith(0.3), 'category')).toBe(true)
  })

  it('does not flag a reasonably confident field', () => {
    expect(isLowConfidence(resultWith(0.61), 'category')).toBe(false)
    expect(isLowConfidence(resultWith(0.9), 'category')).toBe(false)
  })

  it('returns false when there is no result to review', () => {
    expect(isLowConfidence(null, 'category')).toBe(false)
  })
})
