import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  colorHarmony,
  findMatchingOutfit,
  isEligible,
  isNeutralColor,
  lastWornByItem,
  lovedItemIds,
  readSkippedKeys,
  recommend,
  seasonForMonth,
  suggestionName,
  writeSkippedKeys,
  type Suggestion,
} from './recommend'
import type { Outfit, WardrobeItem, WearEvent } from '../types'

const allSeasons: WardrobeItem['seasons'] = [
  'spring',
  'summer',
  'autumn',
  'winter',
]

function item(
  overrides: Partial<WardrobeItem> & { id: number; name: string },
): WardrobeItem {
  return {
    category: 'top',
    colors: ['#f6f3ee'],
    warmth: 3,
    formality: 2,
    seasons: allSeasons,
    status: 'clean',
    image: new Blob(),
    createdAt: overrides.id,
    ...overrides,
  }
}

function wardrobe(): WardrobeItem[] {
  return [
    item({
      id: 1,
      name: 'Olive linen shirt',
      category: 'top',
      warmth: 2,
      formality: 2,
      colors: ['#6b6b3a'],
    }),
    item({
      id: 2,
      name: 'White tee',
      category: 'top',
      warmth: 2,
      formality: 1,
      colors: ['#f6f3ee'],
    }),
    item({
      id: 13,
      name: 'Grey merino sweater',
      category: 'top',
      warmth: 3,
      formality: 3,
      colors: ['#8a8a8a'],
    }),
    item({
      id: 3,
      name: 'Denim jeans',
      category: 'bottom',
      warmth: 3,
      formality: 2,
      colors: ['#4a6b8a'],
    }),
    item({
      id: 4,
      name: 'Wool trousers',
      category: 'bottom',
      warmth: 4,
      formality: 4,
      colors: ['#3b3b3b'],
    }),
    item({
      id: 5,
      name: 'White sneakers',
      category: 'shoes',
      warmth: 2,
      formality: 1,
      colors: ['#f6f3ee'],
    }),
    item({
      id: 6,
      name: 'Leather loafers',
      category: 'shoes',
      warmth: 3,
      formality: 4,
      colors: ['#4a2f22'],
    }),
    item({
      id: 14,
      name: 'Chelsea boots',
      category: 'shoes',
      warmth: 3,
      formality: 2,
      colors: ['#4a2f22'],
    }),
    item({
      id: 7,
      name: 'Sandals',
      category: 'shoes',
      warmth: 1,
      formality: 1,
      colors: ['#d8c3a5'],
    }),
    item({
      id: 8,
      name: 'Navy blazer',
      category: 'outerwear',
      warmth: 3,
      formality: 4,
      colors: ['#1f2a44'],
    }),
    item({
      id: 9,
      name: 'Wool coat',
      category: 'outerwear',
      warmth: 5,
      formality: 3,
      colors: ['#3b3b3b'],
    }),
    item({
      id: 10,
      name: 'Summer dress',
      category: 'dress',
      warmth: 1,
      formality: 2,
      colors: ['#d98ca0'],
    }),
    item({
      id: 11,
      name: 'Silk dress',
      category: 'dress',
      warmth: 2,
      formality: 4,
      colors: ['#5e1f2b'],
    }),
    item({
      id: 12,
      name: 'Canvas tote',
      category: 'accessory',
      warmth: 1,
      formality: 2,
      colors: ['#d8c3a5'],
    }),
  ]
}

const today = new Date(2026, 10, 18)

function ids(suggestion: Suggestion): number[] {
  return suggestion.items.map((entry) => entry.id ?? -1)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('seasonForMonth', () => {
  it('maps the northern-hemisphere seasons', () => {
    expect(seasonForMonth(0)).toBe('winter')
    expect(seasonForMonth(2)).toBe('spring')
    expect(seasonForMonth(5)).toBe('summer')
    expect(seasonForMonth(8)).toBe('autumn')
    expect(seasonForMonth(10)).toBe('autumn')
    expect(seasonForMonth(11)).toBe('winter')
  })

  it('wraps out-of-range months', () => {
    expect(seasonForMonth(12)).toBe('winter')
    expect(seasonForMonth(-1)).toBe('winter')
  })
})

describe('isNeutralColor', () => {
  it('recognises paper whites and dark anchors', () => {
    expect(isNeutralColor('#f6f3ee')).toBe(true)
    expect(isNeutralColor('#1f2a44')).toBe(true)
    expect(isNeutralColor('#3b3b3b')).toBe(true)
  })

  it('rejects saturated colors', () => {
    expect(isNeutralColor('#a83232')).toBe(false)
    expect(isNeutralColor('#6b6b3a')).toBe(false)
  })

  it('rejects text that is not a hex color', () => {
    expect(isNeutralColor('red')).toBe(false)
  })
})

describe('isEligible', () => {
  const [linen, tee, sweater, jeans, , sneakers, loafers, boots, sandals, , coat] =
    wardrobe()

  it('keeps only clean pieces', () => {
    expect(
      isEligible({ ...sweater, status: 'dirty' }, 'casual', 'autumn', 'cool', true),
    ).toBe(false)
  })

  it('excludes a linen shirt and open shoes from a wet cool day', () => {
    expect(isEligible(linen, 'casual', 'autumn', 'cool', true)).toBe(false)
    expect(isEligible(sandals, 'casual', 'autumn', 'cool', true)).toBe(false)
    expect(isEligible(sneakers, 'casual', 'autumn', 'cool', true)).toBe(false)
    expect(isEligible(sweater, 'casual', 'autumn', 'cool', true)).toBe(true)
    expect(isEligible(jeans, 'casual', 'autumn', 'cool', true)).toBe(true)
    expect(isEligible(boots, 'casual', 'autumn', 'cool', true)).toBe(true)
  })

  it('excludes a heavy coat from a hot day', () => {
    expect(isEligible(coat, 'casual', 'autumn', 'hot', false)).toBe(false)
    expect(isEligible(tee, 'casual', 'autumn', 'hot', false)).toBe(true)
  })

  it('keeps the occasion formality in range', () => {
    expect(isEligible(tee, 'formal', 'autumn', 'mild', false)).toBe(false)
    expect(isEligible(loafers, 'casual', 'autumn', 'mild', false)).toBe(false)
    expect(isEligible(loafers, 'formal', 'autumn', 'mild', false)).toBe(true)
  })

  it('treats an empty season list as all-season', () => {
    expect(
      isEligible({ ...sweater, seasons: [] }, 'casual', 'autumn', null, false),
    ).toBe(true)
  })

  it('filters an item tagged only for another season', () => {
    expect(
      isEligible(
        { ...sweater, seasons: ['summer'] },
        'casual',
        'autumn',
        null,
        false,
      ),
    ).toBe(false)
  })
})

describe('colorHarmony', () => {
  it('rewards a neutral base', () => {
    const harmony = colorHarmony([
      item({ id: 1, name: 'Tee', colors: ['#f6f3ee'] }),
      item({ id: 2, name: 'Trousers', colors: ['#3b3b3b'] }),
      item({ id: 3, name: 'Shoes', colors: ['#d8c3a5'] }),
    ])

    expect(harmony.score).toBeGreaterThan(0)
    expect(harmony.reason).toBe('A calm, neutral palette')
  })

  it('accepts two close hues', () => {
    const harmony = colorHarmony([
      item({ id: 1, name: 'Olive', colors: ['#6b6b3a'] }),
      item({ id: 2, name: 'Denim', colors: ['#4a6b8a'] }),
    ])

    expect(harmony.score).toBeGreaterThan(0)
    expect(harmony.reason).toBe('Colors that sit together')
  })

  it('penalises many separate hues', () => {
    const harmony = colorHarmony([
      item({ id: 1, name: 'Red', colors: ['#a83232'] }),
      item({ id: 2, name: 'Yellow', colors: ['#d8b64a'] }),
      item({ id: 3, name: 'Green', colors: ['#3f6b4f'] }),
      item({ id: 4, name: 'Purple', colors: ['#6b4c7a'] }),
    ])

    expect(harmony.score).toBeLessThan(0)
    expect(harmony.reason).toBeNull()
  })
})

describe('recommend', () => {
  it('returns nothing with an empty wardrobe and says so', () => {
    const result = recommend({
      items: [],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
    })

    expect(result.suggestions).toEqual([])
    expect(result.message).toContain('Add a few pieces')
  })

  it('explains when everything is in the wash', () => {
    const result = recommend({
      items: wardrobe().map((entry) => ({ ...entry, status: 'dirty' })),
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
    })

    expect(result.suggestions).toEqual([])
    expect(result.message).toContain('wash')
  })

  it('never suggests a linen shirt or sandals on a wet 12 degree day', () => {
    const result = recommend({
      items: wardrobe(),
      occasion: 'casual',
      band: 'cool',
      wet: true,
      today,
    })

    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of result.suggestions) {
      expect(ids(suggestion)).not.toContain(1)
      expect(ids(suggestion)).not.toContain(7)
      expect(ids(suggestion)).not.toContain(5)
      expect(suggestion.items.every((entry) => entry.status === 'clean')).toBe(true)
      expect(suggestion.reasons.length).toBeGreaterThan(0)
    }
  })

  it('never suggests a heavy coat on a hot day', () => {
    const result = recommend({
      items: wardrobe(),
      occasion: 'casual',
      band: 'hot',
      wet: false,
      today,
    })

    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of result.suggestions) {
      expect(ids(suggestion)).not.toContain(9)
      expect(ids(suggestion)).not.toContain(4)
      expect(suggestion.items.every((entry) => entry.warmth <= 2)).toBe(true)
    }
  })

  it('builds a dress look without requiring a top and bottom', () => {
    const result = recommend({
      items: [
        item({
          id: 10,
          name: 'Summer dress',
          category: 'dress',
          warmth: 1,
          colors: ['#d98ca0'],
        }),
        item({
          id: 5,
          name: 'Sneakers',
          category: 'shoes',
          warmth: 2,
          formality: 1,
          colors: ['#f6f3ee'],
        }),
      ],
      occasion: 'casual',
      band: 'hot',
      wet: false,
      today,
    })

    expect(result.suggestions[0].items.map((entry) => entry.category)).toEqual([
      'dress',
      'shoes',
    ])
  })

  it('respects the occasion formality', () => {
    const result = recommend({
      items: wardrobe(),
      occasion: 'formal',
      band: 'mild',
      wet: false,
      today,
    })

    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of result.suggestions) {
      expect(
        suggestion.items.every((entry) => entry.formality >= 4),
      ).toBe(true)
      expect(ids(suggestion)).not.toContain(2)
    }
  })

  it('caps the list at three distinct looks, best first', () => {
    const result = recommend({
      items: wardrobe(),
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
    })

    expect(result.suggestions).toHaveLength(3)
    expect(new Set(result.suggestions.map((entry) => entry.key)).size).toBe(3)

    const scores = result.suggestions.map((entry) => entry.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('returns the same picks for the same inputs', () => {
    const input = {
      items: wardrobe(),
      occasion: 'work' as const,
      band: 'cool' as const,
      wet: false,
      today,
    }

    expect(recommend(input)).toEqual(recommend(input))
  })

  it('prefers a fresh duplicate over one worn yesterday', () => {
    const base = item({
      id: 20,
      name: 'Grey sweater (worn)',
      warmth: 3,
      formality: 2,
      colors: ['#8a8a8a'],
    })
    const fresh = { ...base, id: 21, name: 'Grey sweater (fresh)' }

    const result = recommend({
      items: [
        base,
        fresh,
        item({ id: 40, name: 'Jeans', category: 'bottom', warmth: 3 }),
        item({ id: 41, name: 'Boots', category: 'shoes', warmth: 3, formality: 2 }),
      ],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      lastWornByItem: new Map([[20, '2026-11-17']]),
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(21)
    expect(ids(result.suggestions[0])).not.toContain(20)
  })

  it('raises a loved piece to the top', () => {
    const one = item({
      id: 30,
      name: 'Loved shirt',
      warmth: 3,
      formality: 2,
      colors: ['#8a8a8a'],
    })
    const two = { ...one, id: 31, name: 'Other shirt' }

    const result = recommend({
      items: [
        one,
        two,
        item({ id: 42, name: 'Jeans', category: 'bottom', warmth: 3 }),
        item({ id: 43, name: 'Boots', category: 'shoes', warmth: 3, formality: 2 }),
      ],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      lovedItemIds: new Set([30]),
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(30)
    expect(result.suggestions[0].reasons).toContain('Includes a piece you loved')
  })

  it('lifts a piece in a color you love', () => {
    const olive = item({
      id: 50,
      name: 'Olive shirt',
      warmth: 3,
      formality: 2,
      colors: ['#6b6b3a'],
    })
    const blue = {
      ...olive,
      id: 51,
      name: 'Blue shirt',
      colors: ['#4a6b8a'],
    }

    const result = recommend({
      items: [
        olive,
        blue,
        item({ id: 52, name: 'Grey jeans', category: 'bottom', warmth: 3 }),
        item({
          id: 53,
          name: 'Boots',
          category: 'shoes',
          warmth: 3,
          formality: 2,
        }),
      ],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      preferences: {
        undertone: 'unsure',
        contrast: 'unsure',
        lovedColors: ['#60704d'],
        avoidColors: [],
        updatedAt: 1,
      },
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(50)
    expect(result.suggestions[0].reasons).toContain('Includes a color you love')
  })

  it('quietly pushes down a color you avoid', () => {
    const olive = item({
      id: 54,
      name: 'Olive shirt',
      warmth: 3,
      formality: 2,
      colors: ['#6b6b3a'],
    })
    const blue = {
      ...olive,
      id: 55,
      name: 'Blue shirt',
      colors: ['#4a6b8a'],
    }

    const result = recommend({
      items: [
        olive,
        blue,
        item({ id: 56, name: 'Grey jeans', category: 'bottom', warmth: 3 }),
        item({
          id: 57,
          name: 'Boots',
          category: 'shoes',
          warmth: 3,
          formality: 2,
        }),
      ],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      preferences: {
        undertone: 'unsure',
        contrast: 'unsure',
        lovedColors: [],
        avoidColors: ['#60704d'],
        updatedAt: 1,
      },
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(55)
    expect(ids(result.suggestions[0])).not.toContain(54)
  })

  it('favours the chosen undertone when the rest is equal', () => {
    const rust = item({
      id: 60,
      name: 'Rust shirt',
      warmth: 3,
      formality: 2,
      colors: ['#a83232'],
    })
    const denim = {
      ...rust,
      id: 61,
      name: 'Denim shirt',
      colors: ['#4a6b8a'],
    }

    const result = recommend({
      items: [
        rust,
        denim,
        item({ id: 62, name: 'Grey jeans', category: 'bottom', warmth: 3 }),
        item({
          id: 63,
          name: 'Boots',
          category: 'shoes',
          warmth: 3,
          formality: 2,
        }),
      ],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      preferences: {
        undertone: 'warm',
        contrast: 'unsure',
        lovedColors: [],
        avoidColors: [],
        updatedAt: 1,
      },
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(60)
    expect(result.suggestions[0].reasons).toContain(
      'Warm-leaning colors, as you prefer',
    )
  })

  it('favours the chosen contrast level when the rest is equal', () => {
    const top = item({
      id: 70,
      name: 'White shirt',
      warmth: 3,
      formality: 2,
      colors: ['#f6f3ee'],
    })
    const navy = item({
      id: 71,
      name: 'Navy trousers',
      category: 'bottom',
      warmth: 3,
      formality: 2,
      colors: ['#1f2a44'],
    })
    const grey = {
      ...navy,
      id: 72,
      name: 'Grey trousers',
      colors: ['#8a8a8a'],
    }

    const result = recommend({
      items: [top, navy, grey],
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      preferences: {
        undertone: 'unsure',
        contrast: 'high',
        lovedColors: [],
        avoidColors: [],
        updatedAt: 1,
      },
      limit: 1,
    })

    expect(ids(result.suggestions[0])).toContain(71)
    expect(result.suggestions[0].reasons).toContain(
      'High-contrast pairing, as you prefer',
    )
  })

  it('drops a skipped combination', () => {
    const first = recommend({
      items: wardrobe(),
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
    })
    const skippedKey = first.suggestions[0].key

    const second = recommend({
      items: wardrobe(),
      occasion: 'casual',
      band: 'mild',
      wet: false,
      today,
      skippedKeys: [skippedKey],
    })

    expect(second.suggestions.map((entry) => entry.key)).not.toContain(skippedKey)
  })
})

describe('lastWornByItem', () => {
  const outfits: Outfit[] = [
    { id: 1, name: 'Look one', itemIds: [1, 2], occasion: 'casual', seasons: [], createdAt: 1 },
    { id: 2, name: 'Look two', itemIds: [2], occasion: 'casual', seasons: [], createdAt: 2 },
  ]

  it('keeps the latest wear date per item', () => {
    const map = lastWornByItem(outfits, [
      { outfitId: 1, wornOn: '2026-11-10', createdAt: 1 },
      { outfitId: 2, wornOn: '2026-11-16', createdAt: 2 },
      { outfitId: 1, wornOn: '2026-11-12', createdAt: 3 },
    ])

    expect(map.get(1)).toBe('2026-11-12')
    expect(map.get(2)).toBe('2026-11-16')
  })

  it('ignores events whose look was removed', () => {
    const map = lastWornByItem(outfits, [
      { outfitId: 99, wornOn: '2026-11-16', createdAt: 1 },
    ])

    expect(map.size).toBe(0)
  })
})

describe('lovedItemIds', () => {
  const outfits: Outfit[] = [
    { id: 1, name: 'Look', itemIds: [1, 2], occasion: 'casual', seasons: [], createdAt: 1 },
  ]

  it('collects items from loved events only', () => {
    const events: WearEvent[] = [
      { outfitId: 1, wornOn: '2026-11-10', feedback: 'loved', createdAt: 1 },
      { outfitId: 1, wornOn: '2026-11-11', feedback: 'meh', createdAt: 2 },
    ]

    expect([...lovedItemIds(outfits, events)].sort()).toEqual([1, 2])
  })
})

describe('findMatchingOutfit', () => {
  const outfits: Outfit[] = [
    { id: 1, name: 'Look', itemIds: [3, 1, 2], occasion: 'casual', seasons: [], createdAt: 1 },
  ]

  it('matches without caring about the piece order', () => {
    expect(findMatchingOutfit(outfits, [1, 2, 3])?.id).toBe(1)
  })

  it('returns undefined for a different set', () => {
    expect(findMatchingOutfit(outfits, [1, 2])).toBeUndefined()
  })
})

describe('suggestionName', () => {
  it('anchors the name on the main piece and the occasion', () => {
    const suggestion: Suggestion = {
      key: '1-2-3',
      items: [
        item({ id: 1, name: 'Olive linen camp shirt', category: 'top' }),
        item({ id: 2, name: 'Jeans', category: 'bottom' }),
      ],
      score: 50,
      reasons: [],
    }

    expect(suggestionName(suggestion, 'work')).toBe(
      'Work pick · Olive linen camp shirt',
    )
  })
})

describe('skipped picks', () => {
  function memoryStorage() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
  }

  it('round-trips today’s skips', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })

    writeSkippedKeys('2026-11-18', ['1-2', '3-4'])
    expect(readSkippedKeys('2026-11-18')).toEqual(['1-2', '3-4'])
  })

  it('forgets skips from another day', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })

    writeSkippedKeys('2026-11-18', ['1-2'])
    expect(readSkippedKeys('2026-11-19')).toEqual([])
  })

  it('survives broken storage', () => {
    expect(readSkippedKeys('2026-11-18')).toEqual([])
  })
})