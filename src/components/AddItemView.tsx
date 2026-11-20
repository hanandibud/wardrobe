import { ItemForm } from './ItemForm'

interface AddItemViewProps {
  onSaved: () => void
}

export function AddItemView({ onSaved }: AddItemViewProps) {
  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
          New piece
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
          Add to your wardrobe
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          One photo is enough. We will suggest the details and you can correct anything before saving.
        </p>
      </section>

      <ItemForm onSaved={onSaved} />
    </div>
  )
}
