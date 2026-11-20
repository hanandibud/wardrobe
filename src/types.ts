import type {
  Fit,
  Material,
  OccasionSuggestion,
  Pattern,
  Sleeve,
  Subcategory,
} from './lib/recognition/vocab'

export const CATEGORY_OPTIONS = [
  { value: 'top', label: 'Top', plural: 'Tops' },
  { value: 'bottom', label: 'Bottom', plural: 'Bottoms' },
  { value: 'dress', label: 'Dress', plural: 'Dresses' },
  { value: 'outerwear', label: 'Outerwear', plural: 'Outerwear' },
  { value: 'shoes', label: 'Shoes', plural: 'Shoes' },
  { value: 'accessory', label: 'Accessory', plural: 'Accessories' },
] as const

export type Category = (typeof CATEGORY_OPTIONS)[number]['value']

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Category, string>

export const SEASON_OPTIONS = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
] as const

export type Season = (typeof SEASON_OPTIONS)[number]['value']

export const SEASON_LABELS = Object.fromEntries(
  SEASON_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Season, string>

export const STATUS_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'dirty', label: 'Needs wash' },
  { value: 'laundry', label: 'In laundry' },
] as const

export type ItemStatus = (typeof STATUS_OPTIONS)[number]['value']

export const LEVELS = [1, 2, 3, 4, 5] as const
export type Level = (typeof LEVELS)[number]

export const OCCASION_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'work', label: 'Work' },
  { value: 'smart', label: 'Smart' },
  { value: 'formal', label: 'Formal' },
] as const

export type Occasion = (typeof OCCASION_OPTIONS)[number]['value']

export const OCCASION_LABELS = Object.fromEntries(
  OCCASION_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Occasion, string>

export const WARMTH_LABELS: Record<Level, string> = {
  1: 'Very light',
  2: 'Light',
  3: 'Medium',
  4: 'Warm',
  5: 'Heavy',
}

export const FORMALITY_LABELS: Record<Level, string> = {
  1: 'Loungewear',
  2: 'Casual',
  3: 'Smart casual',
  4: 'Smart',
  5: 'Formal',
}

export interface WardrobeItem {
  id?: number
  name: string
  category: Category
  colors: string[]
  warmth: Level
  formality: Level
  seasons: Season[]
  status: ItemStatus
  notes?: string
  price?: number
  image: Blob
  createdAt: number
  lastWornAt?: number
  // Clothing recognition attributes. All optional so existing items and older
  // backups keep loading; no Dexie index change was needed.
  subcategory?: Subcategory
  pattern?: Pattern
  material?: Material
  fit?: Fit
  sleeve?: Sleeve
  occasions?: OccasionSuggestion[]
}

export interface Outfit {
  id?: number
  name: string
  itemIds: number[]
  occasion: Occasion
  seasons: Season[]
  createdAt: number
}

export type Feedback = 'loved' | 'liked' | 'meh' | 'disliked'

export interface WearEvent {
  id?: number
  outfitId: number
  wornOn: string
  feedback?: Feedback
  createdAt: number
}

export type Tab = 'wardrobe' | 'add' | 'outfits' | 'today'
