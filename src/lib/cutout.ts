export interface CutoutProgress {
  stage: string
  percent: number
}

/**
 * Turn a raw progress key from the cutout model into copy a person can read.
 * Keys arrive as `fetch:<resource>` while files download and `compute:<step>`
 * while the mask is built.
 */
export function describeCutoutStage(key: string): string {
  const [group, detail = ''] = key.split(':')

  if (group === 'fetch') {
    return detail.includes('model')
      ? 'Downloading the cutout model (first run only)'
      : 'Downloading cutout files'
  }

  if (group === 'compute') {
    if (detail === 'inference' || detail === 'mask') return 'Removing the background'
    return 'Preparing the photo'
  }

  return 'Working'
}

/**
 * Remove the background from a photo entirely in the browser.
 *
 * The model is loaded on demand, so none of this reaches the main bundle until
 * the user asks for a cutout. The result is a PNG so the transparency survives,
 * which also keeps the transparent area out of color extraction.
 */
export async function cutOutBackground(
  image: Blob,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal')

  return removeBackground(image, {
    // The smallest model keeps the first download near 40 MB instead of 80 MB.
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      onProgress?.({
        stage: describeCutoutStage(key),
        percent: total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0,
      })
    },
  })
}
