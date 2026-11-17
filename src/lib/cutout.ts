import type { Config } from '@imgly/background-removal'

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
 * Configuration for the cutout model.
 *
 * `attempt` is bumped after a failure on purpose. The library memoizes model
 * loading by `JSON.stringify(config)`, so a config that failed would stay
 * failed for the rest of the page session. A PNG ignores `quality`, so nudging
 * it only changes the memo key and never the output.
 */
export function cutoutConfig(attempt = 0): Config {
  const offset = Number.isFinite(attempt)
    ? Math.min(Math.max(Math.trunc(attempt), 0) * 0.001, 0.19)
    : 0

  return {
    model: 'isnet_quint8',
    output: { format: 'image/png', quality: 0.8 + offset },
  }
}

let failedAttempts = 0

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

  try {
    return await removeBackground(image, {
      ...cutoutConfig(failedAttempts),
      progress: (key, current, total) => {
        onProgress?.({
          stage: describeCutoutStage(key),
          percent: total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0,
        })
      },
    })
  } catch (error) {
    // Give the next try a fresh memo key so a transient network failure is not
    // remembered for the rest of the page session.
    failedAttempts += 1
    throw error
  }
}
