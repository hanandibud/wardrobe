export const MAX_RECOGNITION_DIMENSION = 1024
/** Best-effort guard against processing a huge decoded photo. */
export const MAX_RECOGNITION_PIXELS = 40_000_000
/** Keep the final upload comfortably below the server's 4 MB decoded cap. */
export const MAX_RECOGNITION_BYTES = 3.5 * 1024 * 1024
const WEBP_QUALITY = 0.8
const LOWER_WEBP_QUALITY = 0.6

/**
 * Prepare a photo for remote recognition.
 *
 * The stored photo is untouched: this blob is used for the request only. We
 * deliberately return `null` instead of the original on failure, so a huge or
 * undecodable file never gets uploaded to the vision service. The caller then
 * falls back to the local heuristic provider.
 *
 * EXIF orientation is requested explicitly, transparency is flattened onto a
 * neutral background so the model sees a consistent image, and both decoded
 * pixels and final bytes are capped.
 */
export async function prepareRecognitionImage(
  image: Blob,
): Promise<Blob | null> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return null
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await decodeImage(image)
    if (bitmap.width <= 0 || bitmap.height <= 0) return null
    if (bitmap.width * bitmap.height > MAX_RECOGNITION_PIXELS) return null

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
    if (!context) return null

    // A transparent cutout would otherwise reach the model with an undefined
    // matte. White keeps light and dark garments readable and matches the
    // backgrounds the add flow recommends.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    // A 1024 px WebP is normally far below the cap. Try a lower quality before
    // rejecting the photo, but never return an oversized blob.
    let output = await encodeCanvas(canvas, WEBP_QUALITY)
    if (output && output.size > MAX_RECOGNITION_BYTES) {
      output = await encodeCanvas(canvas, LOWER_WEBP_QUALITY)
    }
    if (!output || output.size > MAX_RECOGNITION_BYTES) return null
    return output
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}

/**
 * Decode with explicit EXIF orientation. Older implementations may reject the
 * options object; retry with the browser default rather than failing the photo.
 */
async function decodeImage(image: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(image)
  }
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })
}
