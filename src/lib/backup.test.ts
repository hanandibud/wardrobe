import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, parseBackup } from './backup'

function validItem(overrides: Record<string, unknown> = {}) {
  return {
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

function backup(items: unknown[], version: number = BACKUP_VERSION) {
  return JSON.stringify({
    app: 'wardrobe',
    version,
    exportedAt: '2026-11-17T12:00:00.000Z',
    items,
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

  it('rejects a backup whose version is not a number', () => {
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
