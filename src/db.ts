import Dexie, { type Table } from 'dexie'
import type { Outfit, WardrobeItem, WearEvent } from './types'

class WardrobeDatabase extends Dexie {
  items!: Table<WardrobeItem, number>
  outfits!: Table<Outfit, number>
  wearEvents!: Table<WearEvent, number>

  constructor() {
    super('wardrobe')
    this.version(1).stores({
      items: '++id, category, status, createdAt, lastWornAt',
      outfits: '++id, createdAt',
      wearEvents: '++id, outfitId, wornOn',
    })
  }
}

export const db = new WardrobeDatabase()
