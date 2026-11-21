import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECOGNITION_BYTES,
  MAX_RECOGNITION_DIMENSION,
  prepareRecognitionImage,
} from './image'

const image = new Blob(['image-bytes'], { type: 'image/webp' })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function fakeBitmap(width: number, height: number) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap
}

function setupCanvas(blobs: (Blob | null)[]) {
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(blobs.shift() ?? null)
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob,
  }
  const createElement = vi.fn(() => canvas)
  vi.stubGlobal('document', { createElement })
  return { canvas, context, createElement, toBlob }
}

describe('prepareRecognitionImage', () => {
  it('returns null instead of uploading the original when decoding is unavailable', async () => {
    await expect(prepareRecognitionImage(image)).resolves.toBeNull()
  })

  it('requests EXIF orientation and scales the longest edge to 1024 px', async () => {
    const decode = vi.fn().mockResolvedValue(fakeBitmap(2048, 1024))
    vi.stubGlobal('createImageBitmap', decode)
    const output = new Blob(['small'], { type: 'image/webp' })
    const { canvas, context } = setupCanvas([output])

    const result = await prepareRecognitionImage(image)

    expect(decode).toHaveBeenCalledWith(image, {
      imageOrientation: 'from-image',
    })
    expect(canvas.width).toBe(MAX_RECOGNITION_DIMENSION)
    expect(canvas.height).toBe(512)
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1024,
      512,
    )
    expect(result).toBe(output)
  })

  it('retries the decode with browser defaults if orientation options fail', async () => {
    const bitmap = fakeBitmap(800, 600)
    const decode = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('options not supported'))
      .mockResolvedValueOnce(bitmap)
    vi.stubGlobal('createImageBitmap', decode)
    const { canvas } = setupCanvas([
      new Blob(['small'], { type: 'image/webp' }),
    ])

    const result = await prepareRecognitionImage(image)

    expect(decode).toHaveBeenCalledTimes(2)
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
    expect(result).not.toBeNull()
  })

  it('rejects a photo whose decoded pixel count is over the cap', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 8000,
        height: 6000,
        close,
      } as unknown as ImageBitmap),
    )
    const { createElement } = setupCanvas([])

    const result = await prepareRecognitionImage(image)

    expect(result).toBeNull()
    expect(createElement).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('flattens transparency onto a white background before drawing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue(fakeBitmap(500, 500)),
    )
    const { context } = setupCanvas([
      new Blob(['small'], { type: 'image/webp' }),
    ])

    await prepareRecognitionImage(image)

    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 500, 500)
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0],
    )
  })

  it('tries lower quality once when the first encoding is too large', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue(fakeBitmap(1024, 1024)),
    )
    const tooLarge = new Blob([new Uint8Array(MAX_RECOGNITION_BYTES + 1)], {
      type: 'image/webp',
    })
    const small = new Blob(['small'], { type: 'image/webp' })
    const { toBlob } = setupCanvas([tooLarge, small])

    const result = await prepareRecognitionImage(image)

    expect(toBlob).toHaveBeenCalledTimes(2)
    expect(result).toBe(small)
  })

  it('returns null when the final encoded image is still too large', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue(fakeBitmap(1024, 1024)),
    )
    const tooLarge = new Blob([new Uint8Array(MAX_RECOGNITION_BYTES + 1)], {
      type: 'image/webp',
    })
    setupCanvas([tooLarge, tooLarge])

    const result = await prepareRecognitionImage(image)

    expect(result).toBeNull()
  })

  it('returns null when the encoder produces nothing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue(fakeBitmap(100, 100)),
    )
    setupCanvas([null])

    await expect(prepareRecognitionImage(image)).resolves.toBeNull()
  })

  it('returns null for an undecodable or unsupported image', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('unsupported format'))
    vi.stubGlobal('createImageBitmap', decode)
    const { createElement } = setupCanvas([])

    const result = await prepareRecognitionImage(image)

    expect(result).toBeNull()
    expect(decode).toHaveBeenCalledTimes(2)
    expect(createElement).not.toHaveBeenCalled()
  })
})
