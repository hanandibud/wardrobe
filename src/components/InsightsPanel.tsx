import { useLiveQuery } from 'dexie-react-hooks'
import { Check, CircleAlert, TrendingUp, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { db } from '../db'
import {
  costSummary,
  formatAmount,
  wardrobeGaps,
} from '../lib/insights'
import type { WardrobeItem } from '../types'

interface InsightsPanelProps {
  items: WardrobeItem[]
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-paper/40 px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl leading-none tracking-tight text-ink tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted">{hint}</p>
    </div>
  )
}

export function InsightsPanel({ items }: InsightsPanelProps) {
  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const events = useLiveQuery(() => db.wearEvents.toArray(), [])

  const costs = useMemo(
    () => costSummary(items, outfits ?? [], events ?? []),
    [items, outfits, events],
  )
  const gaps = useMemo(() => wardrobeGaps(items), [items])
  const wornRows = costs.rows.filter((row) => row.wears > 0).slice(0, 4)

  return (
    <section
      aria-labelledby="insights-heading"
      className="rounded-3xl border border-line bg-card p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest">
          <TrendingUp className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-forest">
            The ledger
          </p>
          <h2
            id="insights-heading"
            className="mt-1 font-display text-3xl leading-none tracking-tight text-ink"
          >
            What your wardrobe says
          </h2>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
        Cost per wear and the gaps that would unlock more outfits. Prices stay in
        the currency you enter; nothing is converted.
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Wardrobe value"
          value={costs.pricedCount > 0 ? formatAmount(costs.totalValue) : '—'}
          hint={
            costs.pricedCount > 0
              ? `${costs.pricedCount} priced ${
                  costs.pricedCount === 1 ? 'piece' : 'pieces'
                }`
              : 'No prices yet'
          }
        />
        <Stat
          label="Average per wear"
          value={
            costs.averagePerWear !== null
              ? formatAmount(costs.averagePerWear)
              : '—'
          }
          hint={
            costs.totalItemWears > 0
              ? `${costs.totalItemWears} logged ${
                  costs.totalItemWears === 1 ? 'wear' : 'wears'
                }`
              : 'Log a wear to start'
          }
        />
        <Stat
          label="Not worn yet"
          value={String(costs.unwornCount)}
          hint="Priced pieces with no wear"
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Costing the most per wear
          </h3>
        </div>

        {costs.pricedCount === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-5 text-muted">
            Add a price when you add or edit a piece, and a few logged wears will
            show what each one costs to keep in rotation.
          </p>
        ) : wornRows.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-5 text-muted">
            No wears logged for your priced pieces yet. Save a look, wear it, and
            the numbers will start to move.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70 rounded-xl border border-line/80 bg-paper/40">
            {wornRows.map((row) => (
              <li
                key={row.item.id ?? row.item.createdAt}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {row.item.name}
                  </p>
                  <p className="text-[10px] text-muted">
                    {row.wears} {row.wears === 1 ? 'wear' : 'wears'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
                  {row.perWear === null ? '—' : formatAmount(row.perWear)}
                  <span className="ml-1 text-[10px] font-normal text-muted">
                    / wear
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}

        {costs.unwornCount > 0 && costs.pricedCount > 0 && (
          <p className="mt-2 text-[11px] leading-5 text-muted">
            {costs.unwornCount} priced{' '}
            {costs.unwornCount === 1 ? 'piece has' : 'pieces have'} no wear
            logged yet.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Gaps worth noticing
        </h3>

        {gaps.length === 0 ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-forest/20 bg-forest/5 px-3.5 py-3">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest" />
            <div>
              <p className="text-xs font-medium text-ink">
                The basics are covered.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted">
                A base, a formal option, warmth at both ends, shoes, and a
                neutral are all present.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {gaps.map((gap) => (
              <li
                key={gap.key}
                className="flex items-start gap-2 rounded-xl border border-line/80 bg-paper/40 px-3.5 py-3"
              >
                <CircleAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
                  strokeWidth={1.8}
                />
                <div>
                  <p className="text-xs font-medium text-ink">{gap.title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted">
                    {gap.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
