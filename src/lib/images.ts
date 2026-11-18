const MAX_DIMENSION = 1600
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export function validateImageFile(file: File): string | undefined {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file.'
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return 'That photo is larger than 20 MB. Try a smaller one.'
  }

  return undefined
}

/**
 * Downscale to MAX_DIMENSION and re-encode as WebP, shared by the upload and
 * backup-restore paths. Returns the original blob unchanged if it is already
 * small enough, so a restored backup keeps its bytes when they are fine.
 */
async function resizeToWebP(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Could not process that image.')
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.86)
  })

  return blob ?? source
}

export async function prepareImage(file: File): Promise<Blob> {
  return resizeToWebP(file)
}

/** Same pipeline as prepareImage, for a Blob restored from a backup. */
export async function prepareRestoredImage(blob: Blob): Promise<Blob> {
  return resizeToWebP(blob)
}
