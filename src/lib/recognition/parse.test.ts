import { describe, expect, it } from 'vitest'
import {
  emptyAttributes,
  emptyConfidence,
  normalizeAttributes,
  parseRecognitionResponse,
  subcategoryBelongsTo,
} from './parse'
import type { RecognitionResult } from './types'

describe('normalizeAttributes', () => {
  it('fills every attribute from a complete response', () => {
    const attributes = normalizeAttributes({
      name: 'Olive linen camp shirt',
      category: 'top',
      subcategory: 'shirt',
      colors: ['#60704d', '#f6f3ee'],
      pattern: 'solid',
      material: 'linen',
      fit: 'regular',
      formality: 3,
      warmth: 2,
      sleeve: 'short',
      seasons: ['spring', 'summer'],
      occasions: ['everyday', 'smart'],
    })

    expect(attributes).toEqual({
      nameSuggestion: 'Olive linen camp shirt',
      category: 'top',
      subcategory: 'shirt',
      colors: ['#60704d', '#f6f3ee'],
      pattern: 'solid',
      material: 'linen',
      fit: 'regular',
      formality: 3,
      warmth: 2,
      sleeve: 'short',
      seasons: ['spring', 'summer'],
      occasions: ['everyday', 'smart'],
    })
  })

  it('returns blanks for a non-object payload', () => {
    expect(normalizeAttributes(null)).toEqual(emptyAttributes())
    expect(normalizeAttributes('garbage')).toEqual(emptyAttributes())
    expect(normalizeAttributes(42)).toEqual(emptyAttributes())
  })

  it('turns unknown vocabulary values into null instead of guessing', () => {
    const attributes = normalizeAttributes({
      category: 'spaceship',
      subcategory: 'warp-drive',
      pattern: 'plaid',
      material: 'unobtainium',
      fit: 'skin-tight',
      sleeve: 'tentacle',
    })

    expect(attributes.category).toBeNull()
    expect(attributes.subcategory).toBeNull()
    // Recognized values survive even when neighbours are unknown.
    expect(attributes.pattern).toBe('plaid')
    expect(attributes.material).toBeNull()
    expect(attributes.fit).toBeNull()
    expect(attributes.sleeve).toBeNull()
  })

  it('drops colors that are not six-digit hex', () => {
    const attributes = normalizeAttributes({
      colors: ['#60704d', 'olive', '#zzz', '#60704D', 'rgb(1,2,3)'],
    })

    expect(attributes.colors).toEqual(['#60704d'])
  })

  it('drops formality and warmth outside the 1-5 range', () => {
    const attributes = normalizeAttributes({ formality: 9, warmth: 0 })
    expect(attributes.formality).toBeNull()
    expect(attributes.warmth).toBeNull()
  })

  it('rejects a subcategory that does not match the category', () => {
    const attributes = normalizeAttributes({
      category: 'top',
      subcategory: 'jeans',
    })

    expect(attributes.subcategory).toBeNull()
  })

  it('keeps a subcategory that matches the category', () => {
    const attributes = normalizeAttributes({
      category: 'bottom',
      subcategory: 'jeans',
    })

    expect(attributes.subcategory).toBe('jeans')
  })

  it('caps colors at six and trims the name to 80 characters', () => {
    const longName = 'a'.repeat(200)
    const attributes = normalizeAttributes({
      name: longName,
      colors: Array.from({ length: 10 }, (_, i) => `#aa000${i}`),
    })

    expect(attributes.nameSuggestion).toHaveLength(80)
    expect(attributes.colors).toHaveLength(6)
  })

  it('ignores non-array seasons, occasions, and colors', () => {
    const attributes = normalizeAttributes({
      seasons: 'summer',
      occasions: 3,
      colors: '#60704d',
    })

    expect(attributes.seasons).toEqual([])
    expect(attributes.occasions).toEqual([])
    expect(attributes.colors).toEqual([])
  })
})

describe('parseRecognitionResponse', () => {
  it('returns a full result with clamped confidence values', () => {
    const result = parseRecognitionResponse(
      {
        category: 'shoes',
        subcategory: 'sneakers',
        colors: ['#151515'],
        confidence: {
          category: 0.95,
          subcategory: 0.4,
          material: 5,
          fit: -1,
        },
      },
      'test-provider',
      'ai',
    )

    expect(result.provider).toBe('test-provider')
    expect(result.source).toBe('ai')
    expect(result.attributes.category).toBe('shoes')
    expect(result.confidence.category).toBe(0.95)
    expect(result.confidence.subcategory).toBe(0.4)
    // Out-of-range confidence is clamped into 0-1.
    expect(result.confidence.material).toBe(1)
    expect(result.confidence.fit).toBe(0)
    // Attributes without a score default to 0.
    expect(result.confidence.warmth).toBe(0)
  })

  it('accepts the server function envelope', () => {
    const result = parseRecognitionResponse(
      {
        attributes: {
          category: 'top',
          subcategory: 'shirt',
          colors: ['#60704d'],
        },
        confidence: { category: 0.8, subcategory: 0.55 },
      },
      'openai-compatible',
      'ai',
    )

    expect(result.attributes.category).toBe('top')
    expect(result.attributes.subcategory).toBe('shirt')
    expect(result.confidence.category).toBe(0.8)
    expect(result.confidence.subcategory).toBe(0.55)
  })

  it('throws when the payload has no usable signal', () => {
    expect(() =>
      parseRecognitionResponse({ colors: [] }, 'p', 'ai'),
    ).toThrow(/no usable attributes/i)
    expect(() =>
      parseRecognitionResponse(emptyAttributes(), 'p', 'ai'),
    ).toThrow(/no usable attributes/i)
  })

  it('accepts a colors-only payload as a valid result', () => {
    const result = parseRecognitionResponse(
      { colors: ['#60704d'] },
      'heuristic',
      'heuristic',
    )

    expect(result.attributes.colors).toEqual(['#60704d'])
    expect(result.attributes.category).toBeNull()
    expect(result.confidence).toEqual(emptyConfidence())
  })

  it('never produces an unknown value it cannot map', () => {
    const result: RecognitionResult = parseRecognitionResponse(
      { category: 'top', material: 'spider-silk', pattern: 'nope' },
      'p',
      'ai',
    )

    expect(result.attributes.material).toBeNull()
    expect(result.attributes.pattern).toBeNull()
  })
})

describe('subcategoryBelongsTo', () => {
  it('maps subcategories to their main category', () => {
    expect(subcategoryBelongsTo('t-shirt', 'top')).toBe(true)
    expect(subcategoryBelongsTo('sneakers', 'shoes')).toBe(true)
    expect(subcategoryBelongsTo('blazer', 'outerwear')).toBe(true)
    expect(subcategoryBelongsTo('jeans', 'top')).toBe(false)
    expect(subcategoryBelongsTo('hat', 'accessory')).toBe(true)
  })
})
