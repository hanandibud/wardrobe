import { describe, expect, it } from 'vitest'
import { prepareRecognitionImage } from './image'

describe('prepareRecognitionImage', () => {
  it('returns the original image when the browser cannot decode it', async () => {
    const image = new Blob(['image-bytes'], { type: 'image/webp' })

    // The Node test environment has no canvas, so this exercises the graceful
    // fallback: recognition must still get a usable blob.
    await expect(prepareRecognitionImage(image)).resolves.toBe(image)
  })
})
