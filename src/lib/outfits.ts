import { CATEGORY_OPTIONS, type Category, type Outfit, type WardrobeItem } from '../types'

/**
 * Add an item to an outfit, or remove it when it is already there. Selecting an
 * item twice must never save the same piece twice.
 */
export function toggleItemSelection(selectedIds: number[], id: number): number[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((entry) => entry !== id)
    : [...selectedIds, id]
}

export interface CategoryGroup {
  category: Category
  label: string
  items: WardrobeItem[]
}

/** Wardrobe pieces in category order, with empty categories left out. */
export function groupItemsByCategory(items: WardrobeItem[]): CategoryGroup[] {
  return CATEGORY_OPTIONS.map((option) => ({
    category: option.value,
    label: option.plural,
    items: items.filter((item) => item.category === option.value),
  })).filter((group) => group.items.length > 0)
}

/**
 * The pieces an outfit still points at, in the saved order. An item deleted
 * from the wardrobe simply drops out instead of breaking the outfit.
 */
export function resolveOutfitItems(
  outfit: Pick<Outfit, 'itemIds'>,
  items: WardrobeItem[],
): WardrobeItem[] {
  const byId = new Map(items.flatMap((item) => (item.id === undefined ? [] : [[item.id, item] as const])))

  return outfit.itemIds.flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}

/** "1 piece" or "3 pieces", for headings and cards. */
export function pieceCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}