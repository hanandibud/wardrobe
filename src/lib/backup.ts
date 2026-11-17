import { db } from '../db'
import {
  CATEGORY_OPTIONS,
  SEASON_OPTIONS,
  STATUS_OPTIONS,
  type Category,
  type ItemStatus,
  type Level,
  type Season,
  type WardrobeItem,
} from '../types'

export const BACKUP_VERSION = 1
const BACKUP_APP = 'wardrobe'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024

const CATEGORY_VALUES = new Set<string>(
  CATEGORY_OPTIONS.map((option) => option.value),
)
const SEASON_VALUES = new Set<string>(
  SEASON_OPTIONS.map((option) => option.value),
)
const STATUS_VALUES = new Set<string>(
  STATUS_OPTIONS.map((option) => option.value),
)

interface BackupItem {
  name: string
  category: Category
  colors: string[]
  warmth: Level
  formality: Level
  seasons: Season[]
  status: ItemStatus
  notes?: string
  image: string
  createdAt: number
  lastWornAt?: number
}

export interface WardrobeBackup {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  items: BackupItem[]
}

export interface ParsedBackup {
  items: BackupItem[]
  skipped: number
}

export interface ImportResult {
  imported: number
  skipped: number
  duplicates: number
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

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
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

function parseBackupItem(value: unknown): BackupItem | null {
  if (!isRecord(value)) return null

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  if (!CATEGORY_VALUES.has(value.category as string)) return null
  if (!STATUS_VALUES.has(value.status as string)) return null
  if (!isLevel(value.warmth) || !isLevel(value.formality)) return null
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
    return null
  }
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
    name,
    category: value.category as Category,
    colors,
    warmth: value.warmth,
    formality: value.formality,
    seasons,
    status: value.status as ItemStatus,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    image: value.image,
    createdAt: value.createdAt,
    lastWornAt:
      typeof value.lastWornAt === 'number' ? value.lastWornAt : undefined,
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

  if (data.version !== BACKUP_VERSION) {
    throw new Error(
      typeof data.version === 'number' && data.version > BACKUP_VERSION
        ? 'This backup was made by a newer version of Wardrobe.'
        : 'This backup format is not supported.',
    )
  }

  if (!Array.isArray(data.items)) {
    throw new Error('That backup has no items.')
  }

  const items: BackupItem[] = []
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

  return { items, skipped }
}

export async function downloadBackup(): Promise<number> {
  const items = await db.items.orderBy('createdAt').toArray()
  const backupItems: BackupItem[] = []

  for (const item of items) {
    backupItems.push({
      name: item.name,
      category: item.category,
      colors: item.colors,
      warmth: item.warmth,
      formality: item.formality,
      seasons: item.seasons,
      status: item.status,
      notes: item.notes,
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

  return backupItems.length
}

export async function importBackup(file: File): Promise<ImportResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('That backup is larger than 100 MB.')
  }

  const { items, skipped } = parseBackup(await file.text())
  const existing = new Set(
    (await db.items.toArray()).map((item) => `${item.name}\u0000${item.createdAt}`),
  )
  const rows: WardrobeItem[] = []
  let duplicates = 0
  let invalidImages = 0

  for (const item of items) {
    const key = `${item.name}\u0000${item.createdAt}`

    if (existing.has(key)) {
      duplicates += 1
      continue
    }

    try {
      const image = await dataUrlToBlob(item.image)
      rows.push({
        name: item.name,
        category: item.category,
        colors: item.colors,
        warmth: item.warmth,
        formality: item.formality,
        seasons: item.seasons,
        status: item.status,
        notes: item.notes,
        image,
        createdAt: item.createdAt,
        lastWornAt: item.lastWornAt,
      })
      existing.add(key)
    } catch {
      invalidImages += 1
    }
  }

  if (rows.length > 0) {
    await db.items.bulkAdd(rows)
  }

  return {
    imported: rows.length,
    skipped: skipped + invalidImages,
    duplicates,
  }
}
