import { describe, expect, it } from 'vitest'
import {
  applicableRecognitionPatch,
  recognitionPatch,
  savedFieldsToProtect,
  shouldAutoRecognizeOnPhotoChange,
  toStoredRecognitionFields,
} from './draft'
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
      name: 0.9,
      category: 0.9,
      subcategory: 0.8,
      colors: 0.4,
      pattern: 0.7,
      material: 0.5,
      fit: 0.6,
      formality: 0.75,
      warmth: 0.4,
      sleeve: 0.85,
      seasons: 0.5,
      occasions: 0.4,
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

  it('never applies AI colors, even when the provider returns them', () => {
    const patch = recognitionPatch(result({ colors: ['#ff0000'] }), new Set())
    expect('colors' in patch).toBe(false)
  })
})

describe('applicableRecognitionPatch', () => {
  it('drops a recognized category when a saved type locks the item', () => {
    const patch = applicableRecognitionPatch(result({ category: 'bottom', subcategory: 'jeans' }), {
      touched: new Set(['subcategory']),
      category: 'top',
      subcategory: 'shirt',
    })

    expect(patch.category).toBeUndefined()
    expect(patch.subcategory).toBeUndefined()
    expect(patch.material).toBe('cotton')
  })

  it('drops a subcategory that conflicts with the category that will apply', () => {
    const patch = applicableRecognitionPatch(
      result({ category: 'bottom', subcategory: 'shirt' }),
      {
        touched: new Set(),
        category: 'top',
        subcategory: '',
      },
    )

    expect(patch.category).toBe('bottom')
    expect(patch.subcategory).toBeUndefined()
  })

  it('keeps a consistent category and subcategory pair', () => {
    const patch = applicableRecognitionPatch(
      result({ category: 'bottom', subcategory: 'jeans' }),
      {
        touched: new Set(),
        category: 'top',
        subcategory: '',
      },
    )

    expect(patch.category).toBe('bottom')
    expect(patch.subcategory).toBe('jeans')
  })
})

describe('savedFieldsToProtect', () => {
  it('protects every saved field, including core wardrobe details', () => {
    const fields = savedFieldsToProtect({
      name: 'Saved shirt',
      category: 'bottom',
      colors: ['#112233'],
      subcategory: 'jeans',
      pattern: 'solid',
      material: 'denim',
      fit: 'regular',
      sleeve: 'long',
      occasions: ['everyday'],
      warmth: 4,
      formality: 2,
      seasons: ['autumn'],
    })

    expect([...fields].sort()).toEqual([
      'category',
      'colors',
      'fit',
      'formality',
      'material',
      'name',
      'occasions',
      'pattern',
      'seasons',
      'sleeve',
      'subcategory',
      'warmth',
    ])
  })

  it('leaves a new item completely open to recognition', () => {
    expect(savedFieldsToProtect(undefined).size).toBe(0)
  })

  it('leaves empty saved optional fields open to an explicit analysis', () => {
    const fields = savedFieldsToProtect({
      name: 'Saved top',
      category: 'top',
      colors: ['#112233'],
      warmth: 3,
      formality: 2,
      seasons: ['spring'],
    })

    // Core values and non-empty fields stay protected; a missing detail may be
    // filled after the user explicitly asks to analyze the photo.
    expect(fields.has('name')).toBe(true)
    expect(fields.has('category')).toBe(true)
    expect(fields.has('warmth')).toBe(true)
    expect(fields.has('formality')).toBe(true)
    expect(fields.has('seasons')).toBe(true)
    expect(fields.has('subcategory')).toBe(false)
    expect(fields.has('pattern')).toBe(false)
    expect(fields.has('material')).toBe(false)
    expect(fields.has('fit')).toBe(false)
    expect(fields.has('sleeve')).toBe(false)
    expect(fields.has('occasions')).toBe(false)
  })

  it('cannot apply any saved field when a photo is replaced or cut out', () => {
    const saved = {
      name: 'Saved shirt',
      category: 'bottom' as const,
      colors: ['#112233'],
      subcategory: 'jeans' as const,
      pattern: 'solid' as const,
      material: 'denim' as const,
      fit: 'regular' as const,
      sleeve: 'long' as const,
      occasions: ['everyday' as const],
      warmth: 4 as const,
      formality: 2 as const,
      seasons: ['autumn' as const],
    }

    expect(recognitionPatch(result(), savedFieldsToProtect(saved))).toEqual({})
    expect(applicableRecognitionPatch(result(), {
      touched: savedFieldsToProtect(saved),
      category: saved.category,
      subcategory: saved.subcategory,
    })).toEqual({})
  })

  it('does not auto-run recognition for a replacement photo or cutout in edit mode', () => {
    // Both the file picker and Cut out feed the new image through handleFile,
    // so this guard covers both entry points.
    expect(shouldAutoRecognizeOnPhotoChange(false)).toBe(true)
    expect(shouldAutoRecognizeOnPhotoChange(true)).toBe(false)
  })
})

describe('toStoredRecognitionFields', () => {
  it('keeps every key so a cleared value can be removed from IndexedDB', () => {
    const fields = toStoredRecognitionFields({
      subcategory: '',
      pattern: '',
      material: '',
      fit: '',
      sleeve: '',
      occasions: [],
    })

    expect(fields).toEqual({
      subcategory: undefined,
      pattern: undefined,
      material: undefined,
      fit: undefined,
      sleeve: undefined,
      occasions: undefined,
    })
    expect(Object.keys(fields).sort()).toEqual([
      'fit',
      'material',
      'occasions',
      'pattern',
      'sleeve',
      'subcategory',
    ])
  })

  it('saves the corrected values, not the original prediction', () => {
    // The user reviews a prediction of cotton and corrects it to wool, and
    // changes a guessed fit from regular to oversized.
    const stored = toStoredRecognitionFields(
      {
        subcategory: 'shirt',
        pattern: 'solid',
        material: 'wool',
        fit: 'oversized',
        sleeve: 'long',
        occasions: ['work'],
      },
      'top',
    )

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

  it('drops a subcategory that does not belong to the saved category', () => {
    const stored = toStoredRecognitionFields(
      {
        subcategory: 'shirt',
        pattern: 'solid',
        material: 'linen',
        fit: 'regular',
        sleeve: 'long',
        occasions: [],
      },
      'bottom',
    )

    expect(stored.subcategory).toBeUndefined()
    expect(stored.material).toBe('linen')
  })
})
