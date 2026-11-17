import { describe, expect, it } from 'vitest'
import { describeCutoutStage } from './cutout'

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
