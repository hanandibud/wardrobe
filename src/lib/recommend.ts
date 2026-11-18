import type {
  Category,
  Occasion,
  Outfit,
  Season,
  WardrobeItem,
  WearEvent,
} from '../types'
import { OCCASION_LABELS } from '../types'
import { hueOf, isNeutralColor } from './colors'
import type { ColorPreferences } from './preferences'
import {
  contrastLevel,
  dominantTemperature,
  matchesAnyColor,
} from './preferences'
import { localIsoDate } from './wear'
import type { WeatherBand } from './weather'

export { isNeutralColor } from './colors'

export interface Suggestion {
  key: string
  items: WardrobeItem[]
  score: number
  reasons: string[]
}

export interface RecommendationInput {
  items: WardrobeItem[]
  occasion: Occasion
  band: WeatherBand | null
  wet: boolean
  today: Date
  lastWornByItem?: Map<number, string>
  lovedItemIds?: Set<number>
  skippedKeys?: string[]
  preferences?: ColorPreferences
  limit?: number
}

export interface RecommendationResult {
  suggestions: Suggestion[]
  cleanCount: number
  message: string | null
}

interface Range {
  min: number
  max: number
  ideal: number
}

const FORMALITY_RANGES: Record<Occasion, Range> = {
  casual: { min: 1, max: 3, ideal: 1.5 },
  work: { min: 2, max: 4, ideal: 3 },
  smart: { min: 3, max: 4, ideal: 3.5 },
  formal: { min: 4, max: 5, ideal: 4.5 },
}

/**
 * What "warmth" should mean for each clothing band. The ranges are deliberately
 * strict at the edges: a 12°C day should not produce a linen shirt.
 */
const WARMTH_RANGES: Record<WeatherBand, Range> = {
  cold: { min: 4, max: 5, ideal: 4.5 },
  cool: { min: 3, max: 4, ideal: 3.5 },
  mild: { min: 2, max: 4, ideal: 3 },
  warm: { min: 1, max: 3, ideal: 2 },
  hot: { min: 1, max: 2, ideal: 1.5 },
}

const MONTH_SEASONS: Season[] = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter',
]

export function seasonForMonth(monthIndex: number): Season {
  return MONTH_SEASONS[((monthIndex % 12) + 12) % 12]
}

/**
 * A deliberately small palette check: neutrals anchor an outfit, a tight hue
 * range reads calm, and four or more separate hues are likely to fight.
 */
export function colorHarmony(items: WardrobeItem[]): {
  score: number
  reason: string | null
} {
  const colors = items.flatMap((item) => item.colors.slice(0, 1))
  if (colors.length < 2) return { score: 0, reason: null }

  const neutrals = colors.filter(isNeutralColor).length
  const hues = colors
    .filter((color) => !isNeutralColor(color))
    .flatMap((color) => {
      const hue = hueOf(color)
      return hue === null ? [] : [hue]
    })
  const buckets = new Set(hues.map((hue) => Math.round(hue / 45) % 8))

  if (neutrals >= 2 && buckets.size <= 1) {
    return { score: 6, reason: 'A calm, neutral palette' }
  }
  if (buckets.size <= 2) {
    return { score: 4, reason: 'Colors that sit together' }
  }
  if (neutrals >= 1) {
    return { score: 2, reason: 'A neutral piece anchors the color' }
  }

  return { score: -2, reason: null }
}

function isSeasonFit(item: WardrobeItem, season: Season): boolean {
  return item.seasons.length === 0 || item.seasons.includes(season)
}

function shoeFitsWeather(
  item: WardrobeItem,
  band: WeatherBand,
  wet: boolean,
): boolean {
  const range = WARMTH_RANGES[band]
  if (item.warmth < range.min || item.warmth > range.max) return false
  if (wet && (band === 'cold' || band === 'cool') && item.warmth < 3) return false
  return true
}

export function isEligible(
  item: WardrobeItem,
  occasion: Occasion,
  season: Season,
  band: WeatherBand | null,
  wet: boolean,
): boolean {
  if (item.status !== 'clean') return false
  if (!isSeasonFit(item, season)) return false

  const formality = FORMALITY_RANGES[occasion]
  if (item.formality < formality.min || item.formality > formality.max) {
    return false
  }

  if (band) {
    const warmth = WARMTH_RANGES[band]
    if (item.category === 'shoes') {
      if (!shoeFitsWeather(item, band, wet)) return false
    } else if (item.warmth < warmth.min || item.warmth > warmth.max) {
      return false
    }
  }

  return true
}

function dayNumber(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null

  return Math.floor(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      86_400_000,
  )
}

function daysSince(lastWorn: string, today: string): number | null {
  const last = dayNumber(lastWorn)
  const now = dayNumber(today)
  if (last === null || now === null) return null
  return now - last
}

function idOf(item: WardrobeItem): number | null {
  return item.id ?? null
}

function suggestionKey(items: WardrobeItem[]): string {
  return items
    .map((item) => item.id ?? item.createdAt)
    .sort((a, b) => a - b)
    .join('-')
}

function itemBaseScore(
  item: WardrobeItem,
  occasion: Occasion,
  band: WeatherBand | null,
  todayKey: string,
  lastWorn: Map<number, string>,
  loved: Set<number>,
): number {
  let score = 50

  const formality = FORMALITY_RANGES[occasion]
  score -= Math.abs(item.formality - formality.ideal) * 8

  if (band) {
    score -= Math.abs(item.warmth - WARMTH_RANGES[band].ideal) * 6
  }

  const id = idOf(item)
  const lastWornOn = id === null ? undefined : lastWorn.get(id)

  if (lastWornOn) {
    const days = daysSince(lastWornOn, todayKey)
    if (days !== null) {
      if (days <= 1) score -= 10
      else if (days <= 3) score -= 4
      else score += 2
    }
  } else {
    score += 3
  }

  if (id !== null && loved.has(id)) score += 6

  return score
}

function rankGroup(
  items: WardrobeItem[],
  occasion: Occasion,
  band: WeatherBand | null,
  todayKey: string,
  lastWorn: Map<number, string>,
  loved: Set<number>,
): WardrobeItem[] {
  return [...items].sort((a, b) => {
    const difference =
      itemBaseScore(b, occasion, band, todayKey, lastWorn, loved) -
      itemBaseScore(a, occasion, band, todayKey, lastWorn, loved)
    if (difference !== 0) return difference
    return (a.id ?? a.createdAt) - (b.id ?? b.createdAt)
  })
}

interface ComboContext {
  occasion: Occasion
  band: WeatherBand | null
  wet: boolean
  todayKey: string
  lastWorn: Map<number, string>
  loved: Set<number>
  preferences: ColorPreferences | null
}

function scoreCombo(combo: WardrobeItem[], context: ComboContext): Suggestion {
  const { occasion, band, wet, todayKey, lastWorn, loved, preferences } =
    context
  const formality = FORMALITY_RANGES[occasion]
  const average =
    combo.reduce(
      (total, item) =>
        total + itemBaseScore(item, occasion, band, todayKey, lastWorn, loved),
      0,
    ) / combo.length

  let score = average
  const reasons: string[] = []

  const harmony = colorHarmony(combo)
  score += harmony.score

  const hasShoes = combo.some((item) => item.category === 'shoes')
  const hasOuterwear = combo.some((item) => item.category === 'outerwear')
  const recentlyWorn = combo.some((item) => {
    const id = idOf(item)
    if (id === null) return false
    const lastWornOn = lastWorn.get(id)
    if (!lastWornOn) return false
    const days = daysSince(lastWornOn, todayKey)
    return days !== null && days <= 3
  })

  if (band) {
    reasons.push(`Warmth for a ${band} day`)
    if (band === 'cold' && hasOuterwear) score += 4
    if (wet && hasShoes) {
      score += 3
      reasons.push('Shoes with a bit more coverage')
    }
  }

  if (preferences && preferences.lovedColors.length > 0) {
    const lovedMatches = combo.filter((item) =>
      item.colors.some((color) =>
        matchesAnyColor(color, preferences.lovedColors),
      ),
    ).length

    if (lovedMatches > 0) {
      score += Math.min(lovedMatches * 2, 6)
      reasons.push('Includes a color you love')
    }
  }

  if (preferences && preferences.avoidColors.length > 0) {
    const avoidMatches = combo.filter((item) =>
      item.colors.some((color) =>
        matchesAnyColor(color, preferences.avoidColors),
      ),
    ).length

    if (avoidMatches > 0) score -= Math.min(avoidMatches * 3, 6)
  }

  if (preferences) {
    if (
      (preferences.undertone === 'warm' ||
        preferences.undertone === 'cool') &&
      dominantTemperature(combo) === preferences.undertone
    ) {
      score += 2
      reasons.push(
        preferences.undertone === 'warm'
          ? 'Warm-leaning colors, as you prefer'
          : 'Cool-leaning colors, as you prefer',
      )
    }

    if (
      preferences.contrast !== 'unsure' &&
      contrastLevel(combo) === preferences.contrast
    ) {
      score += 2
      reasons.push(
        preferences.contrast === 'high'
          ? 'High-contrast pairing, as you prefer'
          : preferences.contrast === 'low'
            ? 'Low-contrast pairing, as you prefer'
            : 'Medium-contrast pairing, as you prefer',
      )
    }
  }

  const anyLoved = combo.some((item) => {
    const id = idOf(item)
    return id !== null && loved.has(id)
  })
  if (anyLoved) reasons.push('Includes a piece you loved')

  const formalityFits = combo.every(
    (item) => Math.abs(item.formality - formality.ideal) <= 1,
  )
  if (formalityFits) {
    score += 2
    reasons.push(`Fits a ${OCCASION_LABELS[occasion].toLowerCase()} occasion`)
  }

  if (harmony.reason) reasons.push(harmony.reason)

  if (!recentlyWorn) reasons.push('Pieces you have not worn lately')

  if (reasons.length === 0) reasons.push('All clean and ready')

  return {
    key: suggestionKey(combo),
    items: combo,
    score: Math.round(score * 100) / 100,
    reasons: [...new Set(reasons)].slice(0, 3),
  }
}

function combinations(
  bases: WardrobeItem[][],
  extras: WardrobeItem[][],
): WardrobeItem[][] {
  let combos = bases.map((base) => [...base])

  for (const options of extras) {
    if (options.length === 0) continue
    combos = combos.flatMap((combo) =>
      options.map((option) => [...combo, option]),
    )
  }

  return combos
}

export function recommend(input: RecommendationInput): RecommendationResult {
  const {
    items,
    occasion,
    band,
    wet,
    today,
    lastWornByItem = new Map(),
    lovedItemIds = new Set(),
    skippedKeys = [],
    preferences,
    limit = 3,
  } = input

  if (items.length === 0) {
    return {
      suggestions: [],
      cleanCount: 0,
      message: 'Add a few pieces and suggestions will appear here.',
    }
  }

  const clean = items.filter((item) => item.status === 'clean')
  const season = seasonForMonth(today.getMonth())
  const todayKey = localIsoDate(today)

  const eligible = items.filter((item) =>
    isEligible(item, occasion, season, band, wet),
  )
  const byCategory = new Map<Category, WardrobeItem[]>()
  for (const item of eligible) {
    const group = byCategory.get(item.category) ?? []
    group.push(item)
    byCategory.set(item.category, group)
  }

  const ranked = (category: Category, cap: number) =>
    rankGroup(
      byCategory.get(category) ?? [],
      occasion,
      band,
      todayKey,
      lastWornByItem,
      lovedItemIds,
    ).slice(0, cap)

  const tops = ranked('top', 6)
  const bottoms = ranked('bottom', 6)
  const dresses = ranked('dress', 4)
  const shoes = ranked('shoes', 4)
  const outerwear =
    band === 'cold' || band === 'cool' ? ranked('outerwear', 3) : []
  const accessories = ranked('accessory', 2)

  const bases: WardrobeItem[][] = [
    ...dresses.map((dress) => [dress]),
    ...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])),
  ]

  if (bases.length === 0) {
    const wardrobeHasCore =
      items.some((item) => item.category === 'dress') ||
      (items.some((item) => item.category === 'top') &&
        items.some((item) => item.category === 'bottom'))

    return {
      suggestions: [],
      cleanCount: clean.length,
      message:
        clean.length === 0
          ? 'Everything is in the wash. Mark a piece clean to see picks.'
          : !wardrobeHasCore
            ? 'Add a top and a bottom, or a dress, to build a look.'
            : 'Nothing clean fits this occasion and weather right now. Try another occasion.',
    }
  }

  const extras: WardrobeItem[][] = []
  if (shoes.length > 0) extras.push(shoes)
  if (outerwear.length > 0) extras.push(outerwear)
  if (accessories.length > 0) extras.push(accessories)

  const skipped = new Set(skippedKeys)
  const context: ComboContext = {
    occasion,
    band,
    wet,
    todayKey,
    lastWorn: lastWornByItem,
    loved: lovedItemIds,
    preferences: preferences ?? null,
  }

  const suggestions = combinations(bases, extras)
    .filter((combo) => !skipped.has(suggestionKey(combo)))
    .map((combo) => scoreCombo(combo, context))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.key.localeCompare(b.key)
    })
    .slice(0, limit)

  return {
    suggestions,
    cleanCount: clean.length,
    message:
      suggestions.length === 0
        ? 'You skipped every pick for today. Show them again or switch occasion.'
        : null,
  }
}

/** The latest local date each item was worn, joined through saved looks. */
export function lastWornByItem(
  outfits: Outfit[],
  events: WearEvent[],
): Map<number, string> {
  const outfitsById = new Map(
    outfits.flatMap((outfit) =>
      outfit.id === undefined ? [] : [[outfit.id, outfit] as const],
    ),
  )
  const result = new Map<number, string>()

  for (const event of events) {
    const outfit = outfitsById.get(event.outfitId)
    if (!outfit) continue

    for (const itemId of outfit.itemIds) {
      const current = result.get(itemId)
      if (!current || event.wornOn > current) result.set(itemId, event.wornOn)
    }
  }

  return result
}

/** Items that appear in a look marked “loved”, used as a small score bonus. */
export function lovedItemIds(
  outfits: Outfit[],
  events: WearEvent[],
): Set<number> {
  const outfitsById = new Map(
    outfits.flatMap((outfit) =>
      outfit.id === undefined ? [] : [[outfit.id, outfit] as const],
    ),
  )
  const result = new Set<number>()

  for (const event of events) {
    if (event.feedback !== 'loved') continue
    const outfit = outfitsById.get(event.outfitId)
    if (!outfit) continue
    for (const itemId of outfit.itemIds) result.add(itemId)
  }

  return result
}

export function findMatchingOutfit(
  outfits: Outfit[],
  itemIds: number[],
): Outfit | undefined {
  const target = [...itemIds].sort((a, b) => a - b).join(',')
  return outfits.find(
    (outfit) =>
      [...outfit.itemIds].sort((a, b) => a - b).join(',') === target,
  )
}

export function suggestionName(
  suggestion: Suggestion,
  occasion: Occasion,
): string {
  const anchor =
    suggestion.items.find((item) => item.category === 'dress') ??
    suggestion.items.find((item) => item.category === 'top') ??
    suggestion.items[0]

  return `${OCCASION_LABELS[occasion]} pick · ${anchor.name}`.slice(0, 80)
}

const SKIP_KEY = 'wardrobe.skips.v1'

interface SkipRecord {
  date: string
  keys: string[]
}

export function readSkippedKeys(today: string): string[] {
  try {
    const raw = window.localStorage.getItem(SKIP_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as Partial<SkipRecord>
    if (parsed.date !== today || !Array.isArray(parsed.keys)) return []

    return parsed.keys.filter((key): key is string => typeof key === 'string')
  } catch {
    return []
  }
}

export function writeSkippedKeys(today: string, keys: string[]): void {
  try {
    window.localStorage.setItem(SKIP_KEY, JSON.stringify({ date: today, keys }))
  } catch {
    // Skipping is a convenience; blocked storage just forgets the choice.
  }
}