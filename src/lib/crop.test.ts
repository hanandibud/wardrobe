import { describe, expect, it } from 'vitest'
import { clampCrop, defaultCrop, fitRect, resizeCrop } from './crop'

const MIN = 48

describe('fitRect', () => {
  it('letterboxes a landscape image inside a portrait-ish box', () => {
    const fit = fitRect({ width: 1200, height: 900 }, { width: 600, height: 420 })

    expect(fit.height).toBeCloseTo(420, 5)
    expect(fit.width).toBeCloseTo(560, 5)
    expect(fit.x).toBeCloseTo(20, 5)
    expect(fit.y).toBeCloseTo(0, 5)
  })

  it('pillarboxes a portrait image inside a landscape box', () => {
    const fit = fitRect({ width: 600, height: 1200 }, { width: 600, height: 420 })

    expect(fit.height).toBeCloseTo(420, 5)
    expect(fit.width).toBeCloseTo(210, 5)
    expect(fit.x).toBeCloseTo(195, 5)
    expect(fit.y).toBeCloseTo(0, 5)
  })

  it('keeps the image inside the box', () => {
    const fit = fitRect({ width: 3000, height: 1000 }, { width: 400, height: 400 })

    expect(fit.width).toBeLessThanOrEqual(400)
    expect(fit.height).toBeLessThanOrEqual(400)
    expect(fit.x).toBeGreaterThanOrEqual(0)
    expect(fit.y).toBeGreaterThanOrEqual(0)
  })
})

describe('defaultCrop', () => {
  it('starts from the whole image when there is no ratio', () => {
    expect(defaultCrop({ width: 1200, height: 900 })).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 900,
    })
  })

  it('centers a square inside a landscape image', () => {
    const crop = defaultCrop({ width: 1200, height: 900 }, 1)

    expect(crop).toEqual({ x: 150, y: 0, width: 900, height: 900 })
  })

  it('centers a 4:5 frame and keeps the ratio', () => {
    const crop = defaultCrop({ width: 1200, height: 900 }, 4 / 5)

    expect(crop.height).toBe(900)
    expect(crop.width).toBeCloseTo(720, 5)
    expect(crop.x).toBeCloseTo(240, 5)
    expect(crop.y).toBe(0)
    expect(crop.width / crop.height).toBeCloseTo(4 / 5, 5)
  })

  it('never exceeds the image bounds', () => {
    const crop = defaultCrop({ width: 800, height: 2000 }, 4 / 5)

    expect(crop.width).toBeLessThanOrEqual(800)
    expect(crop.height).toBeLessThanOrEqual(2000)
  })
})

describe('clampCrop', () => {
  const image = { width: 1200, height: 900 }

  it('pulls a crop back inside the top-left corner', () => {
    expect(clampCrop({ x: -50, y: -20, width: 200, height: 200 }, image, MIN)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    })
  })

  it('pulls a crop back inside the bottom-right corner', () => {
    expect(clampCrop({ x: 1150, y: 880, width: 200, height: 200 }, image, MIN)).toEqual({
      x: 1000,
      y: 700,
      width: 200,
      height: 200,
    })
  })

  it('grows a crop that is smaller than the minimum', () => {
    const crop = clampCrop({ x: 10, y: 10, width: 5, height: 5 }, image, MIN)

    expect(crop.width).toBe(MIN)
    expect(crop.height).toBe(MIN)
  })

  it('never lets a crop be larger than the image', () => {
    const crop = clampCrop({ x: 0, y: 0, width: 5000, height: 5000 }, image, MIN)

    expect(crop.width).toBe(image.width)
    expect(crop.height).toBe(image.height)
  })
})

describe('resizeCrop', () => {
  const image = { width: 1000, height: 1000 }

  it('grows from the bottom-right corner and keeps the top-left anchored', () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 }

    expect(resizeCrop(crop, 'se', 50, 50, image, undefined, MIN)).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150,
    })
  })

  it('grows from the top-left corner and keeps the bottom-right anchored', () => {
    const crop = { x: 100, y: 100, width: 200, height: 200 }
    const next = resizeCrop(crop, 'nw', 50, 50, image, undefined, MIN)

    expect(next).toEqual({ x: 150, y: 150, width: 150, height: 150 })
    expect(next.x + next.width).toBe(crop.x + crop.width)
    expect(next.y + next.height).toBe(crop.y + crop.height)
  })

  it('preserves the aspect ratio when one is set', () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 }
    const next = resizeCrop(crop, 'se', 60, 10, image, 1, MIN)

    expect(next.width).toBeCloseTo(160, 5)
    expect(next.height).toBeCloseTo(160, 5)
    expect(next.width / next.height).toBeCloseTo(1, 5)
  })

  it('preserves a 4:5 ratio', () => {
    const crop = { x: 0, y: 0, width: 400, height: 500 }
    const next = resizeCrop(crop, 'se', 80, 0, image, 4 / 5, MIN)

    expect(next.width / next.height).toBeCloseTo(4 / 5, 5)
  })

  it('stops at the minimum size', () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 }
    const next = resizeCrop(crop, 'se', -500, -500, image, undefined, MIN)

    expect(next.width).toBe(MIN)
    expect(next.height).toBe(MIN)
  })

  it('keeps the crop inside the image when dragged past the edge', () => {
    const crop = { x: 800, y: 800, width: 200, height: 200 }
    const next = resizeCrop(crop, 'se', 500, 500, image, undefined, MIN)

    expect(next.width).toBe(700)
    expect(next.height).toBe(700)
    expect(next.x + next.width).toBeLessThanOrEqual(image.width)
    expect(next.y + next.height).toBeLessThanOrEqual(image.height)
  })

  it('keeps the ratio and the bounds together', () => {
    const crop = { x: 0, y: 0, width: 300, height: 300 }
    const next = resizeCrop(crop, 'se', 900, 900, image, 1, MIN)

    expect(next.width / next.height).toBeCloseTo(1, 5)
    expect(next.x + next.width).toBeLessThanOrEqual(image.width)
    expect(next.y + next.height).toBeLessThanOrEqual(image.height)
  })
})
