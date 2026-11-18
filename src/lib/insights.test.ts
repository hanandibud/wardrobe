import { describe, expect, it } from 'vitest'
import type { Outfit, WardrobeItem, WearEvent } from '../types'
import {
  costSummary,
  formatAmount,
  parsePrice,
  wardrobeGaps,
  wearsByItem,
} from './insights'

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

function outfit(id: number, itemIds: number[]): Outfit {
  return {
    id,
    name: `Look ${id}`,
    itemIds,
    occasion: 'casual',
    seasons: allSeasons,
    createdAt: id,
  }
}

function event(id: number, outfitId: number, wornOn: string): WearEvent {
  return { id, outfitId, wornOn, createdAt: id }
}

describe('parsePrice', () => {
  it('accepts positive amounts and rounds to cents', () => {
    expect(parsePrice(24.99)).toBe(24.99)
    expect(parsePrice('24.99')).toBe(24.99)
    expect(parsePrice(' 12 ')).toBe(12)
    expect(parsePrice(24.994)).toBe(24.99)
    expect(parsePrice(24.995)).toBe(25)
  })

  it('rejects blank, zero, negative, and unreadable amounts', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('   ')).toBeNull()
    expect(parsePrice(0)).toBeNull()
    expect(parsePrice(-5)).toBeNull()
    expect(parsePrice('free')).toBeNull()
    expect(parsePrice(Number.NaN)).toBeNull()
    expect(parsePrice(Number.POSITIVE_INFINITY)).toBeNull()
    expect(parsePrice(1_000_000_001)).toBeNull()
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice(undefined)).toBeNull()
  })
})

describe('formatAmount', () => {
  it('formats a number without a currency symbol', () => {
    const formatted = formatAmount(1234.5)
    expect(formatted).not.toMatch(/[$€£¥]/)
    expect(formatted.replace(/\D/g, '')).toBe('12345')
  })
})

describe('wearsByItem', () => {
  it('counts each logged wear once per piece', () => {
    const counts = wearsByItem(
      [outfit(1, [10, 11, 11]), outfit(2, [10])],
      [event(1, 1, '2026-11-16'), event(2, 1, '2026-11-17'), event(3, 2, '2026-11-18')],
    )

    expect(counts.get(10)).toBe(3)
    expect(counts.get(11)).toBe(2)
    expect(counts.get(12)).toBeUndefined()
  })

  it('ignores wear events whose look is gone', () => {
    const counts = wearsByItem([outfit(1, [10])], [event(1, 99, '2026-11-18')])
    expect(counts.size).toBe(0)
  })
})

describe('costSummary', () => {
  const items = [
    item({ id: 1, name: 'Linen shirt', price: 60 }),
    item({ id: 2, name: 'Boots', price: 120 }),
    item({ id: 3, name: 'Silk dress', price: 200 }),
    item({ id: 4, name: 'Gift scarf' }),
    item({ id: 5, name: 'Bad price', price: 0 }),
  ]
  const outfits = [outfit(1, [1, 2]), outfit(2, [2])]
  const events = [
    event(1, 1, '2026-11-16'),
    event(2, 1, '2026-11-17'),
    event(3, 2, '2026-11-18'),
  ]

  it('computes per-piece and overall cost per wear', () => {
    const summary = costSummary(items, outfits, events)

    expect(summary.pricedCount).toBe(3)
    expect(summary.totalValue).toBe(380)
    expect(summary.totalItemWears).toBe(5)
    expect(summary.averagePerWear).toBe(76)
    expect(summary.unwornCount).toBe(1)
    expect(summary.rows.map((row) => [row.item.id, row.wears, row.perWear])).toEqual(
      [
        [2, 3, 40],
        [1, 2, 30],
        [3, 0, null],
      ],
    )
  })

  it('sorts worn pieces by the highest cost per wear first', () => {
    const summary = costSummary(items, outfits, events)
    const worn = summary.rows.filter((row) => row.perWear !== null)

    expect(worn.map((row) => row.perWear)).toEqual([40, 30])
  })

  it('handles a wardrobe with no logged wears', () => {
    const summary = costSummary(items, [], [])

    expect(summary.totalValue).toBe(380)
    expect(summary.totalItemWears).toBe(0)
    expect(summary.averagePerWear).toBeNull()
    expect(summary.unwornCount).toBe(3)
    expect(summary.rows.every((row) => row.perWear === null)).toBe(true)
  })

  it('ignores pieces without a usable price', () => {
    const summary = costSummary(
      [
        item({ id: 1, name: 'No price' }),
        item({ id: 2, name: 'Zero', price: 0 }),
        item({ id: 3, name: 'Negative', price: -20 }),
      ],
      [],
      [],
    )

    expect(summary.pricedCount).toBe(0)
    expect(summary.rows).toEqual([])
    expect(summary.averagePerWear).toBeNull()
  })
})

describe('wardrobeGaps', () => {
  function completeWardrobe(): WardrobeItem[] {
    return [
      item({ id: 1, name: 'White shirt', colors: ['#f6f3ee'] }),
      item({
        id: 2,
        name: 'Navy trousers',
        category: 'bottom',
        colors: ['#1f2a44'],
      }),
      item({
        id: 3,
        name: 'Boots',
        category: 'shoes',
        warmth: 4,
        colors: ['#4a2f22'],
      }),
      item({
        id: 4,
        name: 'Wool coat',
        category: 'outerwear',
        warmth: 5,
        formality: 4,
        colors: ['#3b3b3b'],
      }),
      item({
        id: 5,
        name: 'Linen shirt',
        warmth: 1,
        colors: ['#9caf96'],
      }),
    ]
  }

  it('finds nothing missing in a broad wardrobe', () => {
    expect(wardrobeGaps(completeWardrobe())).toEqual([])
  })

  it('returns nothing for an empty wardrobe', () => {
    expect(wardrobeGaps([])).toEqual([])
  })

  it('names a missing base and a missing dress alternative', () => {
    const gaps = wardrobeGaps([item({ id: 1, name: 'Only a top' })])

    expect(gaps.map((gap) => gap.key)).toContain('base')
  })

  it('accepts a dress as a complete base', () => {
    const gaps = wardrobeGaps([
      item({ id: 1, name: 'Dress', category: 'dress' }),
    ])

    expect(gaps.map((gap) => gap.key)).not.toContain('base')
  })

  it('names formal, cold, and hot coverage separately', () => {
    const gaps = wardrobeGaps([
      item({ id: 1, name: 'Plain top', warmth: 3, formality: 2 }),
      item({
        id: 2,
        name: 'Plain bottom',
        category: 'bottom',
        warmth: 3,
        formality: 2,
      }),
      item({
        id: 3,
        name: 'Trainers',
        category: 'shoes',
        warmth: 3,
        formality: 2,
      }),
    ])

    expect(gaps.map((gap) => gap.key)).toEqual(['formal', 'cold', 'hot'])
  })

  it('asks for shoes before asking for rain-ready shoes', () => {
    const withoutShoes = wardrobeGaps([
      item({ id: 1, name: 'Top' }),
      item({ id: 2, name: 'Bottom', category: 'bottom' }),
    ])
    expect(withoutShoes.map((gap) => gap.key)).toContain('shoes')
    expect(withoutShoes.map((gap) => gap.key)).not.toContain('rainShoes')

    const lightShoes = wardrobeGaps([
      item({ id: 1, name: 'Top' }),
      item({ id: 2, name: 'Bottom', category: 'bottom' }),
      item({ id: 3, name: 'Sandals', category: 'shoes', warmth: 1 }),
    ])
    expect(lightShoes.map((gap) => gap.key)).toContain('rainShoes')
    expect(lightShoes.map((gap) => gap.key)).not.toContain('shoes')
  })

  it('asks for a neutral anchor when every color is saturated', () => {
    const gaps = wardrobeGaps([
      item({ id: 1, name: 'Red top', colors: ['#a83232'] }),
      item({ id: 2, name: 'Olive bottom', category: 'bottom', colors: ['#6b6b3a'] }),
      item({ id: 3, name: 'Teal boots', category: 'shoes', colors: ['#2f6f6b'] }),
    ])

    expect(gaps.map((gap) => gap.key)).toContain('neutral')
  })
})
