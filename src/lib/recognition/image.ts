const MAX_RECOGNITION_DIMENSION = 1024

/**
 * Shrink a photo before it goes to a remote recognition provider.
 *
 * Remote recognition only needs enough detail to identify the garment, so a
 * smaller image means a faster round trip and less personal data leaving the
 * device. The stored photo is untouched: this blob is used for the request
 * only. If the browser cannot decode the image, the original is used instead
 * and the server-side size check remains the final guard.
 */
export async function prepareRecognitionImage(image: Blob): Promise<Blob> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return image
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(image)
    const scale = Math.min(
      1,
      MAX_RECOGNITION_DIMENSION / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return image

    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.8)
    })
    return blob ?? image
  } catch {
    return image
  } finally {
    bitmap?.close()
  }
}
