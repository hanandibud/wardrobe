import { ArrowRight, type LucideIcon } from 'lucide-react'

interface ComingSoonProps {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  steps: string[]
  onAddItem: () => void
}

export function ComingSoon({
  icon: Icon,
  eyebrow,
  title,
  description,
  steps,
  onAddItem,
}: ComingSoonProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-3xl border border-line/80 bg-card p-7 sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon className="h-6 w-6" strokeWidth={1.7} />
        </div>

        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-xl font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{description}</p>

        <button
          type="button"
          onClick={onAddItem}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Add a piece first
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <section className="rounded-3xl border border-line/80 bg-card/60 p-7 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
          On the roadmap
        </p>
        <ol className="mt-5 space-y-5">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-muted">
                {index + 1}
              </span>
              <span className="text-sm leading-6 text-ink/80">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
