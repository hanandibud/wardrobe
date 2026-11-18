import { db } from '../db'
import { prepareRestoredImage } from './images'
import { parsePrice } from './insights'
import {
  CATEGORY_OPTIONS,
  OCCASION_OPTIONS,
  SEASON_OPTIONS,
  STATUS_OPTIONS,
  type Category,
  type Feedback,
  type ItemStatus,
  type Level,
  type Occasion,
  type Season,
  type WardrobeItem,
} from '../types'

export const BACKUP_VERSION = 2
const SUPPORTED_VERSIONS = new Set([1, 2])
const BACKUP_APP = 'wardrobe'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
/** Hard caps so a crafted backup cannot exhaust memory or the database. */
export const MAX_BACKUP_ITEMS = 5000
export const MAX_BACKUP_OUTFITS = 1000
export const MAX_BACKUP_WEAR_EVENTS = 20000
/** A single restored photo larger than this is rejected before decoding. */
export const MAX_RESTORED_IMAGE_BYTES = 20 * 1024 * 1024

const CATEGORY_VALUES = new Set<string>(
  CATEGORY_OPTIONS.map((option) => option.value),
)
const SEASON_VALUES = new Set<string>(
  SEASON_OPTIONS.map((option) => option.value),
)
const STATUS_VALUES = new Set<string>(
  STATUS_OPTIONS.map((option) => option.value),
)
const OCCASION_VALUES = new Set<string>(
  OCCASION_OPTIONS.map((option) => option.value),
)
const FEEDBACK_VALUES = new Set<string>(['loved', 'liked', 'meh', 'disliked'])

interface BackupItem {
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
  image: string
  createdAt: number
  lastWornAt?: number
}

interface BackupOutfit {
  id?: number
  name: string
  itemIds: number[]
  occasion: Occasion
  seasons: Season[]
  createdAt: number
}

interface BackupWearEvent {
  id?: number
  outfitId: number
  wornOn: string
  feedback?: Feedback
  createdAt: number
}

export interface BackupCounts {
  items: number
  outfits: number
  wearEvents: number
}

export interface WardrobeBackup {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  items: BackupItem[]
  outfits: BackupOutfit[]
  wearEvents: BackupWearEvent[]
}

export interface ParsedBackup {
  version: number
  items: BackupItem[]
  outfits: BackupOutfit[]
  wearEvents: BackupWearEvent[]
  skipped: number
}

export interface ImportResult {
  imported: BackupCounts
  duplicates: BackupCounts
  skipped: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLevel(value: unknown): value is Level {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function optionalId(value: unknown): number | undefined {
  return isPositiveInt(value) ? value : undefined
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read the image.'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Could not restore an image.')
  return response.blob()
}

function itemKey(item: Pick<BackupItem, 'name' | 'createdAt'>): string {
  return `${item.name}\u0000${item.createdAt}`
}

/**
 * Approximate decoded byte size of a `data:` URL before decoding it, so an
 * oversized photo is rejected without allocating the full buffer. base64
 * stores 3 bytes in 4 characters, ignoring the `data:...;base64,` prefix.
 * Rounds up so an unpadded payload is not underestimated.
 */
export function decodedImageByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const payload = comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
  return Math.ceil((payload.length * 3) / 4)
}

function parseBackupItem(value: unknown): BackupItem | null {
  if (!isRecord(value)) return null

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  if (!CATEGORY_VALUES.has(value.category as string)) return null
  if (!STATUS_VALUES.has(value.status as string)) return null
  if (!isLevel(value.warmth) || !isLevel(value.formality)) return null
  if (!isTimestamp(value.createdAt)) return null
  if (
    typeof value.image !== 'string' ||
    !value.image.startsWith('data:image/')
  ) {
    return null
  }

  const colors = Array.isArray(value.colors)
    ? value.colors.filter(isHexColor)
    : []
  const seasons = Array.isArray(value.seasons)
    ? value.seasons.filter(
        (season): season is Season =>
          typeof season === 'string' && SEASON_VALUES.has(season),
      )
    : []

  return {
    id: optionalId(value.id),
    name,
    category: value.category as Category,
    colors,
    warmth: value.warmth,
    formality: value.formality,
    seasons,
    status: value.status as ItemStatus,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    price: parsePrice(value.price) ?? undefined,
    image: value.image,
    createdAt: value.createdAt,
    lastWornAt: isTimestamp(value.lastWornAt) ? value.lastWornAt : undefined,
  }
}

function parseBackupOutfit(value: unknown): BackupOutfit | null {
  if (!isRecord(value)) return null

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  if (!OCCASION_VALUES.has(value.occasion as string)) return null
  if (!isTimestamp(value.createdAt)) return null

  const itemIds = Array.isArray(value.itemIds)
    ? value.itemIds.filter(isPositiveInt)
    : []
  const seasons = Array.isArray(value.seasons)
    ? value.seasons.filter(
        (season): season is Season =>
          typeof season === 'string' && SEASON_VALUES.has(season),
      )
    : []

  return {
    id: optionalId(value.id),
    name,
    itemIds,
    occasion: value.occasion as Occasion,
    seasons,
    createdAt: value.createdAt,
  }
}

function parseBackupWearEvent(value: unknown): BackupWearEvent | null {
  if (!isRecord(value)) return null
  if (!isPositiveInt(value.outfitId)) return null
  if (!isIsoDate(value.wornOn)) return null
  if (!isTimestamp(value.createdAt)) return null

  const feedback =
    typeof value.feedback === 'string' && FEEDBACK_VALUES.has(value.feedback)
      ? (value.feedback as Feedback)
      : undefined

  return {
    id: optionalId(value.id),
    outfitId: value.outfitId,
    wornOn: value.wornOn,
    feedback,
    createdAt: value.createdAt,
  }
}

export function parseBackup(text: string): ParsedBackup {
  let data: unknown

  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!isRecord(data) || data.app !== BACKUP_APP) {
    throw new Error('That file is not a Wardrobe backup.')
  }

  if (
    typeof data.version !== 'number' ||
    !SUPPORTED_VERSIONS.has(data.version)
  ) {
    throw new Error(
      typeof data.version === 'number' && data.version > BACKUP_VERSION
        ? 'This backup was made by a newer version of Wardrobe.'
        : 'This backup format is not supported.',
    )
  }

  if (!Array.isArray(data.items)) {
    throw new Error('That backup has no items.')
  }

  if (data.items.length > MAX_BACKUP_ITEMS) {
    throw new Error(
      `That backup has ${data.items.length} pieces. The most a backup can hold is ${MAX_BACKUP_ITEMS}.`,
    )
  }

  if (Array.isArray(data.outfits) && data.outfits.length > MAX_BACKUP_OUTFITS) {
    throw new Error(
      `That backup has ${data.outfits.length} looks. The most a backup can hold is ${MAX_BACKUP_OUTFITS}.`,
    )
  }

  if (
    Array.isArray(data.wearEvents) &&
    data.wearEvents.length > MAX_BACKUP_WEAR_EVENTS
  ) {
    throw new Error(
      `That backup has ${data.wearEvents.length} wear entries. The most a backup can hold is ${MAX_BACKUP_WEAR_EVENTS}.`,
    )
  }

  const items: BackupItem[] = []
  const outfits: BackupOutfit[] = []
  const wearEvents: BackupWearEvent[] = []
  let skipped = 0

  for (const entry of data.items) {
    const item = parseBackupItem(entry)
    if (item) {
      items.push(item)
    } else {
      skipped += 1
    }
  }

  if (items.length === 0) {
    throw new Error('No valid pieces were found in that backup.')
  }

  if (Array.isArray(data.outfits)) {
    for (const entry of data.outfits) {
      const outfit = parseBackupOutfit(entry)
      if (outfit) {
        outfits.push(outfit)
      } else {
        skipped += 1
      }
    }
  }

  if (Array.isArray(data.wearEvents)) {
    for (const entry of data.wearEvents) {
      const wearEvent = parseBackupWearEvent(entry)
      if (wearEvent) {
        wearEvents.push(wearEvent)
      } else {
        skipped += 1
      }
    }
  }

  return {
    version: data.version,
    items,
    outfits,
    wearEvents,
    skipped,
  }
}

export async function downloadBackup(): Promise<BackupCounts> {
  const [items, outfits, wearRows] = await Promise.all([
    db.items.orderBy('createdAt').toArray(),
    db.outfits.orderBy('createdAt').toArray(),
    db.wearEvents.toArray(),
  ])
  const wearEvents = wearRows.sort((a, b) => a.createdAt - b.createdAt)

  const backupItems: BackupItem[] = []

  for (const item of items) {
    backupItems.push({
      id: item.id,
      name: item.name,
      category: item.category,
      colors: item.colors,
      warmth: item.warmth,
      formality: item.formality,
      seasons: item.seasons,
      status: item.status,
      notes: item.notes,
      price: item.price,
      image: await blobToDataUrl(item.image),
      createdAt: item.createdAt,
      lastWornAt: item.lastWornAt,
    })
  }

  const backup: WardrobeBackup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items: backupItems,
    outfits: outfits.map((outfit) => ({
      id: outfit.id,
      name: outfit.name,
      itemIds: outfit.itemIds,
      occasion: outfit.occasion,
      seasons: outfit.seasons,
      createdAt: outfit.createdAt,
    })),
    wearEvents: wearEvents.map((wearEvent) => ({
      id: wearEvent.id,
      outfitId: wearEvent.outfitId,
      wornOn: wearEvent.wornOn,
      feedback: wearEvent.feedback,
      createdAt: wearEvent.createdAt,
    })),
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `wardrobe-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)

  return {
    items: items.length,
    outfits: outfits.length,
    wearEvents: wearEvents.length,
  }
}

export async function importBackup(file: File): Promise<ImportResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('That backup is larger than 100 MB.')
  }

  const parsed = parseBackup(await file.text())
  const imported: BackupCounts = { items: 0, outfits: 0, wearEvents: 0 }
  const duplicates: BackupCounts = { items: 0, outfits: 0, wearEvents: 0 }
  let skipped = parsed.skipped

  const existingItems = await db.items.toArray()
  const itemKeyToId = new Map<string, number>()
  for (const item of existingItems) {
    if (item.id !== undefined) itemKeyToId.set(itemKey(item), item.id)
  }

  const itemIdMap = new Map<number, number>()
  const preparedItems: { backup: BackupItem; image: Blob }[] = []
  const seenItemKeys = new Set(itemKeyToId.keys())

  for (const item of parsed.items) {
    const key = itemKey(item)
    const existingId = itemKeyToId.get(key)

    if (existingId !== undefined) {
      duplicates.items += 1
      if (item.id !== undefined) itemIdMap.set(item.id, existingId)
      continue
    }

    if (seenItemKeys.has(key)) {
      duplicates.items += 1
      continue
    }

    if (decodedImageByteLength(item.image) > MAX_RESTORED_IMAGE_BYTES) {
      throw new Error(
        `The photo for "${item.name}" is too large to restore. No pieces were imported.`,
      )
    }

    try {
      const blob = await dataUrlToBlob(item.image)
      preparedItems.push({
        backup: item,
        image: await prepareRestoredImage(blob),
      })
      seenItemKeys.add(key)
    } catch {
      throw new Error(
        `The photo for "${item.name}" could not be restored. No pieces were imported.`,
      )
    }
  }

  const existingOutfits = await db.outfits.toArray()
  const outfitKeyToId = new Map<string, number>()
  for (const outfit of existingOutfits) {
    if (outfit.id !== undefined) {
      outfitKeyToId.set(itemKey(outfit), outfit.id)
    }
  }

  const outfitIdMap = new Map<number, number>()
  for (const outfit of parsed.outfits) {
    const existingId = outfitKeyToId.get(itemKey(outfit))

    if (existingId !== undefined) {
      duplicates.outfits += 1
      if (outfit.id !== undefined) outfitIdMap.set(outfit.id, existingId)
    }
  }

  const existingWearEvents = await db.wearEvents.toArray()
  const wearKeys = new Set(
    existingWearEvents.map((event) => `${event.outfitId}\u0000${event.wornOn}`),
  )

  await db.transaction('rw', db.items, db.outfits, db.wearEvents, async () => {
    for (const { backup, image } of preparedItems) {
      const row: WardrobeItem = {
        name: backup.name,
        category: backup.category,
        colors: backup.colors,
        warmth: backup.warmth,
        formality: backup.formality,
        seasons: backup.seasons,
        status: backup.status,
        notes: backup.notes,
        price: backup.price,
        image,
        createdAt: backup.createdAt,
        lastWornAt: backup.lastWornAt,
      }
      const id = await db.items.add(row)
      if (backup.id !== undefined) itemIdMap.set(backup.id, id)
      imported.items += 1
    }

    for (const outfit of parsed.outfits) {
      if (outfitKeyToId.has(itemKey(outfit))) continue

      const itemIds = outfit.itemIds
        .map((id) => itemIdMap.get(id))
        .filter((id): id is number => id !== undefined)
      const id = await db.outfits.add({
        name: outfit.name,
        itemIds,
        occasion: outfit.occasion,
        seasons: outfit.seasons,
        createdAt: outfit.createdAt,
      })
      outfitKeyToId.set(itemKey(outfit), id)
      if (outfit.id !== undefined) outfitIdMap.set(outfit.id, id)
      imported.outfits += 1
    }

    for (const wearEvent of parsed.wearEvents) {
      const outfitId = outfitIdMap.get(wearEvent.outfitId)

      if (outfitId === undefined) {
        skipped += 1
        continue
      }

      const key = `${outfitId}\u0000${wearEvent.wornOn}`
      if (wearKeys.has(key)) {
        duplicates.wearEvents += 1
        continue
      }

      await db.wearEvents.add({
        outfitId,
        wornOn: wearEvent.wornOn,
        feedback: wearEvent.feedback,
        createdAt: wearEvent.createdAt,
      })
      wearKeys.add(key)
      imported.wearEvents += 1
    }
  })

  return { imported, duplicates, skipped }
}
