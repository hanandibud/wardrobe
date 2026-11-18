import { describe, expect, it } from 'vitest'
import { buildWearHistory, describeWornOn, localIsoDate } from './wear'
import type { Outfit, WardrobeItem, WearEvent } from '../types'

function item(id: number): WardrobeItem {
  return {
    id,
    name: `Piece ${id}`,
    category: 'top',
    colors: [],
    warmth: 3,
    formality: 2,
    seasons: ['summer'],
    status: 'clean',
    image: new Blob(),
    createdAt: id,
  }
}

function outfit(id: number, itemIds: number[]): Outfit {
  return {
    id,
    name: `Look ${id}`,
    itemIds,
    occasion: 'casual',
    seasons: ['summer'],
    createdAt: id,
  }
}

function wear(id: number, outfitId: number, wornOn: string, createdAt: number): WearEvent {
  return { id, outfitId, wornOn, createdAt }
}

describe('localIsoDate', () => {
  it('zero-pads the month and day', () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('keeps the local calendar day for a late-evening timestamp', () => {
    expect(localIsoDate(new Date(2026, 10, 18, 23, 45))).toBe('2026-11-18')
  })
})

describe('describeWornOn', () => {
  const today = new Date(2026, 10, 18, 9, 30)

  it('calls the current local date today', () => {
    expect(describeWornOn('2026-11-18', today)).toBe('Today')
  })

  it('calls the day before yesterday, including across a month boundary', () => {
    expect(describeWornOn('2026-11-17', today)).toBe('Yesterday')
    expect(describeWornOn('2026-11-30', new Date(2026, 11, 1, 9))).toBe('Yesterday')
  })

  it('formats older dates with the year', () => {
    const label = describeWornOn('2026-11-02', today)

    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label).toContain('2026')
  })

  it('falls back to the stored string when the date is malformed', () => {
    expect(describeWornOn('not-a-date', today)).toBe('not-a-date')
  })
})

describe('buildWearHistory', () => {
  const pieces = [item(1), item(2), item(3)]
  const outfits = [outfit(1, [3, 1]), outfit(2, [2])]

  it('sorts by worn date, then by the time the entry was added', () => {
    const entries = buildWearHistory(
      [
        wear(1, 1, '2026-11-16', 10),
        wear(2, 2, '2026-11-18', 20),
        wear(3, 2, '2026-11-18', 30),
        wear(4, 1, '2026-11-17', 40),
      ],
      outfits,
      pieces,
    )

    expect(entries.map((entry) => entry.event.id)).toEqual([3, 2, 4, 1])
  })

  it('joins the look and its pieces in the saved order', () => {
    const [entry] = buildWearHistory([wear(1, 1, '2026-11-18', 10)], outfits, pieces)

    expect(entry.outfit?.name).toBe('Look 1')
    expect(entry.pieces.map((piece) => piece.id)).toEqual([3, 1])
  })

  it('keeps an event whose look was removed, without pieces', () => {
    const [entry] = buildWearHistory([wear(1, 99, '2026-11-18', 10)], outfits, pieces)

    expect(entry.outfit).toBeUndefined()
    expect(entry.pieces).toEqual([])
  })

  it('returns an empty list when nothing has been worn', () => {
    expect(buildWearHistory([], outfits, pieces)).toEqual([])
  })
})