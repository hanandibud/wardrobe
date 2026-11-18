import type { Outfit, WardrobeItem, WearEvent } from '../types'
import { resolveOutfitItems } from './outfits'

/**
 * Local calendar date as YYYY-MM-DD. Using UTC here would file a late-evening
 * wear under tomorrow, so the date is built from local parts.
 */
export function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** "Today", "Yesterday", or a readable date, compared in local time. */
export function describeWornOn(wornOn: string, today: Date): string {
  if (wornOn === localIsoDate(today)) return 'Today'

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (wornOn === localIsoDate(yesterday)) return 'Yesterday'

  const parsed = parseIsoDate(wornOn)
  return parsed ? dayFormatter.format(parsed) : wornOn
}

export interface WearHistoryEntry {
  event: WearEvent
  outfit?: Outfit
  pieces: WardrobeItem[]
}

/**
 * Wear events, newest first, joined to the look and its remaining pieces.
 * An event whose outfit is gone is kept with `outfit` undefined so the view
 * can show it as a removed look instead of crashing.
 */
export function buildWearHistory(
  events: WearEvent[],
  outfits: Outfit[],
  items: WardrobeItem[],
): WearHistoryEntry[] {
  const outfitsById = new Map(
    outfits.flatMap((outfit) =>
      outfit.id === undefined ? [] : [[outfit.id, outfit] as const],
    ),
  )

  return [...events]
    .sort((a, b) => {
      if (a.wornOn !== b.wornOn) return a.wornOn < b.wornOn ? 1 : -1
      return b.createdAt - a.createdAt
    })
    .map((event) => {
      const outfit = outfitsById.get(event.outfitId)

      return {
        event,
        outfit,
        pieces: outfit ? resolveOutfitItems(outfit, items) : [],
      }
    })
}