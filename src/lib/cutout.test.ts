import { describe, expect, it } from 'vitest'
import { cutoutConfig, describeCutoutStage } from './cutout'

describe('describeCutoutStage', () => {
  it('describes the first model download', () => {
    expect(describeCutoutStage('fetch:model')).toContain('model')
  })

  it('describes other downloads without mentioning the model', () => {
    expect(describeCutoutStage('fetch:wasm')).toBe('Downloading cutout files')
  })

  it('describes the mask steps as removing the background', () => {
    expect(describeCutoutStage('compute:inference')).toBe('Removing the background')
    expect(describeCutoutStage('compute:mask')).toBe('Removing the background')
  })

  it('describes decoding and encoding as preparing the photo', () => {
    expect(describeCutoutStage('compute:decode')).toBe('Preparing the photo')
    expect(describeCutoutStage('compute:encode')).toBe('Preparing the photo')
  })

  it('falls back for an unknown key', () => {
    expect(describeCutoutStage('something-else')).toBe('Working')
    expect(describeCutoutStage('')).toBe('Working')
  })
})

describe('cutoutConfig', () => {
  it('keeps the smallest model and a PNG output', () => {
    const config = cutoutConfig()

    expect(config.model).toBe('isnet_quint8')
    expect(config.output?.format).toBe('image/png')
  })

  it('gives each retry a different memo key', () => {
    const keys = [0, 1, 2].map((attempt) => JSON.stringify(cutoutConfig(attempt)))

    expect(new Set(keys).size).toBe(3)
  })

  it('keeps the quality in a sane range however many times it retries', () => {
    for (const attempt of [0, 1, 50, 1000, 10 ** 9]) {
      const quality = cutoutConfig(attempt).output?.quality ?? 0

      expect(quality).toBeGreaterThan(0)
      expect(quality).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to the default quality for a nonsense attempt', () => {
    expect(cutoutConfig(Number.NaN).output?.quality).toBe(0.8)
    expect(cutoutConfig(-4).output?.quality).toBe(0.8)
    expect(cutoutConfig(0.7).output?.quality).toBe(0.8)
  })
})
