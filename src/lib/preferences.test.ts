import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WardrobeItem } from '../types'
import {
  clearPreferences,
  contrastLevel,
  defaultPreferences,
  dominantTemperature,
  hasPreferences,
  matchesAnyColor,
  MAX_PREFERENCE_COLORS,
  normalizeHex,
  parsePreferences,
  preferenceSummary,
  PREFERENCES_KEY,
  readPreferences,
  wardrobePalette,
  writePreferences,
} from './preferences'

function item(
  id: number,
  colors: string[],
  overrides: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id,
    name: `Piece ${id}`,
    category: 'top',
    colors,
    warmth: 3,
    formality: 2,
    seasons: [],
    status: 'clean',
    image: new Blob(),
    createdAt: id,
    ...overrides,
  }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

const basePreferences = {
  undertone: 'unsure' as const,
  contrast: 'unsure' as const,
  lovedColors: [],
  avoidColors: [],
  updatedAt: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeHex', () => {
  it('accepts with or without the hash and lower-cases', () => {
    expect(normalizeHex('#6B6B3A')).toBe('#6b6b3a')
    expect(normalizeHex(' 6b6b3a ')).toBe('#6b6b3a')
  })

  it('rejects anything that is not a six-digit hex color', () => {
    expect(normalizeHex('olive')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('#1234567')).toBeNull()
    expect(normalizeHex(12)).toBeNull()
    expect(normalizeHex(null)).toBeNull()
  })
})

describe('parsePreferences', () => {
  it('falls back to the defaults for missing or broken input', () => {
    expect(parsePreferences(null)).toEqual(defaultPreferences())
    expect(parsePreferences('warm')).toEqual(defaultPreferences())
    expect(parsePreferences([])).toEqual(defaultPreferences())
  })

  it('keeps valid fields and normalizes colors', () => {
    const result = parsePreferences({
      undertone: 'warm',
      contrast: 'high',
      lovedColors: ['#6B6B3A', 'olive', '#6b6b3a'],
      avoidColors: ['#A83232'],
      updatedAt: 1763500000000,
    })

    expect(result.undertone).toBe('warm')
    expect(result.contrast).toBe('high')
    expect(result.lovedColors).toEqual(['#6b6b3a'])
    expect(result.avoidColors).toEqual(['#a83232'])
    expect(result.updatedAt).toBe(1763500000000)
  })

  it('does not let a color be both loved and avoided', () => {
    const result = parsePreferences({
      lovedColors: ['#6b6b3a'],
      avoidColors: ['#6B6B3A'],
    })

    expect(result.lovedColors).toEqual([])
    expect(result.avoidColors).toEqual(['#6b6b3a'])
  })

  it('turns unknown tones and contrast values into “not sure”', () => {
    const result = parsePreferences({
      undertone: 'olive',
      contrast: 'extreme',
    })

    expect(result.undertone).toBe('unsure')
    expect(result.contrast).toBe('unsure')
  })

  it('caps each list and ignores bad timestamps', () => {
    const loved = Array.from(
      { length: MAX_PREFERENCE_COLORS + 3 },
      (_, index) => `#1${index.toString(16).padStart(5, '0')}`,
    )
    const avoided = Array.from(
      { length: MAX_PREFERENCE_COLORS + 3 },
      (_, index) => `#2${index.toString(16).padStart(5, '0')}`,
    )
    const result = parsePreferences({
      lovedColors: loved,
      avoidColors: avoided,
      updatedAt: 'yesterday',
    })

    expect(result.lovedColors).toHaveLength(MAX_PREFERENCE_COLORS)
    expect(result.avoidColors).toHaveLength(MAX_PREFERENCE_COLORS)
    expect(result.updatedAt).toBe(0)
  })
})

describe('preference storage', () => {
  it('round-trips through localStorage', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })

    const preferences = {
      ...basePreferences,
      undertone: 'cool' as const,
      lovedColors: ['#4a6b8a'],
      updatedAt: 1763500000000,
    }

    expect(writePreferences(preferences)).toBe(true)
    expect(storage.values.has(PREFERENCES_KEY)).toBe(true)
    expect(readPreferences()).toEqual(preferences)
  })

  it('returns the defaults for broken JSON', () => {
    const storage = memoryStorage()
    storage.values.set(PREFERENCES_KEY, '{')
    vi.stubGlobal('window', { localStorage: storage })

    expect(readPreferences()).toEqual(defaultPreferences())
  })

  it('returns the defaults when storage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
      },
    })

    expect(readPreferences()).toEqual(defaultPreferences())
    expect(writePreferences(defaultPreferences())).toBe(false)
    expect(clearPreferences()).toBe(false)
  })

  it('clears the stored choice', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })

    writePreferences({ ...basePreferences, undertone: 'warm' })
    expect(clearPreferences()).toBe(true)

    expect(storage.values.has(PREFERENCES_KEY)).toBe(false)
    expect(readPreferences()).toEqual(defaultPreferences())
  })
})

describe('hasPreferences and preferenceSummary', () => {
  it('treats untouched defaults as empty', () => {
    expect(hasPreferences(defaultPreferences())).toBe(false)
    expect(preferenceSummary(defaultPreferences())).toBeNull()
  })

  it('summarises the chosen palette without jargon', () => {
    const preferences = {
      undertone: 'warm' as const,
      contrast: 'high' as const,
      lovedColors: ['#6b6b3a'],
      avoidColors: ['#a83232', '#1f2a44'],
      updatedAt: 1,
    }

    expect(hasPreferences(preferences)).toBe(true)
    expect(preferenceSummary(preferences)).toBe(
      'warm undertone · high contrast · 1 loved color · 2 avoided colors',
    )
  })
})

describe('matchesAnyColor', () => {
  it('matches the same color and a perceptual neighbour', () => {
    expect(matchesAnyColor('#6b6b3a', ['#6b6b3a'])).toBe(true)
    expect(matchesAnyColor('#60704d', ['#6b6b3a'])).toBe(true)
  })

  it('does not match a clearly different color', () => {
    expect(matchesAnyColor('#a83232', ['#6b6b3a'])).toBe(false)
    expect(matchesAnyColor('#a83232', [])).toBe(false)
    expect(matchesAnyColor('not a color', ['#a83232'])).toBe(false)
  })
})

describe('dominantTemperature', () => {
  it('counts warm and cool pieces and skips neutrals', () => {
    const warmOnly = [
      item(1, ['#a83232']),
      item(2, ['#f6f3ee', '#6b6b3a']),
      item(3, ['#8a8a8a']),
    ]
    expect(dominantTemperature(warmOnly)).toBe('warm')

    const coolOnly = [
      item(1, ['#4a6b8a']),
      item(2, ['#2f6f6b']),
      item(3, ['#f6f3ee']),
    ]
    expect(dominantTemperature(coolOnly)).toBe('cool')
  })

  it('returns null for a tie or an all-neutral outfit', () => {
    expect(
      dominantTemperature([item(1, ['#a83232']), item(2, ['#4a6b8a'])]),
    ).toBeNull()
    expect(
      dominantTemperature([item(1, ['#f6f3ee']), item(2, ['#3b3b3b'])]),
    ).toBeNull()
    expect(dominantTemperature([])).toBeNull()
  })

  it('counts each piece once, even with several colors', () => {
    expect(
      dominantTemperature([
        item(1, ['#f6f3ee', '#4a6b8a', '#a83232']),
        item(2, ['#4a6b8a']),
        item(3, ['#a83232']),
      ]),
    ).toBe('cool')
  })
})

describe('contrastLevel', () => {
  it('classifies the lightness spread in CIELAB', () => {
    expect(
      contrastLevel([item(1, ['#f6f3ee']), item(2, ['#1f2a44'])]),
    ).toBe('high')
    expect(
      contrastLevel([item(1, ['#8a8a8a']), item(2, ['#3b3b3b'])]),
    ).toBe('medium')
    expect(
      contrastLevel([item(1, ['#3b3b3b']), item(2, ['#1f2a44'])]),
    ).toBe('low')
  })

  it('needs two usable colors', () => {
    expect(contrastLevel([item(1, ['#f6f3ee'])])).toBeNull()
    expect(contrastLevel([item(1, []), item(2, ['nope'])])).toBeNull()
  })
})

describe('wardrobePalette', () => {
  it('counts pieces, sorts by frequency, and names each color', () => {
    const palette = wardrobePalette([
      item(1, ['#6B6B3A', '#f6f3ee']),
      item(2, ['#6b6b3a']),
      item(3, ['#4a6b8a', '#6b6b3a']),
      item(4, ['#f6f3ee']),
    ])

    expect(palette[0]).toMatchObject({
      hex: '#6b6b3a',
      name: 'olive',
      count: 3,
    })
    expect(palette[1]).toMatchObject({ hex: '#f6f3ee', count: 2 })
    expect(palette[2]).toMatchObject({ hex: '#4a6b8a', count: 1 })
  })

  it('counts a color once per piece and skips invalid entries', () => {
    const palette = wardrobePalette([
      item(1, ['#6b6b3a', '#6B6B3A', 'olive']),
      item(2, ['#6b6b3a', '#zzzzzz']),
    ])

    expect(palette).toEqual([{ hex: '#6b6b3a', name: 'olive', count: 2 }])
  })

  it('caps the list and handles an empty wardrobe', () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      item(index + 1, [`#${(index + 1).toString(16).padStart(6, '0')}`]),
    )

    expect(wardrobePalette(items, 4)).toHaveLength(4)
    expect(wardrobePalette([])).toEqual([])
  })
})
