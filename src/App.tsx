import { useLiveQuery } from 'dexie-react-hooks'
import { Check, LoaderCircle, Lock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AddItemView } from './components/AddItemView'
import { Header } from './components/Header'
import { ItemDetail } from './components/ItemDetail'
import { OutfitsView } from './components/OutfitsView'
import { TodayView } from './components/TodayView'
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

  function handleEditSaved() {
    setToast('Changes saved.')
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

        {tab === 'outfits' &&
          (items ? (
            <OutfitsView
              items={items}
              onAddItem={() => setTab('add')}
              onSaved={setToast}
            />
          ) : (
            <LoadingView />
          ))}

        {tab === 'today' &&
          (items ? (
            <TodayView
              items={items}
              onSeeOutfits={() => setTab('outfits')}
              onAddItems={() => setTab('add')}
              onSaved={setToast}
            />
          ) : (
            <LoadingView />
          ))}
      </main>

      <footer className="border-t border-line/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Local-first. Your photos never leave this browser.
          </p>
          <p>Early build · M4 in progress</p>
        </div>
      </footer>

      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          onClose={closeItem}
          onStatusChange={handleStatusChange}
          onEditSaved={handleEditSaved}
          onDelete={handleDelete}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
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
