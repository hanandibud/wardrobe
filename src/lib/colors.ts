import { converter, differenceCiede2000, formatHex } from 'culori'

const toLab = converter('lab')
const toRgb = converter('rgb')
const colorDistance = differenceCiede2000()

interface LabPoint {
  l: number
  a: number
  b: number
}

interface ColorCluster {
  centroid: LabPoint
  size: number
}

const NAMED_COLORS = [
  { name: 'black', hex: '#151515' },
  { name: 'charcoal', hex: '#3b3b3b' },
  { name: 'grey', hex: '#8a8a8a' },
  { name: 'silver', hex: '#c8c8c8' },
  { name: 'white', hex: '#f6f3ee' },
  { name: 'cream', hex: '#efe4cf' },
  { name: 'beige', hex: '#d8c3a5' },
  { name: 'tan', hex: '#c19a6b' },
  { name: 'brown', hex: '#7a5230' },
  { name: 'chocolate', hex: '#4a2f22' },
  { name: 'navy', hex: '#1f2a44' },
  { name: 'denim', hex: '#4a6b8a' },
  { name: 'blue', hex: '#3568a8' },
  { name: 'sky blue', hex: '#9cc3e5' },
  { name: 'teal', hex: '#2f6f6b' },
  { name: 'green', hex: '#3f6b4f' },
  { name: 'olive', hex: '#6b6b3a' },
  { name: 'sage', hex: '#9caf96' },
  { name: 'red', hex: '#a83232' },
  { name: 'burgundy', hex: '#5e1f2b' },
  { name: 'pink', hex: '#d98ca0' },
  { name: 'purple', hex: '#6b4c7a' },
  { name: 'lavender', hex: '#b7a6d6' },
  { name: 'yellow', hex: '#d8b64a' },
  { name: 'mustard', hex: '#b58a2b' },
  { name: 'orange', hex: '#c46a2d' },
  { name: 'rust', hex: '#9b4b2a' },
] as const

type NamedColor = (typeof NAMED_COLORS)[number]

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Neutrals anchor an outfit. Very dark and very light colors count even when
 * they carry a little saturation, because they read as black or white.
 */
export function isNeutralColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return false

  const value = match[1]
  const red = Number.parseInt(value.slice(0, 2), 16) / 255
  const green = Number.parseInt(value.slice(2, 4), 16) / 255
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255

  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const saturation =
    max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1))

  return saturation < 0.2 || lightness < 0.24 || lightness > 0.9
}

/** Hue in degrees, or null when the text is not a six-digit hex color. */
export function hueOf(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null

  const value = match[1]
  const red = Number.parseInt(value.slice(0, 2), 16) / 255
  const green = Number.parseInt(value.slice(2, 4), 16) / 255
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255

  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (delta === 0) return 0

  let hue: number
  if (max === red) hue = ((green - blue) / delta) % 6
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4

  return (hue * 60 + 360) % 360
}

function labDistance(a: LabPoint, b: LabPoint): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b)
}

function clusterColors(points: LabPoint[], k: number): ColorCluster[] {
  if (points.length === 0 || k <= 0) return []

  const centroids: LabPoint[] = Array.from({ length: k }, (_, index) => {
    const point = points[Math.floor(((index + 0.5) * points.length) / k)]
    return point ?? points[0]
  })

  const counts = new Int32Array(k)

  for (let iteration = 0; iteration < 10; iteration += 1) {
    counts.fill(0)
    const sums = Array.from({ length: k }, () => ({ l: 0, a: 0, b: 0 }))

    for (const point of points) {
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (let index = 0; index < k; index += 1) {
        const distance = labDistance(point, centroids[index])
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }

      counts[bestIndex] += 1
      sums[bestIndex].l += point.l
      sums[bestIndex].a += point.a
      sums[bestIndex].b += point.b
    }

    for (let index = 0; index < k; index += 1) {
      if (counts[index] > 0) {
        centroids[index] = {
          l: sums[index].l / counts[index],
          a: sums[index].a / counts[index],
          b: sums[index].b / counts[index],
        }
      }
    }
  }

  return centroids
    .map((centroid, index) => ({ centroid, size: counts[index] }))
    .filter((cluster) => cluster.size > 0)
}

export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Sample pixels, cluster them in CIELAB space, and return up to `maxColors`
 * hex strings. Pure, so the sampling and clustering can be tested directly.
 */
export function paletteFromImage(image: RgbaImage, maxColors = 4): string[] {
  const { data, width, height } = image
  const pixelCount = width * height
  const step = Math.max(1, Math.floor(pixelCount / 6000))
  const points: LabPoint[] = []

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4
    if (data[offset + 3] < 180) continue

    const lab = toLab(rgbToHex(data[offset], data[offset + 1], data[offset + 2]))
    if (lab) {
      points.push({ l: lab.l, a: lab.a, b: lab.b })
    }
  }

  if (points.length === 0) return []

  const clusters = clusterColors(points, Math.min(maxColors + 2, points.length)).sort(
    (a, b) => b.size - a.size,
  )

  const selected: LabPoint[] = []
  for (const cluster of clusters) {
    if (cluster.size / points.length < 0.05) continue
    if (selected.some((color) => labDistance(color, cluster.centroid) < 9)) continue
    selected.push(cluster.centroid)
    if (selected.length >= maxColors) break
  }

  const hexColors: string[] = []
  for (const color of selected) {
    const rgb = toRgb({ mode: 'lab', l: color.l, a: color.a, b: color.b })
    const hex = rgb ? formatHex(rgb) : undefined
    if (hex && !hexColors.includes(hex)) hexColors.push(hex)
  }

  return hexColors
}

export async function extractPalette(file: Blob, maxColors = 4): Promise<string[]> {
  const bitmap = await createImageBitmap(file)
  const maxDimension = 160
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    return []
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const { data } = context.getImageData(0, 0, width, height)

  return paletteFromImage({ data, width, height }, maxColors)
}

export function nameColor(hex: string): string {
  const lab = toLab(hex)
  if (!lab) return hex

  let closest: NamedColor = NAMED_COLORS[0]
  let closestDistance = Number.POSITIVE_INFINITY

  for (const named of NAMED_COLORS) {
    const namedLab = toLab(named.hex)
    if (!namedLab) continue

    const distance = colorDistance(lab, namedLab)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = named
    }
  }

  return closest.name
}
