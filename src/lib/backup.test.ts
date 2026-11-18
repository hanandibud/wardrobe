import { beforeEach, describe, expect, it, vi } from 'vitest'

// The rest of the suite runs without an IndexedDB, so only the tests that
// touch `importBackup` install a fake one. It must be installed before `./db`
// (which opens Dexie) is imported, so everything here is dynamic.
import 'fake-indexeddb/auto'

// `importBackup` decodes each restored photo with browser APIs (fetch + a
// canvas). Node has neither, so swap the decode for a pass-through: these
// tests exercise the validation and the Dexie write/rollback, not the pixels.
vi.mock('./images', () => ({
  prepareRestoredImage: (blob: Blob) => Promise.resolve(blob),
  prepareImage: (file: File) => Promise.resolve(file),
  validateImageFile: () => undefined,
}))

const {
  BACKUP_VERSION,
  MAX_BACKUP_ITEMS,
  MAX_BACKUP_OUTFITS,
  MAX_BACKUP_WEAR_EVENTS,
  MAX_RESTORED_IMAGE_BYTES,
  decodedImageByteLength,
  importBackup,
  parseBackup,
} = await import('./backup')
const { db } = await import('../db')

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

  it('carries a usable price and drops an unusable one', () => {
    const result = parseBackup(
      backup([
        validItem({ id: 1, price: 48.999 }),
        validItem({ id: 2, name: 'Second piece', price: -3 }),
        validItem({ id: 3, name: 'Third piece', price: 'free' }),
      ]),
    )

    expect(result.items[0].price).toBe(49)
    expect(result.items[1].price).toBeUndefined()
    expect(result.items[2].price).toBeUndefined()
  })

  it('rejects a backup with more items than the cap', () => {
    const tooMany = Array.from({ length: MAX_BACKUP_ITEMS + 1 }, (_, index) =>
      validItem({ id: index + 1, name: `Piece ${index}`, createdAt: index }),
    )

    expect(() => parseBackup(backup(tooMany))).toThrow(
      `That backup has ${MAX_BACKUP_ITEMS + 1} pieces. The most a backup can hold is ${MAX_BACKUP_ITEMS}.`,
    )
  })

  it('rejects a backup with more looks than the cap', () => {
    const outfits = Array.from({ length: MAX_BACKUP_OUTFITS + 1 }, (_, index) =>
      validOutfit({ id: index + 1, name: `Look ${index}`, createdAt: index }),
    )

    expect(() => parseBackup(backup([validItem()], BACKUP_VERSION, { outfits }))).toThrow(
      `That backup has ${MAX_BACKUP_OUTFITS + 1} looks. The most a backup can hold is ${MAX_BACKUP_OUTFITS}.`,
    )
  })

  it('rejects a backup with more wear entries than the cap', () => {
    const wearEvents = Array.from(
      { length: MAX_BACKUP_WEAR_EVENTS + 1 },
      (_, index) => validWearEvent({ id: index + 1, createdAt: index }),
    )

    expect(() =>
      parseBackup(backup([validItem()], BACKUP_VERSION, { wearEvents })),
    ).toThrow(
      `That backup has ${MAX_BACKUP_WEAR_EVENTS + 1} wear entries. The most a backup can hold is ${MAX_BACKUP_WEAR_EVENTS}.`,
    )
  })

  it('rejects a single photo larger than the per-image cap', () => {
    const oversized = `data:image/png;base64,${'A'.repeat(
      Math.ceil((MAX_RESTORED_IMAGE_BYTES * 4) / 3) + 100,
    )}`

    const file = new File([backup([validItem({ image: oversized })])], 'w.json', {
      type: 'application/json',
    })

    return expect(importBackup(file)).rejects.toThrow(
      'The photo for "Olive linen camp shirt" is too large to restore. No pieces were imported.',
    )
  })
})

describe('decodedImageByteLength', () => {
  it('ignores the data URL header', () => {
    const body = 'UklGRqg' // 8 base64 chars -> 6 bytes
    expect(decodedImageByteLength(`data:image/webp;base64,${body}`)).toBe(6)
  })

  it('grows with the payload', () => {
    const small = decodedImageByteLength(`data:image/png;base64,${'A'.repeat(40)}`)
    const large = decodedImageByteLength(`data:image/png;base64,${'A'.repeat(400)}`)
    expect(large).toBeGreaterThan(small)
  })
})

describe('importBackup', () => {
  beforeEach(async () => {
    await Promise.all([
      db.items.clear(),
      db.outfits.clear(),
      db.wearEvents.clear(),
    ])
  })

  it('imports a normal backup and round-trips it back out', async () => {
    const payload = backup([validItem()], BACKUP_VERSION, {
      outfits: [validOutfit()],
      wearEvents: [validWearEvent()],
    })
    const file = new File([payload], 'wardrobe.json', {
      type: 'application/json',
    })

    const result = await importBackup(file)

    expect(result.imported).toEqual({ items: 1, outfits: 1, wearEvents: 1 })
    expect(result.skipped).toBe(0)

    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Olive linen camp shirt')

    const outfits = await db.outfits.toArray()
    expect(outfits).toHaveLength(1)
    // The look's itemIds are remapped to the freshly assigned item id.
    expect(outfits[0].itemIds).toEqual([items[0].id])

    const events = await db.wearEvents.toArray()
    expect(events).toHaveLength(1)
    expect(events[0].outfitId).toBe(outfits[0].id)
  })

  it('ignores a preferences field from an older backup and still imports', async () => {
    // A hand-edited or older backup that carries a device-local preferences
    // blob must import cleanly: preferences were never wardrobe data and the
    // import reads only known keys, so the field is dropped.
    const payload = JSON.stringify({
      app: 'wardrobe',
      version: BACKUP_VERSION,
      exportedAt: '2026-11-17T12:00:00.000Z',
      preferences: {
        undertone: 'warm',
        contrast: 'high',
        lovedColors: ['#6b6b3a'],
        avoidColors: ['#a83232'],
        updatedAt: 1,
      },
      items: [validItem()],
    })
    const file = new File([payload], 'wardrobe.json', {
      type: 'application/json',
    })

    const result = await importBackup(file)

    expect(result.imported).toEqual({ items: 1, outfits: 0, wearEvents: 0 })
    expect(result.skipped).toBe(0)

    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Olive linen camp shirt')
  })

  it('aborts the whole import and writes nothing when an image is corrupt', async () => {
    const corrupt = 'data:image/png;base64,@@not really an image@@'
    const payload = backup([
      validItem(),
      validItem({ id: 2, name: 'Broken piece', image: corrupt, createdAt: 2 }),
    ])
    const file = new File([payload], 'wardrobe.json', {
      type: 'application/json',
    })

    await expect(importBackup(file)).rejects.toThrow(
      'The photo for "Broken piece" could not be restored. No pieces were imported.',
    )

    // The transaction must not have left the good item behind.
    expect(await db.items.toArray()).toEqual([])
    expect(await db.outfits.toArray()).toEqual([])
    expect(await db.wearEvents.toArray()).toEqual([])
  })
})
