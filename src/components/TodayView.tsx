import { useState } from 'react'
import { readCachedWeather, readSavedPlace, type WeatherSnapshot } from '../lib/weather'
import type { WardrobeItem } from '../types'
import { SuggestionsPanel } from './SuggestionsPanel'
import { WearHistoryView } from './WearHistoryView'
import { WeatherPanel } from './WeatherPanel'

interface TodayViewProps {
  items: WardrobeItem[]
  onSeeOutfits: () => void
  onAddItems: () => void
  onSaved: (message: string) => void
}

export function TodayView({
  items,
  onSeeOutfits,
  onAddItems,
  onSaved,
}: TodayViewProps) {
  const [today] = useState(() => new Date())
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => {
    const place = readSavedPlace()
    return place ? readCachedWeather(place) : null
  })
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(today)

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
          {dateLabel}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl">
          Today
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Start with the weather, then decide what to wear. Suggestions and the
          wear log live here.
        </p>
      </header>

      <WeatherPanel onSnapshotChange={setWeather} />

      <SuggestionsPanel
        items={items}
        weather={weather}
        onAddItems={onAddItems}
        onSaved={onSaved}
      />

      <WearHistoryView items={items} onSeeOutfits={onSeeOutfits} />
    </div>
  )
}