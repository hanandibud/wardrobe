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
  occasion: string
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
- wear history: `wornOn`, `outfitId`

## Storage notes

- Images are Blobs, not data URLs. Blobs avoid base64 inflation and are directly usable with `URL.createObjectURL`.
- Images are downscaled to a 1600 px longest edge and encoded as WebP. A typical phone photo becomes a few hundred KB.
- `colors` stores hex strings in sRGB. The extraction pipeline works in Lab but persists hex for easy CSS rendering.
- Deleting an item does not yet clean up `outfits.itemIds` references. The outfit UI must filter missing IDs or perform a cleanup transaction.

## Backup format (M1)

`src/lib/backup.ts` exports one versioned JSON file:

```json
{
  "app": "wardrobe",
  "version": 1,
  "exportedAt": "2026-11-17T12:00:00.000Z",
  "items": [
    {
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
  ]
}
```

- Photos are embedded as data URLs so one file restores the wardrobe.
- Import validates the shape, merges into the current database, and skips an item when its `name` + `createdAt` already exists.
- Invalid entries are counted and skipped. The import fails only when no valid pieces remain.
- The file is capped at 100 MB, and the backup version must match the app's current version.
- Outfits and wear events are not included yet; add them with a version bump when those features ship.
- A backup contains personal photos. It must never be committed to the repository.

## Planned fields

Add these with a Dexie version bump when the feature lands:

```ts
interface WardrobeItem {
  // ...
  cutout?: Blob              // transparent PNG/WebP
  palette?: string[]         // optional extended palette
  brand?: string
  size?: string
  purchaseDate?: string
  price?: number
  care?: string
  favorite?: boolean
}

interface Preference {
  id?: number
  undertone?: 'warm' | 'cool' | 'neutral'
  contrast?: 'low' | 'medium' | 'high'
  lovedColors: string[]
  avoidColors: string[]
  styleTags: string[]
  updatedAt: number
}
```

## Migration rules

1. Never edit an existing `db.version(n)` store definition.
2. Add `db.version(n + 1).stores({ ... }).upgrade(...)`.
3. Update `docs/data-model.md` in the same commit.
4. Export a backup before changing the schema while the app has real data.
