export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type CropHandle = 'nw' | 'ne' | 'sw' | 'se'

/**
 * The largest box with the image's aspect ratio that fits inside `box`,
 * centered. Used to place the photo inside the crop stage.
 */
export function fitRect(image: Size, box: Size): Rect {
  const scale = Math.min(box.width / image.width, box.height / image.height)
  const width = image.width * scale
  const height = image.height * scale

  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  }
}

/** Keep a crop inside the image, and never smaller than `min`. */
export function clampCrop(crop: Rect, image: Size, min: number): Rect {
  const floor = Math.max(1, Math.min(min, image.width, image.height))
  const width = Math.min(Math.max(crop.width, floor), image.width)
  const height = Math.min(Math.max(crop.height, floor), image.height)

  return {
    x: Math.min(Math.max(crop.x, 0), image.width - width),
    y: Math.min(Math.max(crop.y, 0), image.height - height),
    width,
    height,
  }
}

/** Crop the center of the image, optionally locked to an aspect ratio (w/h). */
export function defaultCrop(image: Size, aspect?: number): Rect {
  if (!aspect) {
    return { x: 0, y: 0, width: image.width, height: image.height }
  }

  let width = image.width
  let height = width / aspect

  if (height > image.height) {
    height = image.height
    width = height * aspect
  }

  return {
    x: (image.width - width) / 2,
    y: (image.height - height) / 2,
    width,
    height,
  }
}

/**
 * Resize a crop by dragging one corner. The opposite corner stays put, the
 * rectangle stays inside the image, and an aspect ratio is preserved when set.
 */
export function resizeCrop(
  crop: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  image: Size,
  aspect: number | undefined,
  min: number,
): Rect {
  const leftward = handle === 'nw' || handle === 'sw'
  const upward = handle === 'nw' || handle === 'ne'

  let width = Math.max(min, leftward ? crop.width - dx : crop.width + dx)
  let height = Math.max(min, upward ? crop.height - dy : crop.height + dy)

  if (aspect) {
    const widthChange = Math.abs(width - crop.width)
    const heightChange = Math.abs(height - crop.height) * aspect

    if (widthChange >= heightChange) {
      height = width / aspect
    } else {
      width = height * aspect
    }
  }

  const right = crop.x + crop.width
  const bottom = crop.y + crop.height
  const x = leftward ? right - width : crop.x
  const y = upward ? bottom - height : crop.y

  return clampCrop({ x, y, width, height }, image, min)
}

/**
 * Draw the selected region at natural resolution and return it as a WebP file,
 * ready for the existing validation and compression pipeline.
 */
export async function cropImageToFile(
  blob: Blob,
  crop: Rect,
  fileName: string,
): Promise<File> {
  const bitmap = await createImageBitmap(blob)
  const width = Math.max(1, Math.round(crop.width))
  const height = Math.max(1, Math.round(crop.height))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Could not crop that photo.')
  }

  context.drawImage(
    bitmap,
    Math.round(crop.x),
    Math.round(crop.y),
    width,
    height,
    0,
    0,
    width,
    height,
  )
  bitmap.close()

  const output = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.92)
  })

  if (!output) throw new Error('Could not crop that photo.')

  return new File([output], fileName, { type: 'image/webp' })
}
