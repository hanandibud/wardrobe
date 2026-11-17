import { describe, expect, it } from 'vitest'
import { groupItemsByCategory, pieceCountLabel, resolveOutfitItems, toggleItemSelection } from './outfits'
import type { WardrobeItem } from '../types'

function item(id: number, category: WardrobeItem['category']): WardrobeItem {
  return {
    id,
    name: `Piece ${id}`,
    category,
    colors: [],
    warmth: 3,
    formality: 2,
    seasons: ['summer'],
    status: 'clean',
    image: new Blob(),
    createdAt: id,
  }
}

describe('toggleItemSelection', () => {
  it('adds an item that is not selected', () => {
    expect(toggleItemSelection([], 4)).toEqual([4])
    expect(toggleItemSelection([1, 2], 3)).toEqual([1, 2, 3])
  })

  it('removes an item that is already selected', () => {
    expect(toggleItemSelection([1, 2, 3], 2)).toEqual([1, 3])
  })

  it('never keeps a duplicate, however many times it is toggled', () => {
    let selected: number[] = []

    for (let press = 0; press < 5; press += 1) {
      selected = toggleItemSelection(selected, 7)
      expect(new Set(selected).size).toBe(selected.length)
    }

    expect(selected).toEqual([7])
  })

  it('does not reorder the pieces that stay selected', () => {
    expect(toggleItemSelection([9, 3, 5], 3)).toEqual([9, 5])
  })
})

describe('groupItemsByCategory', () => {
  const pieces = [item(1, 'shoes'), item(2, 'top'), item(3, 'top'), item(4, 'accessory')]

  it('follows the category order and keeps the pieces in the input order', () => {
    const groups = groupItemsByCategory(pieces)

    expect(groups.map((group) => group.category)).toEqual(['top', 'shoes', 'accessory'])
    expect(groups[0].items.map((entry) => entry.id)).toEqual([2, 3])
    expect(groups[0].label).toBe('Tops')
  })

  it('skips categories with nothing in them', () => {
    const groups = groupItemsByCategory([item(1, 'dress')])

    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('dress')
  })

  it('returns nothing for an empty wardrobe', () => {
    expect(groupItemsByCategory([])).toEqual([])
  })
})

describe('resolveOutfitItems', () => {
  const pieces = [item(1, 'top'), item(2, 'bottom'), item(3, 'shoes')]

  it('returns the pieces in the saved order', () => {
    expect(resolveOutfitItems({ itemIds: [3, 1] }, pieces).map((entry) => entry.id)).toEqual([3, 1])
  })

  it('drops items that were deleted from the wardrobe', () => {
    expect(resolveOutfitItems({ itemIds: [1, 99, 2] }, pieces).map((entry) => entry.id)).toEqual([1, 2])
  })

  it('returns an empty list when nothing is left', () => {
    expect(resolveOutfitItems({ itemIds: [98, 99] }, pieces)).toEqual([])
  })
})

describe('pieceCountLabel', () => {
  it('uses the singular for one piece', () => {
    expect(pieceCountLabel(1)).toBe('1 piece')
  })

  it('uses the plural for zero and many', () => {
    expect(pieceCountLabel(0)).toBe('0 pieces')
    expect(pieceCountLabel(4)).toBe('4 pieces')
  })
})