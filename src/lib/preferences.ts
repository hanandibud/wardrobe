import { converter, differenceCiede2000 } from 'culori'
import type { WardrobeItem } from '../types'
import { hueOf, isNeutralColor, nameColor } from './colors'

const toLab = converter('lab')
const colorDistance = differenceCiede2000()

export const PREFERENCES_KEY = 'wardrobe.preferences.v1'
export const MAX_PREFERENCE_COLORS = 8
export const COLOR_MATCH_DISTANCE = 12

export const UNDERTONE_OPTIONS = [
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'unsure', label: 'Not sure' },
] as const

export type Undertone = (typeof UNDERTONE_OPTIONS)[number]['value']

export const CONTRAST_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'unsure', label: 'Not sure' },
] as const

export type Contrast = (typeof CONTRAST_OPTIONS)[number]['value']
export type ContrastLevel = 'low' | 'medium' | 'high'

export interface ColorPreferences {
  undertone: Undertone
  contrast: Contrast
  lovedColors: string[]
  avoidColors: string[]
  updatedAt: number
}

export interface PaletteColor {
  hex: string
  name: string
  count: number
}

const UNDERTONE_VALUES = new Set<string>(
  UNDERTONE_OPTIONS.map((option) => option.value),
)
const CONTRAST_VALUES = new Set<string>(
  CONTRAST_OPTIONS.map((option) => option.value),
)

export function defaultPreferences(): ColorPreferences {
  return {
    undertone: 'unsure',
    contrast: 'unsure',
    lovedColors: [],
    avoidColors: [],
    updatedAt: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Lower-cased, six-digit hex, or null. Matches the stored item palette. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function uniqueColors(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const result: string[] = []
  for (const entry of value) {
    const hex = normalizeHex(entry)
    if (!hex || result.includes(hex)) continue
    result.push(hex)
    if (result.length >= MAX_PREFERENCE_COLORS) break
  }

  return result
}

/** Tolerant parse: bad fields fall back to defaults, never throw. */
export function parsePreferences(value: unknown): ColorPreferences {
  const record = isRecord(value) ? value : {}
  const avoidColors = uniqueColors(record.avoidColors)
  const lovedColors = uniqueColors(record.lovedColors).filter(
    (hex) => !avoidColors.includes(hex),
  )

  return {
    undertone: UNDERTONE_VALUES.has(record.undertone as string)
      ? (record.undertone as Undertone)
      : 'unsure',
    contrast: CONTRAST_VALUES.has(record.contrast as string)
      ? (record.contrast as Contrast)
      : 'unsure',
    lovedColors,
    avoidColors,
    updatedAt:
      typeof record.updatedAt === 'number' &&
      Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : 0,
  }
}

export function readPreferences(): ColorPreferences {
  if (typeof window === 'undefined') return defaultPreferences()

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return defaultPreferences()
    return parsePreferences(JSON.parse(raw))
  } catch {
    return defaultPreferences()
  }
}

/** Returns false when the browser blocks or cannot persist the choice. */
export function writePreferences(preferences: ColorPreferences): boolean {
  if (typeof window === 'undefined') return false

  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

export function clearPreferences(): boolean {
  if (typeof window === 'undefined') return false

  try {
    window.localStorage.removeItem(PREFERENCES_KEY)
    return true
  } catch {
    // Clearing a preference is optional when storage is blocked.
    return false
  }
}

export function hasPreferences(preferences: ColorPreferences): boolean {
  return (
    preferences.undertone !== 'unsure' ||
    preferences.contrast !== 'unsure' ||
    preferences.lovedColors.length > 0 ||
    preferences.avoidColors.length > 0
  )
}

/** A short, plain-language summary for the Today page. */
export function preferenceSummary(
  preferences: ColorPreferences,
): string | null {
  if (!hasPreferences(preferences)) return null

  const parts: string[] = []
  if (preferences.undertone !== 'unsure') {
    parts.push(`${preferences.undertone} undertone`)
  }
  if (preferences.contrast !== 'unsure') {
    parts.push(`${preferences.contrast} contrast`)
  }
  if (preferences.lovedColors.length > 0) {
    parts.push(
      `${preferences.lovedColors.length} loved ${
        preferences.lovedColors.length === 1 ? 'color' : 'colors'
      }`,
    )
  }
  if (preferences.avoidColors.length > 0) {
    parts.push(
      `${preferences.avoidColors.length} avoided ${
        preferences.avoidColors.length === 1 ? 'color' : 'colors'
      }`,
    )
  }

  return parts.join(' · ')
}

export function colorDifference(a: string, b: string): number | null {
  const first = normalizeHex(a)
  const second = normalizeHex(b)
  if (!first || !second) return null

  const difference = colorDistance(first, second)
  return Number.isFinite(difference) ? difference : null
}

/** Perceptual match, so “olive” covers the near-olive a photo produced. */
export function matchesAnyColor(
  hex: string,
  targets: string[],
  tolerance = COLOR_MATCH_DISTANCE,
): boolean {
  for (const target of targets) {
    const difference = colorDifference(hex, target)
    if (difference !== null && difference <= tolerance) return true
  }

  return false
}

/**
 * Warm and cool here are color-temperature labels for the clothes, not a
 * judgment about the wearer. Neutrals are skipped and a tie returns null.
 */
export function dominantTemperature(
  items: WardrobeItem[],
): 'warm' | 'cool' | null {
  let warm = 0
  let cool = 0

  for (const item of items) {
    const color = item.colors.find(
      (entry) => !isNeutralColor(entry) && hueOf(entry) !== null,
    )
    const hue = color ? hueOf(color) : null
    if (hue === null) continue

    if (hue < 75 || hue >= 330) warm += 1
    else cool += 1
  }

  if (warm === cool) return null
  return warm > cool ? 'warm' : 'cool'
}

/** Spread in CIELAB lightness, from the first color of each piece. */
export function contrastLevel(
  items: WardrobeItem[],
): ContrastLevel | null {
  const lightnesses = items.flatMap((item) => {
    const hex = normalizeHex(item.colors[0])
    if (!hex) return []

    const lab = toLab(hex)
    return lab ? [lab.l] : []
  })

  if (lightnesses.length < 2) return null

  const spread = Math.max(...lightnesses) - Math.min(...lightnesses)
  if (spread <= 20) return 'low'
  if (spread >= 45) return 'high'
  return 'medium'
}

/** The colors that actually appear in the wardrobe, most common first. */
export function wardrobePalette(
  items: WardrobeItem[],
  limit = 10,
): PaletteColor[] {
  const counts = new Map<string, { count: number; firstSeen: number }>()
  let seen = 0

  for (const item of items) {
    const seenInItem = new Set<string>()

    for (const raw of item.colors) {
      const hex = normalizeHex(raw)
      if (!hex || seenInItem.has(hex)) continue
      seenInItem.add(hex)

      const entry = counts.get(hex)
      if (entry) {
        entry.count += 1
      } else {
        counts.set(hex, { count: 1, firstSeen: seen })
        seen += 1
      }
    }
  }

  return [...counts.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen,
    )
    .slice(0, limit)
    .map(([hex, meta]) => ({
      hex,
      name: nameColor(hex),
      count: meta.count,
    }))
}
