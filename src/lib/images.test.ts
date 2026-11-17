import { describe, expect, it } from 'vitest'
import { validateImageFile } from './images'

/** A shape-only stand-in, so the 20 MB limit can be tested without allocating it. */
function fileLike(type: string, size: number): File {
  return { type, size } as File
}

describe('validateImageFile', () => {
  it('accepts a normal image', () => {
    const file = new File([new Uint8Array(16)], 'shirt.png', { type: 'image/png' })

    expect(validateImageFile(file)).toBeUndefined()
  })

  it('accepts a photo from a phone camera', () => {
    expect(validateImageFile(fileLike('image/jpeg', 3 * 1024 * 1024))).toBeUndefined()
  })

  it('rejects a file that is not an image', () => {
    expect(validateImageFile(fileLike('application/pdf', 1024))).toBe(
      'Please choose an image file.',
    )
  })

  it('rejects a file with no type', () => {
    expect(validateImageFile(fileLike('', 1024))).toBe('Please choose an image file.')
  })

  it('allows exactly 20 MB and rejects one byte more', () => {
    const limit = 20 * 1024 * 1024

    expect(validateImageFile(fileLike('image/png', limit))).toBeUndefined()
    expect(validateImageFile(fileLike('image/png', limit + 1))).toBe(
      'That photo is larger than 20 MB. Try a smaller one.',
    )
  })
})
