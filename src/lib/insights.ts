import { isNeutralColor } from './colors'
import type { Outfit, WardrobeItem, WearEvent } from '../types'

export interface GapInsight {
  key: string
  title: string
  detail: string
}

export interface CostRow {
  item: WardrobeItem
  wears: number
  perWear: number | null
}

export interface CostSummary {
  pricedCount: number
  totalValue: number
  totalItemWears: number
  averagePerWear: number | null
  rows: CostRow[]
  unwornCount: number
}

const MAX_PRICE = 1_000_000_000

const amountFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** A positive amount rounded to cents, or null for anything unusable. */
export function parsePrice(value: unknown): number | null {
  const amount =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value

  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  if (amount <= 0 || amount > MAX_PRICE) return null

  return round2(amount)
}

/** Locale-aware amount without a currency symbol; the user owns the unit. */
export function formatAmount(value: number): string {
  return amountFormatter.format(value)
}

/**
 * How many logged wears touched each piece. A piece counts once per wear
 * event, even if a saved look somehow lists it twice.
 */
export function wearsByItem(
  outfits: Outfit[],
  events: WearEvent[],
): Map<number, number> {
  const byId = new Map<number, Outfit>()
  for (const outfit of outfits) {
    if (outfit.id !== undefined) byId.set(outfit.id, outfit)
  }

  const counts = new Map<number, number>()
  for (const event of events) {
    const outfit = byId.get(event.outfitId)
    if (!outfit) continue

    for (const itemId of new Set(outfit.itemIds)) {
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
    }
  }

  return counts
}

/**
 * Cost per wear is price divided by logged wears. Unworn pieces are kept in
 * the rows with a null value so the UI can name them instead of hiding them.
 */
export function costSummary(
  items: WardrobeItem[],
  outfits: Outfit[],
  events: WearEvent[],
): CostSummary {
  const counts = wearsByItem(outfits, events)
  const priced = items.filter(
    (item): item is WardrobeItem & { price: number } =>
      typeof item.price === 'number' &&
      Number.isFinite(item.price) &&
      item.price > 0,
  )

  let totalValue = 0
  let totalItemWears = 0
  let unwornCount = 0

  const rows: CostRow[] = priced.map((item) => {
    const wears = item.id !== undefined ? (counts.get(item.id) ?? 0) : 0
    totalValue += item.price
    totalItemWears += wears
    if (wears === 0) unwornCount += 1

    return {
      item,
      wears,
      perWear: wears > 0 ? round2(item.price / wears) : null,
    }
  })

  rows.sort((a, b) => {
    if (a.perWear === null && b.perWear === null) {
      return a.item.name.localeCompare(b.item.name)
    }
    if (a.perWear === null) return 1
    if (b.perWear === null) return -1
    if (b.perWear !== a.perWear) return b.perWear - a.perWear
    return b.wears - a.wears
  })

  return {
    pricedCount: priced.length,
    totalValue: round2(totalValue),
    totalItemWears,
    averagePerWear:
      totalItemWears > 0 ? round2(totalValue / totalItemWears) : null,
    rows,
    unwornCount,
  }
}

/**
 * Plain gaps a small wardrobe can have. Each one maps to a real constraint in
 * the suggestion engine: a base, a formal option, warmth at both ends, shoes,
 * and a neutral anchor.
 */
export function wardrobeGaps(items: WardrobeItem[]): GapInsight[] {
  if (items.length === 0) return []

  const gaps: GapInsight[] = []
  const hasDress = items.some((item) => item.category === 'dress')
  const hasTop = items.some((item) => item.category === 'top')
  const hasBottom = items.some((item) => item.category === 'bottom')

  if (!hasDress && (!hasTop || !hasBottom)) {
    gaps.push({
      key: 'base',
      title: 'No complete base yet',
      detail: 'A top and a bottom, or a dress, is where every pick starts.',
    })
  }

  if (!items.some((item) => item.formality >= 4)) {
    gaps.push({
      key: 'formal',
      title: 'Nothing for a formal occasion',
      detail: 'No piece is rated smart or formal yet.',
    })
  }

  if (!items.some((item) => item.warmth >= 4)) {
    gaps.push({
      key: 'cold',
      title: 'Nothing for a cold snap',
      detail: 'No piece is rated warm or heavy yet.',
    })
  }

  if (!items.some((item) => item.warmth <= 2)) {
    gaps.push({
      key: 'hot',
      title: 'Nothing for a heatwave',
      detail: 'No piece is rated very light or light yet.',
    })
  }

  const shoes = items.filter((item) => item.category === 'shoes')
  if (shoes.length === 0) {
    gaps.push({
      key: 'shoes',
      title: 'No shoes yet',
      detail: 'Picks can stand without them, but a pair finishes the look.',
    })
  } else if (!shoes.some((item) => item.warmth >= 3)) {
    gaps.push({
      key: 'rainShoes',
      title: 'No rain-ready shoes',
      detail: 'Add a pair rated medium warmth or above for wet days.',
    })
  }

  if (!items.some((item) => item.colors.some(isNeutralColor))) {
    gaps.push({
      key: 'neutral',
      title: 'No neutral anchor',
      detail: 'A white, grey, navy, or black piece helps colors sit together.',
    })
  }

  return gaps
}
