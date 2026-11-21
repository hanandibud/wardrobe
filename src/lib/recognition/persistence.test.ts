import { beforeEach, describe, expect, it } from 'vitest'

// Install IndexedDB before `../db` is imported. The rest of the suite does not
// use a database, so this stays isolated to the persistence regression tests.
import 'fake-indexeddb/auto'

const { db } = await import('../../db')
const { toStoredRecognitionFields } = await import('./draft')
const { savedFieldsToProtect, recognitionPatch } = await import('./draft')
const { parseRecognitionResponse } = await import('./parse')

const baseItem = {
  name: 'Olive linen shirt',
  category: 'top' as const,
  colors: ['#60704d'],
  warmth: 3 as const,
  formality: 2 as const,
  seasons: ['spring' as const],
  status: 'clean' as const,
  notes: 'Favourite summer shirt',
  price: 48,
  image: new Blob(['image'], { type: 'image/webp' }),
  createdAt: 1_763_380_800_000,
  subcategory: 'shirt' as const,
  pattern: 'solid' as const,
  material: 'linen' as const,
  fit: 'regular' as const,
  sleeve: 'long' as const,
  occasions: ['everyday' as const, 'work' as const],
}

beforeEach(async () => {
  await db.items.clear()
})

describe('edit-mode persistence', () => {
  it('removes cleared optional attributes instead of leaving stale values', async () => {
    const id = await db.items.add(baseItem)

    // The edit form clears type, material, and occasions, then saves.
    await db.items.update(id, {
      ...toStoredRecognitionFields(
        {
          subcategory: '',
          pattern: '',
          material: '',
          fit: '',
          sleeve: '',
          occasions: [],
        },
        'top',
      ),
    })

    const row = await db.items.get(id)
    expect(row?.subcategory).toBeUndefined()
    expect(row?.pattern).toBeUndefined()
    expect(row?.material).toBeUndefined()
    expect(row?.fit).toBeUndefined()
    expect(row?.sleeve).toBeUndefined()
    expect(row?.occasions).toBeUndefined()
  })

  it('preserves unrelated saved attributes when recognition fields change', async () => {
    const id = await db.items.add(baseItem)

    await db.items.update(id, {
      ...toStoredRecognitionFields(
        {
          subcategory: 'shirt',
          pattern: 'solid',
          material: 'wool',
          fit: 'regular',
          sleeve: 'long',
          occasions: ['work'],
        },
        'top',
      ),
    })

    const row = await db.items.get(id)
    expect(row?.name).toBe('Olive linen shirt')
    expect(row?.category).toBe('top')
    expect(row?.colors).toEqual(['#60704d'])
    expect(row?.warmth).toBe(3)
    expect(row?.formality).toBe(2)
    expect(row?.seasons).toEqual(['spring'])
    expect(row?.status).toBe('clean')
    expect(row?.notes).toBe('Favourite summer shirt')
    expect(row?.price).toBe(48)
    expect(row?.material).toBe('wool')
  })

  it('does not keep an incompatible subcategory after a category change', async () => {
    const id = await db.items.add(baseItem)

    // A category button change clears the type in the form; the save helper is
    // the final guard if a stale type ever reaches it.
    await db.items.update(id, {
      category: 'bottom',
      ...toStoredRecognitionFields(
        {
          subcategory: 'shirt',
          pattern: '',
          material: '',
          fit: '',
          sleeve: '',
          occasions: [],
        },
        'bottom',
      ),
    })

    const row = await db.items.get(id)
    expect(row?.category).toBe('bottom')
    expect(row?.subcategory).toBeUndefined()
  })

  it('clears only the rejected prediction and keeps the accepted ones', async () => {
    const id = await db.items.add(baseItem)

    await db.items.update(id, {
      ...toStoredRecognitionFields(
        {
          subcategory: 'shirt',
          pattern: 'solid',
          material: '',
          fit: 'regular',
          sleeve: 'long',
          occasions: ['work'],
        },
        'top',
      ),
    })

    const row = await db.items.get(id)
    expect(row?.material).toBeUndefined()
    expect(row?.pattern).toBe('solid')
    expect(row?.fit).toBe('regular')
    expect(row?.sleeve).toBe('long')
    expect(row?.occasions).toEqual(['work'])
  })

  it('protects every saved field from a replacement-photo recognition result', async () => {
    const id = await db.items.add(baseItem)
    const row = await db.items.get(id)
    if (!row) throw new Error('missing test row')

    const recognized = parseRecognitionResponse(
      {
        name: 'AI name',
        category: 'bottom',
        subcategory: 'jeans',
        colors: ['#ff0000'],
        pattern: 'plaid',
        material: 'denim',
        fit: 'oversized',
        formality: 5,
        warmth: 1,
        sleeve: 'short',
        seasons: ['winter'],
        occasions: ['formal'],
      },
      'test',
      'ai',
    )

    // This is exactly what the form would apply after a photo replacement if
    // the saved-field guard were missing.
    expect(recognitionPatch(recognized, savedFieldsToProtect(row))).toEqual({})
  })
})
