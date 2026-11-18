import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Layers, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { db } from '../db'
import { pieceCountLabel, resolveOutfitItems } from '../lib/outfits'
import {
  OCCASION_LABELS,
  SEASON_LABELS,
  type Outfit,
  type WardrobeItem,
} from '../types'
import { ItemThumbnail } from './ItemThumbnail'
import { OutfitBuilder } from './OutfitBuilder'
import { OutfitDetail } from './OutfitDetail'

interface OutfitsViewProps {
  items: WardrobeItem[]
  onAddItem: () => void
  onSaved: (message: string) => void
}

function OutfitCard({
  outfit,
  items,
  onOpen,
}: {
  outfit: Outfit
  items: WardrobeItem[]
  onOpen: () => void
}) {
  const pieces = resolveOutfitItems(outfit, items)

  return (
    <article className="overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_1px_0_rgba(33,30,25,0.04)] transition duration-300 hover:-translate-y-1 hover:border-ink/20 hover:shadow-[0_18px_40px_-24px_rgba(33,30,25,0.45)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${outfit.name}`}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="relative aspect-square overflow-hidden border-b border-line/70 bg-paper/40">
          {pieces.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs leading-5 text-muted">
              The pieces in this look are gone from your wardrobe.
            </div>
          ) : (
            <div
              className={[
                'absolute inset-0 grid gap-px',
                pieces.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                pieces.length > 2 ? 'grid-rows-2' : 'grid-rows-1',
              ].join(' ')}
            >
              {pieces.slice(0, 4).map((item) => (
                <ItemThumbnail
                  key={item.id ?? item.createdAt}
                  item={item}
                  className="h-full w-full"
                />
              ))}
            </div>
          )}

          <span className="absolute left-2.5 top-2.5 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted backdrop-blur">
            {OCCASION_LABELS[outfit.occasion]}
          </span>
        </div>

        <div className="p-3.5">
          <p className="truncate text-sm font-medium text-ink">{outfit.name}</p>
          <p className="mt-1.5 text-[11px] text-muted">
            {[
              pieceCountLabel(pieces.length),
              ...outfit.seasons.map((season) => SEASON_LABELS[season]),
            ].join(' · ')}
          </p>
        </div>
      </button>
    </article>
  )
}

export function OutfitsView({ items, onAddItem, onSaved }: OutfitsViewProps) {
  const [building, setBuilding] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const outfits = useLiveQuery(
    () => db.outfits.orderBy('createdAt').reverse().toArray(),
    [],
  )

  const closeDetail = useCallback(() => setSelectedId(null), [])

  if (building) {
    return (
      <OutfitBuilder
        items={items}
        onCancel={() => setBuilding(false)}
        onSaved={(name) => {
          setBuilding(false)
          onSaved(`Saved "${name}".`)
        }}
      />
    )
  }

  const outfitCount = outfits?.length ?? 0
  const wardrobeEmpty = items.length === 0
  const selectedOutfit =
    selectedId === null
      ? undefined
      : outfits?.find((outfit) => outfit.id === selectedId)

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            The looks
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
            Your outfits
          </h1>
          <p className="mt-3 text-sm text-muted">
            {outfits
              ? `${outfitCount} ${outfitCount === 1 ? 'look' : 'looks'} saved`
              : 'Loading your looks'}
          </p>
        </div>

        {!wardrobeEmpty && (
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus className="h-4 w-4" />
            Build an outfit
          </button>
        )}
      </section>

      {outfits === undefined ? (
        <section className="flex min-h-[30vh] items-center justify-center rounded-3xl border border-dashed border-line bg-card/40 text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin" />
        </section>
      ) : wardrobeEmpty ? (
        <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-16 text-center sm:px-10 sm:py-20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Layers className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <h2 className="mt-6 font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Looks start with pieces.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            Add a few things to your wardrobe first. Then you can save the
            combinations you already reach for.
          </p>
          <button
            type="button"
            onClick={onAddItem}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-ink px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Add your first piece
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : outfitCount === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-14 text-center sm:px-10 sm:py-16">
          <h2 className="font-display text-3xl tracking-tight text-ink">
            No looks saved yet.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            Put together an outfit from what you own, name it, and it will be
            waiting here the next time you need it.
          </p>
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-ink px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Build your first look
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <section
          aria-label="Saved outfits"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {outfits.map((outfit) => (
            <OutfitCard
              key={outfit.id ?? outfit.createdAt}
              outfit={outfit}
              items={items}
              onOpen={() => {
                if (outfit.id !== undefined) setSelectedId(outfit.id)
              }}
            />
          ))}
        </section>
      )}

      {selectedOutfit && (
        <OutfitDetail
          outfit={selectedOutfit}
          items={items}
          onClose={closeDetail}
          onRenamed={(name) => onSaved(`Renamed to "${name}".`)}
          onDelete={() => {
            setSelectedId(null)
            onSaved('Look removed.')
          }}
        />
      )}
    </div>
  )
}