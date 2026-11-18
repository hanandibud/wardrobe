import { ArrowRight, Plus, Search, Shirt, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { nameColor } from '../lib/colors'
import {
  CATEGORY_OPTIONS,
  type Category,
  type WardrobeItem,
} from '../types'
import { BackupPanel } from './BackupPanel'
import { InsightsPanel } from './InsightsPanel'
import { ItemCard } from './ItemCard'
import { PalettePanel } from './PalettePanel'

interface WardrobeViewProps {
  items: WardrobeItem[]
  onOpenItem: (id: number) => void
  onAddItem: () => void
}

type CategoryFilter = Category | 'all'

export function WardrobeView({ items, onOpenItem, onAddItem }: WardrobeViewProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  const cleanCount = items.filter((item) => item.status === 'clean').length
  const inWashCount = items.length - cleanCount

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category
      const matchesSearch =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.colors.some((color) => nameColor(color).includes(query))

      return matchesCategory && matchesSearch
    })
  }, [items, search, category])

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            The collection
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
            Your wardrobe
          </h1>
          <p className="mt-3 text-sm text-muted">
            {items.length} {items.length === 1 ? 'piece' : 'pieces'}
            {items.length > 0 && (
              <>
                {' '}
                · {cleanCount} ready to wear
                {inWashCount > 0 ? ` · ${inWashCount} in the wash` : ''}
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus className="h-4 w-4" />
          Add a piece
        </button>
      </section>

      {items.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-16 text-center sm:px-10 sm:py-20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Shirt className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <h2 className="mt-6 font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Your wardrobe, digitized.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            Start with one piece. Take a photo, add a few details, and it will be here the
            next time you open the app.
          </p>
          <button
            type="button"
            onClick={onAddItem}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-ink bg-transparent px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Add your first piece
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or color"
                aria-label="Search wardrobe"
                className="h-12 w-full rounded-full border border-line bg-card pl-11 pr-11 text-sm text-ink placeholder:text-muted/70 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              {search.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted transition hover:bg-black/5 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                aria-pressed={category === 'all'}
                className={[
                  'shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition',
                  category === 'all'
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                ].join(' ')}
              >
                All
              </button>

              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  aria-pressed={category === option.value}
                  className={[
                    'shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition',
                    category === option.value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                  ].join(' ')}
                >
                  {option.plural}
                </button>
              ))}
            </div>
          </section>

          {filteredItems.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-14 text-center">
              <p className="font-display text-2xl text-ink">Nothing matches that.</p>
              <p className="mt-2 text-sm text-muted">
                Try a different search or category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                }}
                className="mt-5 rounded-full border border-line bg-card px-4 py-2 text-xs font-medium text-ink transition hover:border-ink/30"
              >
                Clear filters
              </button>
            </section>
          ) : (
            <section
              aria-label="Wardrobe items"
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            >
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id ?? item.createdAt}
                  item={item}
                  onOpen={() => {
                    if (item.id !== undefined) onOpenItem(item.id)
                  }}
                />
              ))}
            </section>
          )}
        </>
      )}

      {items.length > 0 && <InsightsPanel items={items} />}
      <PalettePanel items={items} />
      <BackupPanel itemCount={items.length} />
    </div>
  )
}
