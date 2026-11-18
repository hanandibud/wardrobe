import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, parseBackup } from './backup'

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Olive linen camp shirt',
    category: 'top',
    colors: ['#60704d'],
    warmth: 3,
    formality: 2,
    seasons: ['summer'],
    status: 'clean',
    notes: 'Soft washed linen.',
    image: 'data:image/webp;base64,UklGRqg',
    createdAt: 1763380800000,
    ...overrides,
  }
}

function validOutfit(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'Rainy Thursday',
    itemIds: [1, 2],
    occasion: 'work',
    seasons: ['autumn'],
    createdAt: 1763380900000,
    ...overrides,
  }
}

function validWearEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    outfitId: 5,
    wornOn: '2026-11-18',
    feedback: 'loved',
    createdAt: 1763470000000,
    ...overrides,
  }
}

function backup(
  items: unknown[],
  version: number = BACKUP_VERSION,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    app: 'wardrobe',
    version,
    exportedAt: '2026-11-17T12:00:00.000Z',
    items,
    ...extra,
  })
}

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('not json')).toThrow('That file is not valid JSON.')
  })

  it('rejects JSON that is not a Wardrobe backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(
      'That file is not a Wardrobe backup.',
    )
    expect(() => parseBackup('[]')).toThrow('That file is not a Wardrobe backup.')
  })

  it('rejects a backup from a newer version', () => {
    expect(() => parseBackup(backup([validItem()], BACKUP_VERSION + 1))).toThrow(
      'This backup was made by a newer version of Wardrobe.',
    )
  })

  it('rejects a backup whose version is not supported', () => {
    expect(() => parseBackup(backup([validItem()], 0))).toThrow(
      'This backup format is not supported.',
    )
    expect(() => parseBackup(backup([validItem()], 'v1' as unknown as number))).toThrow(
      'This backup format is not supported.',
    )
  })

  it('rejects a backup with no items list', () => {
    expect(() => parseBackup('{"app":"wardrobe","version":1}')).toThrow(
      'That backup has no items.',
    )
  })

  it('rejects a backup with no usable pieces', () => {
    expect(() => parseBackup(backup([{ name: 'no image' }]))).toThrow(
      'No valid pieces were found in that backup.',
    )
    expect(() => parseBackup(backup([]))).toThrow(
      'No valid pieces were found in that backup.',
    )
  })

  it('reads a valid item', () => {
    const result = parseBackup(backup([validItem()]))

    expect(result.items).toHaveLength(1)
    expect(result.skipped).toBe(0)
    expect(result.items[0].name).toBe('Olive linen camp shirt')
    expect(result.items[0].createdAt).toBe(1763380800000)
    expect(result.items[0].id).toBe(1)
  })

  it('still reads a version 1 backup', () => {
    const result = parseBackup(backup([validItem({ id: undefined })], 1))

    expect(result.version).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.outfits).toEqual([])
    expect(result.wearEvents).toEqual([])
  })

  it('reads looks and wear entries', () => {
    const result = parseBackup(
      backup([validItem()], BACKUP_VERSION, {
        outfits: [validOutfit()],
        wearEvents: [validWearEvent()],
      }),
    )

    expect(result.outfits).toHaveLength(1)
    expect(result.outfits[0]).toMatchObject({
      id: 5,
      name: 'Rainy Thursday',
      itemIds: [1, 2],
      occasion: 'work',
      seasons: ['autumn'],
    })
    expect(result.wearEvents).toHaveLength(1)
    expect(result.wearEvents[0]).toMatchObject({
      id: 9,
      outfitId: 5,
      wornOn: '2026-11-18',
      feedback: 'loved',
    })
  })

  it('skips broken items but keeps the good ones', () => {
    const result = parseBackup(
      backup([
        validItem(),
        validItem({ name: '' }),
        validItem({ image: 'https://example.com/shirt.png' }),
        validItem({ category: 'hat' }),
        validItem({ status: 'missing' }),
        validItem({ warmth: 9 }),
        validItem({ formality: 0 }),
        validItem({ createdAt: 'yesterday' }),
        'not an object',
      ]),
    )

    expect(result.items).toHaveLength(1)
    expect(result.skipped).toBe(8)
  })

  it('skips broken looks and wear entries', () => {
    const result = parseBackup(
      backup([validItem()], BACKUP_VERSION, {
        outfits: [
          validOutfit(),
          validOutfit({ name: '' }),
          validOutfit({ occasion: 'gala' }),
          validOutfit({ createdAt: 'today' }),
          validOutfit({ itemIds: 'none' }),
        ],
        wearEvents: [
          validWearEvent(),
          validWearEvent({ outfitId: 0 }),
          validWearEvent({ wornOn: '2026-02-31' }),
          validWearEvent({ wornOn: 'yesterday' }),
          validWearEvent({ createdAt: null }),
          validWearEvent({ feedback: 'amazing' }),
        ],
      }),
    )

    expect(result.outfits).toHaveLength(2)
    expect(result.wearEvents).toHaveLength(2)
    expect(result.skipped).toBe(7)
  })

  it('keeps a look even when some ids are not usable', () => {
    const result = parseBackup(
      backup([validItem()], BACKUP_VERSION, {
        outfits: [validOutfit({ itemIds: [1, 0, -2, 3.5, '4'] })],
      }),
    )

    expect(result.outfits[0].itemIds).toEqual([1])
  })

  it('drops colors and seasons it does not recognise', () => {
    const result = parseBackup(
      backup([
        validItem({
          colors: ['#60704D', 'olive', '#12345', '#zzzzzz', 12],
          seasons: ['summer', 'monsoon', 3],
        }),
      ]),
    )

    expect(result.items[0].colors).toEqual(['#60704D'])
    expect(result.items[0].seasons).toEqual(['summer'])
  })

  it('treats missing optional fields as undefined', () => {
    const result = parseBackup(
      backup([validItem({ notes: undefined, lastWornAt: undefined })]),
    )

    expect(result.items[0].notes).toBeUndefined()
    expect(result.items[0].lastWornAt).toBeUndefined()
  })

  it('keeps lastWornAt when it is a number', () => {
    const result = parseBackup(backup([validItem({ lastWornAt: 1763500000000 })]))
    expect(result.items[0].lastWornAt).toBe(1763500000000)
  })
})
