/**
 * Vocabularies for clothing recognition.
 *
 * The only import is a type-only `Category`, which is erased at build time, so
 * `src/types.ts` can read from this one source of truth without pulling in
 * recognition logic. Values are the strings that get stored on an item and in a
 * backup, so they must stay stable once shipped.
 */

import type { Category } from '../../types'

export const SUBCATEGORY_OPTIONS = [
  // Tops
  { value: 't-shirt', label: 'T-shirt' },
  { value: 'polo', label: 'Polo' },
  { value: 'shirt', label: 'Shirt' },
  { value: 'blouse', label: 'Blouse' },
  { value: 'sweater', label: 'Sweater' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'tank', label: 'Tank top' },
  // Bottoms
  { value: 'jeans', label: 'Jeans' },
  { value: 'chinos', label: 'Chinos' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'skirt', label: 'Skirt' },
  { value: 'leggings', label: 'Leggings' },
  // Dresses
  { value: 'casual-dress', label: 'Casual dress' },
  { value: 'formal-dress', label: 'Formal dress' },
  // Outerwear
  { value: 'jacket', label: 'Jacket' },
  { value: 'coat', label: 'Coat' },
  { value: 'blazer', label: 'Blazer' },
  { value: 'puffer', label: 'Puffer' },
  { value: 'cardigan', label: 'Cardigan' },
  // Shoes
  { value: 'sneakers', label: 'Sneakers' },
  { value: 'boots', label: 'Boots' },
  { value: 'sandals', label: 'Sandals' },
  { value: 'loafers', label: 'Loafers' },
  { value: 'heels', label: 'Heels' },
  // Accessories
  { value: 'scarf', label: 'Scarf' },
  { value: 'hat', label: 'Hat' },
  { value: 'bag', label: 'Bag' },
  { value: 'belt', label: 'Belt' },
  { value: 'watch', label: 'Watch' },
  { value: 'sunglasses', label: 'Sunglasses' },
] as const

export type Subcategory = (typeof SUBCATEGORY_OPTIONS)[number]['value']

export const SUBCATEGORY_LABELS = Object.fromEntries(
  SUBCATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Subcategory, string>

export const PATTERN_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'striped', label: 'Striped' },
  { value: 'plaid', label: 'Plaid' },
  { value: 'checked', label: 'Checked' },
  { value: 'floral', label: 'Floral' },
  { value: 'graphic', label: 'Graphic' },
  { value: 'polka-dot', label: 'Polka dot' },
  { value: 'camouflage', label: 'Camouflage' },
  { value: 'color-block', label: 'Color block' },
] as const

export type Pattern = (typeof PATTERN_OPTIONS)[number]['value']

export const PATTERN_LABELS = Object.fromEntries(
  PATTERN_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Pattern, string>

export const MATERIAL_OPTIONS = [
  { value: 'cotton', label: 'Cotton' },
  { value: 'linen', label: 'Linen' },
  { value: 'wool', label: 'Wool' },
  { value: 'denim', label: 'Denim' },
  { value: 'leather', label: 'Leather' },
  { value: 'silk', label: 'Silk' },
  { value: 'polyester', label: 'Polyester' },
  { value: 'knit', label: 'Knit' },
  { value: 'suede', label: 'Suede' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'cashmere', label: 'Cashmere' },
] as const

export type Material = (typeof MATERIAL_OPTIONS)[number]['value']

export const MATERIAL_LABELS = Object.fromEntries(
  MATERIAL_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Material, string>

export const FIT_OPTIONS = [
  { value: 'slim', label: 'Slim' },
  { value: 'regular', label: 'Regular' },
  { value: 'oversized', label: 'Oversized' },
] as const

export type Fit = (typeof FIT_OPTIONS)[number]['value']

export const FIT_LABELS = Object.fromEntries(
  FIT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Fit, string>

export const SLEEVE_OPTIONS = [
  { value: 'sleeveless', label: 'Sleeveless' },
  { value: 'short', label: 'Short' },
  { value: 'three-quarter', label: 'Three-quarter' },
  { value: 'long', label: 'Long' },
] as const

export type Sleeve = (typeof SLEEVE_OPTIONS)[number]['value']

export const SLEEVE_LABELS = Object.fromEntries(
  SLEEVE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Sleeve, string>

export const OCCASION_SUGGESTION_OPTIONS = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'work', label: 'Work' },
  { value: 'smart', label: 'Smart' },
  { value: 'formal', label: 'Formal' },
  { value: 'sport', label: 'Sport' },
  { value: 'evening', label: 'Evening' },
  { value: 'outdoor', label: 'Outdoor' },
] as const

export type OccasionSuggestion =
  (typeof OCCASION_SUGGESTION_OPTIONS)[number]['value']

export const OCCASION_SUGGESTION_LABELS = Object.fromEntries(
  OCCASION_SUGGESTION_OPTIONS.map((option) => [option.value, option.label]),
) as Record<OccasionSuggestion, string>

/** The main category each subcategory belongs to. */
export const SUBCATEGORY_CATEGORY: Record<Subcategory, Category> = {
  't-shirt': 'top',
  polo: 'top',
  shirt: 'top',
  blouse: 'top',
  sweater: 'top',
  hoodie: 'top',
  tank: 'top',
  jeans: 'bottom',
  chinos: 'bottom',
  trousers: 'bottom',
  shorts: 'bottom',
  skirt: 'bottom',
  leggings: 'bottom',
  'casual-dress': 'dress',
  'formal-dress': 'dress',
  jacket: 'outerwear',
  coat: 'outerwear',
  blazer: 'outerwear',
  puffer: 'outerwear',
  cardigan: 'outerwear',
  sneakers: 'shoes',
  boots: 'shoes',
  sandals: 'shoes',
  loafers: 'shoes',
  heels: 'shoes',
  scarf: 'accessory',
  hat: 'accessory',
  bag: 'accessory',
  belt: 'accessory',
  watch: 'accessory',
  sunglasses: 'accessory',
}

/** Subcategories grouped by their main category, for the dependent dropdown. */
export function subcategoriesForCategory(category: Category): {
  value: Subcategory
  label: string
}[] {
  return SUBCATEGORY_OPTIONS.filter(
    (option) => SUBCATEGORY_CATEGORY[option.value] === category,
  )
}
