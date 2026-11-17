import { useObjectUrl } from '../hooks/useObjectUrl'
import { nameColor } from '../lib/colors'
import { CATEGORY_LABELS, type ItemStatus, type WardrobeItem } from '../types'

interface ItemCardProps {
  item: WardrobeItem
  onOpen: () => void
}

const statusStyles: Record<ItemStatus, string> = {
  clean: 'bg-emerald-100/90 text-emerald-800',
  dirty: 'bg-amber-100/90 text-amber-800',
  laundry: 'bg-sky-100/90 text-sky-800',
}

const statusLabels: Record<ItemStatus, string> = {
  clean: 'Clean',
  dirty: 'Needs wash',
  laundry: 'In laundry',
}

export function ItemCard({ item, onOpen }: ItemCardProps) {
  const imageUrl = useObjectUrl(item.image)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-line/80 bg-card text-left shadow-[0_1px_0_rgba(33,30,25,0.04)] transition duration-300 hover:-translate-y-1 hover:border-ink/20 hover:shadow-[0_18px_40px_-24px_rgba(33,30,25,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`Open ${item.name}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#fffdf9,#e9e0d3)]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            No photo
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted backdrop-blur">
          {CATEGORY_LABELS[item.category]}
        </span>

        {item.status !== 'clean' && (
          <span
            className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur ${statusStyles[item.status]}`}
          >
            {statusLabels[item.status]}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <p className="truncate text-sm font-medium text-ink">{item.name}</p>

        <div className="mt-2.5 flex items-center gap-1.5">
          {item.colors.slice(0, 4).map((color, index) => (
            <span
              key={`${color}-${index}`}
              title={nameColor(color)}
              className="h-3 w-3 rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
          {item.colors.length === 0 && (
            <span className="text-[11px] text-muted">No colors yet</span>
          )}
        </div>
      </div>
    </button>
  )
}
