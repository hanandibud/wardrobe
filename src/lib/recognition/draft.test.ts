import { describe, expect, it } from 'vitest'
import { recognitionPatch, toStoredRecognitionFields } from './draft'
import type { RecognitionResult } from './types'

function result(overrides: Partial<RecognitionResult['attributes']> = {}): RecognitionResult {
  return {
    attributes: {
      nameSuggestion: 'Black cotton tee',
      category: 'top',
      subcategory: 't-shirt',
      colors: ['#151515'],
      pattern: 'solid',
      material: 'cotton',
      fit: 'regular',
      formality: 2,
      warmth: 2,
      sleeve: 'short',
      seasons: ['spring', 'summer'],
      occasions: ['everyday'],
      ...overrides,
    },
    confidence: {
      category: 0.9,
      subcategory: 0.8,
      pattern: 0.7,
      material: 0.5,
      fit: 0.6,
      formality: 0.75,
      warmth: 0.4,
      sleeve: 0.85,
    },
    provider: 'test',
    source: 'ai',
  }
}

describe('recognitionPatch', () => {
  it('fills every field when nothing has been touched', () => {
    const patch = recognitionPatch(result(), new Set())

    expect(patch).toEqual({
      name: 'Black cotton tee',
      category: 'top',
      subcategory: 't-shirt',
      colors: ['#151515'],
      pattern: 'solid',
      material: 'cotton',
      fit: 'regular',
      warmth: 2,
      formality: 2,
      sleeve: 'short',
      seasons: ['spring', 'summer'],
      occasions: ['everyday'],
    })
  })

  it('never overwrites a field the user has touched', () => {
    const patch = recognitionPatch(
      result(),
      new Set(['name', 'category', 'material', 'occasions']),
    )

    expect(patch.name).toBeUndefined()
    expect(patch.category).toBeUndefined()
    expect(patch.material).toBeUndefined()
    expect(patch.occasions).toBeUndefined()
    // Untouched fields still fill.
    expect(patch.pattern).toBe('solid')
    expect(patch.fit).toBe('regular')
  })

  it('omits fields the provider did not recognize', () => {
    const patch = recognitionPatch(
      result({ nameSuggestion: null, material: null, pattern: null }),
      new Set(),
    )

    expect(patch.name).toBeUndefined()
    expect(patch.material).toBeUndefined()
    expect(patch.pattern).toBeUndefined()
    expect(patch.category).toBe('top')
  })

  it('never fills an empty color list', () => {
    const patch = recognitionPatch(result({ colors: [] }), new Set())
    expect(patch.colors).toBeUndefined()
  })
})

describe('toStoredRecognitionFields', () => {
  it('drops unset values instead of storing empty strings', () => {
    const fields = toStoredRecognitionFields({
      subcategory: '',
      pattern: '',
      material: '',
      fit: '',
      sleeve: '',
      occasions: [],
    })

    expect(fields).toEqual({})
  })

  it('saves the corrected values, not the original prediction', () => {
    // The user reviews a prediction of cotton and corrects it to wool, and
    // changes a guessed fit from regular to oversized.
    const stored = toStoredRecognitionFields({
      subcategory: 'shirt',
      pattern: 'solid',
      material: 'wool',
      fit: 'oversized',
      sleeve: 'long',
      occasions: ['work'],
    })

    expect(stored).toEqual({
      subcategory: 'shirt',
      pattern: 'solid',
      material: 'wool',
      fit: 'oversized',
      sleeve: 'long',
      occasions: ['work'],
    })
    expect(stored.material).toBe('wool')
    expect(stored.fit).toBe('oversized')
  })
})
