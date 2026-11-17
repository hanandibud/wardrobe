import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Layers, LoaderCircle, Lock, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AddItemView } from './components/AddItemView'
import { ComingSoon } from './components/ComingSoon'
import { Header } from './components/Header'
import { ItemDetail } from './components/ItemDetail'
import { WardrobeView } from './components/WardrobeView'
import { db } from './db'
import type { ItemStatus, Tab } from './types'

const statusMessages: Record<ItemStatus, string> = {
  clean: 'Marked as clean.',
  dirty: 'Moved to needs wash.',
  laundry: 'Moved to laundry.',
}

function LoadingView() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted">
      <LoaderCircle className="h-6 w-6 animate-spin" />
    </div>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>('wardrobe')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const items = useLiveQuery(
    () => db.items.orderBy('createdAt').reverse().toArray(),
    [],
  )

  const selectedItem =
    selectedId === null ? undefined : items?.find((item) => item.id === selectedId)

  const closeItem = useCallback(() => setSelectedId(null), [])

  useEffect(() => {
    if (!toast) return

    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function handleStatusChange(status: ItemStatus) {
    if (selectedItem?.id === undefined) return

    await db.items.update(selectedItem.id, { status })
    setToast(statusMessages[status])
  }

  async function handleDelete() {
    if (selectedItem?.id === undefined) return

    await db.items.delete(selectedItem.id)
    setSelectedId(null)
    setToast('Removed from your wardrobe.')
  }

  function handleSaved() {
    setTab('wardrobe')
    setToast('Added to your wardrobe.')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header activeTab={tab} itemCount={items?.length ?? 0} onTabChange={setTab} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {tab === 'wardrobe' &&
          (items ? (
            <WardrobeView
              items={items}
              onOpenItem={setSelectedId}
              onAddItem={() => setTab('add')}
            />
          ) : (
            <LoadingView />
          ))}

        {tab === 'add' && <AddItemView onSaved={handleSaved} />}

        {tab === 'outfits' && (
          <ComingSoon
            icon={Layers}
            eyebrow="Milestone two"
            title="Outfits you already love, ready to repeat."
            description="Save combinations from your own wardrobe, plan them for an occasion, and stop rebuilding the same look from scratch."
            steps={[
              'Build a look from pieces you own.',
              'Save it with an occasion and season.',
              'Reuse it on the days you do not want to think.',
            ]}
            onAddItem={() => setTab('add')}
          />
        )}

        {tab === 'today' && (
          <ComingSoon
            icon={Sun}
            eyebrow="Milestone three"
            title="What to wear, decided."
            description="A daily suggestion that checks the weather, the occasion, and what is actually clean — then explains why it picked that combination."
            steps={[
              'Weather-aware layering and fabric choices.',
              'Formality and occasion matching.',
              'Simple feedback that improves the next pick.',
            ]}
            onAddItem={() => setTab('add')}
          />
        )}
      </main>

      <footer className="border-t border-line/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Local-first. Your photos never leave this browser.
          </p>
          <p>Early build · M0</p>
        </div>
      </footer>

      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          onClose={closeItem}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-5 z-[60] mx-auto flex max-w-sm items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm text-paper shadow-xl animate-rise"
        >
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
