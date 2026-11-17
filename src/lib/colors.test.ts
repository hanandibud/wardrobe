import { describe, expect, it } from 'vitest'
import { nameColor, paletteFromImage, type RgbaImage } from './colors'

/** Build a raw RGBA buffer so the sampling path can be tested without a canvas. */
function imageFrom(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const [red, green, blue, alpha] = fill(x, y)
      data[offset] = red
      data[offset + 1] = green
      data[offset + 2] = blue
      data[offset + 3] = alpha
    }
  }

  return { data, width, height }
}

describe('nameColor', () => {
  it('returns the palette name for an exact palette color', () => {
    expect(nameColor('#151515')).toBe('black')
    expect(nameColor('#f6f3ee')).toBe('white')
    expect(nameColor('#c46a2d')).toBe('orange')
    expect(nameColor('#2f6f6b')).toBe('teal')
    expect(nameColor('#d8c3a5')).toBe('beige')
  })

  it('is case-insensitive', () => {
    expect(nameColor('#2F6F6B')).toBe('teal')
  })

  it('returns the input when the color cannot be parsed', () => {
    expect(nameColor('not-a-color')).toBe('not-a-color')
  })
})

describe('paletteFromImage', () => {
  it('finds the dominant colors of a two-tone image', () => {
    const image = imageFrom(100, 100, (x) =>
      x < 50 ? [107, 107, 58, 255] : [196, 106, 45, 255],
    )

    const palette = paletteFromImage(image)
    const names = palette.map((hex) => nameColor(hex))

    expect(palette.length).toBeGreaterThanOrEqual(2)
    expect(palette.length).toBeLessThanOrEqual(4)
    expect(names).toContain('olive')
    expect(names).toContain('orange')
  })

  it('respects the maxColors limit', () => {
    const image = imageFrom(60, 60, (x) => {
      if (x < 20) return [107, 107, 58, 255]
      if (x < 40) return [196, 106, 45, 255]
      return [246, 243, 238, 255]
    })

    expect(paletteFromImage(image, 1)).toHaveLength(1)
    expect(paletteFromImage(image, 2).length).toBeLessThanOrEqual(2)
  })

  it('ignores transparent pixels', () => {
    const image = imageFrom(50, 50, () => [107, 107, 58, 0])

    expect(paletteFromImage(image)).toEqual([])
  })

  it('ignores near-transparent pixels above the alpha floor', () => {
    const image = imageFrom(50, 50, () => [107, 107, 58, 179])

    expect(paletteFromImage(image)).toEqual([])
  })

  it('returns an empty list for an empty image', () => {
    expect(paletteFromImage({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([])
  })

  it('returns hex strings', () => {
    const image = imageFrom(40, 40, () => [21, 21, 21, 255])

    for (const color of paletteFromImage(image)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
