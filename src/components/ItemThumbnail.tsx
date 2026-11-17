import { useObjectUrl } from '../hooks/useObjectUrl'
import type { WardrobeItem } from '../types'

interface ItemThumbnailProps {
  item: WardrobeItem
  className?: string
}

/**
 * A small image for an item. The name is always shown next to it, so the image
 * stays decorative for screen readers.
 */
export function ItemThumbnail({ item, className = '' }: ItemThumbnailProps) {
  const imageUrl = useObjectUrl(item.image)

  return (
    <div
      className={[
        'overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#fffdf9,#e9e0d3)]',
        className,
      ].join(' ')}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] text-muted">
          No photo
        </span>
      )}
    </div>
  )
}