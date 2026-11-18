# Data model

## Current schema

Defined in `src/db.ts` and `src/types.ts`.

```ts
interface WardrobeItem {
  id?: number
  name: string
  category: Category
  colors: string[]        // hex strings, e.g. "#60704d"
  warmth: 1 | 2 | 3 | 4 | 5
  formality: 1 | 2 | 3 | 4 | 5
  seasons: Season[]
  status: ItemStatus
  notes?: string
  image: Blob             // compressed WebP
  createdAt: number       // Date.now()
  lastWornAt?: number
}

interface Outfit {
  id?: number
  name: string
  itemIds: number[]
  occasion: Occasion
  seasons: Season[]
  createdAt: number
}

interface WearEvent {
  id?: number
  outfitId: number
  wornOn: string          // ISO date, e.g. "2026-11-17"
  feedback?: 'loved' | 'liked' | 'meh' | 'disliked'
  createdAt: number
}
```

### Enumerations

```ts
Category = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory'
Season = 'spring' | 'summer' | 'autumn' | 'winter'
ItemStatus = 'clean' | 'dirty' | 'laundry'
Occasion = 'casual' | 'work' | 'smart' | 'formal'
Level = 1 | 2 | 3 | 4 | 5
```

Labels live next to the options in `src/types.ts` so the UI and data stay in sync.

## Dexie tables

```ts
db.version(1).stores({
  items: '++id, category, status, createdAt, lastWornAt',
  outfits: '++id, createdAt',
  wearEvents: '++id, outfitId, wornOn',
})
```

Indexes are chosen for the planned queries:

- wardrobe grid: `createdAt` (reverse order)
- filters: `category`, `status`
- recency: `lastWornAt`
- outfits: `createdAt` (newest look first)
- wear history: `wornOn`, `outfitId`

## Storage notes

- Images are Blobs, not data URLs. Blobs avoid base64 inflation and are directly usable with `URL.createObjectURL`.
- Images are downscaled to a 1600 px longest edge and encoded as WebP. A typical phone photo becomes a few hundred KB.
- `colors` stores hex strings in sRGB. The extraction pipeline works in Lab but persists hex for easy CSS rendering.
- `Outfit.itemIds` keeps the order the pieces were picked, so a look renders as it was built. The builder toggles a piece on and off, so an id can never appear twice.
- `occasion` is a four-value union and `seasons` is a `Season[]`. Both live inline in the outfit row, so adding them needed no Dexie version bump — no new index was required.
- Deleting an item does not remove its id from `outfits.itemIds`. `resolveOutfitItems` filters missing ids at read time, so an outfit simply shows the pieces that still exist.
- `WearEvent.wornOn` is a local calendar date (`YYYY-MM-DD`), not a UTC timestamp, so an evening wear stays on the day it happened.
- One wear per look per day is a UI rule. The table has no unique index; `OutfitDetail` checks for an existing row before writing and again inside the click handler.
- Deleting a look deletes its wear events in the same transaction, so the log never points at a missing outfit.
- `WearEvent.feedback` is used from M3 slice 3: the wear log toggles it between `loved` and absent. Only `loved` changes a suggestion score; the other values exist in the union but are never written. `WardrobeItem.lastWornAt` is still unused — recency is derived from the wear events instead of stored on the item.

## Weather cache (localStorage)

Weather is intentionally outside Dexie, so the feature needed no schema migration:

- `wardrobe.place.v1` holds `{ latitude, longitude, label }`. Coordinates are rounded to three decimals before saving.
- `wardrobe.weather.v1` holds `{ place, snapshot }`. The snapshot contains temperature, feels-like, precipitation, wind speed, the WMO code, the derived condition and label, the day/night flag, `fetchedAt`, and the place label.
- A cached reading is reused only when its coordinates match the current place, and only for 30 minutes (`WEATHER_CACHE_TTL_MS`).
- These keys are device-local preferences, not wardrobe data. They are not part of backups and can be cleared without losing pieces. Storage failures are swallowed so a blocked profile still works.

`wardrobe.skips.v1` stores the current day’s skipped suggestion keys as `{ date, keys }`. A record from another day is ignored, so skips reset naturally at midnight. Like the weather cache, it is not wardrobe data and is not exported.

## Color preferences (localStorage)

The palette is a preference, not wardrobe data, so it lives outside Dexie under `wardrobe.preferences.v1`:

```ts
interface ColorPreferences {
  undertone: 'warm' | 'cool' | 'neutral' | 'unsure'
  contrast: 'low' | 'medium' | 'high' | 'unsure'
  lovedColors: string[]   // up to 8 normalized hex values
  avoidColors: string[]   // up to 8, disjoint from lovedColors
  updatedAt: number
}
```

- Parsing is tolerant: unknown tone or contrast values become `unsure`, invalid or duplicate hex values are dropped, and each list is capped at eight.
- A color can be in only one list. Clearing preferences removes the key.
- The data is device-local and is not part of a backup: taste belongs to the browser, not the catalogue.
- A blocked or full `localStorage` falls back to the defaults; the panel warns that the choice may not survive a reload.

## App shell cache (Cache Storage)

The service worker keeps the installable shell in Cache Storage under `wardrobe-shell-v2`, separate from IndexedDB:

- Entries are the HTML, manifest, favicon, install icons, and the hashed entry JS/CSS. Photos, outfit data, and weather are never cached.
- It is device-local like the weather cache and is not part of a backup. Clearing site data removes it; the next online load recreates it.
- Activate deletes any cache whose name does not match the current `CACHE_NAME`, so bump that constant when the shell list or fetch strategy changes.
- The ~24 MB cutout WASM and the downloaded model are not cached; the first cutout still needs the network.

## Backup format (v2)

`src/lib/backup.ts` exports one versioned JSON file with pieces, looks, and wear events:

```json
{
  "app": "wardrobe",
  "version": 2,
  "exportedAt": "2026-11-18T12:00:00.000Z",
  "items": [
    {
      "id": 12,
      "name": "Olive linen camp shirt",
      "category": "top",
      "colors": ["#f6f3ee", "#60704d"],
      "warmth": 3,
      "formality": 2,
      "seasons": ["spring", "summer"],
      "status": "clean",
      "notes": "Soft washed linen.",
      "image": "data:image/webp;base64,...",
      "createdAt": 1763380800000
    }
  ],
  "outfits": [
    {
      "id": 3,
      "name": "Rainy Thursday",
      "itemIds": [12, 15],
      "occasion": "work",
      "seasons": ["autumn"],
      "createdAt": 1763380900000
    }
  ],
  "wearEvents": [
    {
      "id": 8,
      "outfitId": 3,
      "wornOn": "2026-11-18",
      "feedback": "loved",
      "createdAt": 1763470000000
    }
  ]
}
```

- Photos are embedded as data URLs so one file restores the wardrobe.
- `id` values exist only to reconnect records inside the file. Import assigns fresh database ids and remaps `outfit.itemIds` and `wearEvent.outfitId`.
- Duplicate detection spans all three tables: a piece or look by `name` + `createdAt`, and a wear by remapped look + `wornOn`. Re-importing the same file is a no-op.
- Version 1 files still import their pieces. The current exporter writes version 2; a newer version is rejected with a readable message.
- Invalid rows are counted and skipped. The import fails only when no valid pieces remain.
- The file is capped at 100 MB.
- A backup contains personal photos and wear history. It must never be committed to the repository.

## Planned fields

Add these with a Dexie version bump when the feature lands:

```ts
interface WardrobeItem {
  // ...
  palette?: string[]         // optional extended palette
  brand?: string
  size?: string
  purchaseDate?: string
  price?: number
  care?: string
  favorite?: boolean
}
```

## Migration rules

1. Never edit an existing `db.version(n)` store definition.
2. Add `db.version(n + 1).stores({ ... }).upgrade(...)`.
3. Update `docs/data-model.md` in the same commit.
4. Export a backup before changing the schema while the app has real data.
