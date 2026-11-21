# Architecture

## Current shape (M5 — recognition-assisted capture)

```mermaid
flowchart LR
  U[User] --> UI[React SPA]
  UI --> DB[(IndexedDB / Dexie)]
  UI --> IMG[Canvas image pipeline]
  IMG --> DB
  UI --> COLOR[Lab k-means color extraction]
  COLOR --> UI
  UI --> REC[Recognition provider]
  REC --> COLOR
  REC --> UI
  REC -. opt-in .-> API[Serverless /api/recognize]
  API -.-> AI[Vision model]
  UI --> WX[Open-Meteo weather]
  WX --> UI
  UI --> LS[(localStorage: place, reading, preferences, skips)]
  UI --> SW[Service worker]
  SW --> CACHE[(Cache Storage: app shell)]
  SW --> NET[Network: HTML + hashed assets]
```

There is no backend in the default build and no account. Photos stay in
IndexedDB, and the shipped network requests are keyless: Open-Meteo weather and
geocoding, plus the cutout model fetched from a public CDN on first use. The
service worker is the only piece that sits between the app and the network for
the shell itself.

The one opt-in exception is remote garment recognition. Setting
`VITE_RECOGNITION_PROVIDER=ai` makes the add form post a downscaled WebP to a
deployer-controlled `/api/recognize`; the reference function in
`server/recognize.ts` holds the key server-side. Nothing is sent by default, and
the default heuristic provider works offline.

## Why local-first

- **Free:** no hosting database, no storage bill, no auth service.
- **Private:** photos never leave the device unless the deployer explicitly opts into remote recognition.
- **Simple:** one static build instead of an API, workers, and a database.
- **Fast:** reading local data does not wait on a network.
- **Honest trade-off:** data lives in one browser profile on one device. Export/import is the escape hatch, and optional sync comes later.

## Installable shell (M4, shipped)

The production build is a PWA. No dependency was added; the manifest and worker are small enough to read in this repo.

- `public/manifest.webmanifest` — name, short name, description, paper theme, `standalone`, and relative `id`/`start_url`/`scope` so the same build works at a domain root or under `/wardrobe/`. Icons are 192, 512, and a maskable 512 generated from `public/icons/icon.svg`.
- `index.html` — links the manifest and the Apple touch icon, and adds the mobile web app meta tags. `theme-color` matches the paper background.
- `src/main.tsx` — registers `${BASE_URL}sw.js` after the window `load` event, production only, and swallows failures. A blocked worker never breaks the app; dev keeps the normal Vite reload flow.

### Service worker strategy

`public/sw.js` is deliberately small:

| Request | Strategy |
| --- | --- |
| Navigation | Network-first; cache the fresh HTML as `./index.html`; fall back to that cached copy offline |
| Same-origin asset | Cache-first; on a miss, fetch and store a 200 response |
| `.wasm` | Not intercepted, so the 24 MB cutout runtime is never cached |
| Cross-origin / outside scope | Not intercepted |

Install precaches `./`, `index.html`, the manifest, the favicon, and the install icons. It then fetches `index.html`, parses the hashed entry `./assets/*.js` and `*.css` out of it, and caches those too, so one online visit is enough to boot offline. `skipWaiting()` and `clients.claim()` make the first visit take control without a second reload. Activate deletes every cache except the current `CACHE_NAME`.

Storing the HTML network-first means a deploy is picked up on the next online load; the hashed assets are immutable, so cache-first is safe. The navigation fetch uses `cache: 'no-cache'` rather than the default HTTP cache: GitHub Pages sends `Cache-Control: max-age=600` for HTML, so without it a fresh deploy could be hidden for ten minutes. `no-cache` still revalidates with the ETag. A change to `sw.js` itself takes two opens: the first installs the new worker, the following load uses it. Bump `CACHE_NAME` (currently `wardrobe-shell-v2`) whenever the shell list or the strategy changes.

One browser detail is worth keeping in mind: Vite's preview server sends `Vary: Origin`, and module/stylesheet requests include an `Origin` header while the precached entries do not. Matching with `{ ignoreVary: true }` keeps the cached shell usable. Without it the HTML loaded offline but its JS and CSS did not.

### Offline limits

- The first visit must be online; after that the shell, wardrobe, add form, looks, and wear log all work offline.
- Weather refresh still needs a connection. The last reading stays visible.
- Recognition works offline with the default heuristic. The opt-in AI provider
  needs the network; a failure falls back to the heuristic and a warning.
- The first background removal still needs a connection; the ~40 MB model and the ONNX WASM are intentionally outside Cache Storage. Later cutouts in the same browsing session reuse the downloaded model.
- Cache Storage is device-local and is not part of a backup. Clearing site data removes it; the next online visit recreates it.
- Service workers require HTTPS or `localhost`, which GitHub Pages provides.

Verified on the production preview at 390 px: one online visit produced nine cache entries, an offline reload rendered the wardrobe, and adding a photo (crop → name → save) worked with the network off. The check is manual because the worker lifecycle is browser behavior, not pure logic.

## Components

### `src/App.tsx`

Owns the app shell: active tab, selected item, toast, and the live query to Dexie. It passes callbacks down; feature components stay mostly presentational.

### `src/components/ItemForm.tsx`

One form powers both capture and editing. It seeds state from an optional saved
item, validates and compresses a new photo, extracts a palette, runs garment
recognition, accepts an optional price, and writes with either `items.add` or
`items.update`. `AddItemView` wraps it as a page; `ItemDetail` mounts it in edit
mode with a cancel path. Replacing a photo only touches the saved Blob when the
user saves the form.

Recognition is wired as a draft: a new photo on a new item triggers one run,
results fill only untouched fields, and the review panel reports exactly what was
applied. In edit mode recognition is an explicit “Analyze photo” action, and
every saved field is protected, so replacing a photo or cutting out an existing
item cannot rewrite saved details on its own. Low-confidence values are marked,
each prediction can be rejected, and every field stays a normal editable control.
The form stays fully usable when recognition fails; the failure is a small
notice, not a blocking state.

The local palette is the source of truth for colors. Recognition (including the
optional AI provider) never writes the color field; it only runs after the
palette has been measured. Clearing an optional field in edit mode writes
`undefined`, which Dexie removes from the stored row instead of leaving the old
value behind.

### `src/lib/recognition/`

The recognition boundary, kept out of the form so it can be tested without a
browser or a network:

- `types.ts` — `RecognitionAttributes`, per-field confidence, the provider
  interface, and the 0.6 low-confidence threshold. `null` always means "not
  recognized", never a guessed value.
- `vocab.ts` — one closed vocabulary for type, pattern, material, fit, sleeve,
  and occasion suggestions, plus the category → allowed-subcategory map.
- `parse.ts` — `normalizeAttributes` and `parseRecognitionResponse`. Unknown
  vocabulary members, malformed colors, out-of-range levels, duplicate or
  impossible values are dropped; confidence is clamped to 0–1. Both a flat
  payload and the server's `{ attributes, confidence }` envelope are accepted.
  A payload with no usable signal throws so the client can fall back.
- `client.ts` — chooses the provider from `VITE_RECOGNITION_PROVIDER`, applies a
  20-second timeout, retries only network/transient 5xx failures, treats
  auth/4xx/rate-limit/timeout outcomes as permanent, and falls back to the
  heuristic with a readable warning. A caller `AbortSignal` cancels an in-flight
  request. `recognizeGarment` never throws.
- `image.ts` — downscales a remote request to 1024 px WebP with explicit EXIF
  orientation, flattens transparency onto white, caps decoded pixels and final
  bytes, and returns `null` on failure. The original is never uploaded when
  preparation fails; the caller uses the local heuristic instead.
- `providers/heuristic.ts` — the default. Reuses the measured palette when one
  is supplied and fills colors only; every other attribute stays blank rather
  than guessed.
- `providers/openai-compatible.ts` — posts `{ imageBase64, mimeType }` to
  `/api/recognize` and validates the response through `parse.ts`. It never sees
  an API key.
- `draft.ts` — pure `recognitionPatch` (skip touched fields),
  `applicableRecognitionPatch` (also enforce category/type consistency),
  `savedFieldsToProtect` (all saved fields in edit mode), and
  `toStoredRecognitionFields` (always returns every key so a cleared value is
  actually removed from IndexedDB).

### `src/components/RecognitionPanel.tsx`

The review card under the photo: model-estimate chips, a low-confidence mark,
per-row reject buttons, retry, and dismiss. It is built from the patch that was
actually applied, so a category/type pair rejected by consistency checks never
appears as filled. Every row is labelled as a model estimate rather than a
verified fact; confidence is not presented as a calibrated probability. It only
reports and clears; it never saves. Rejecting a row marks the corresponding form
field as touched and resets it to the app default, so a retry cannot put the same
guess back.

### `server/recognize.ts`

An optional, deployable reference for the cloud path. It is outside the Vite
build but included in the `tsconfig.server.json` typecheck. It validates method,
a request-body cap before JSON parsing, MIME type, a 4 MB decoded-image ceiling,
and the real image signature; reads `RECOGNITION_API_KEY` from the server
environment; calls an OpenAI-compatible chat endpoint with a strict JSON prompt,
a 15-second timeout, and a bounded output length; and returns either
`{ attributes, confidence }` or a safe `{ error, code }`. A best-effort
single-instance rate limiter and an optional CORS allowlist are integration
points, not authentication. The client validates the payload again, because the
function does not trust the model either.

### `src/db.ts`

Dexie database named `wardrobe` with three tables:

- `items` — wardrobe pieces
- `outfits` — saved combinations of item ids, with occasion and seasons
- `wearEvents` — one row per logged wear; `feedback` records a loved look

Images are stored as `Blob` values inside the item row. The current schema version is 1. Future schema changes must add a new `db.version(n).stores(...)` migration rather than editing version 1.

### `src/lib/images.ts`

1. Validate MIME type and a 20 MB upload ceiling.
2. `createImageBitmap(file)`.
3. Downscale so the longest edge is at most 1600 px.
4. Draw to a canvas and encode WebP at quality 0.86.
5. Store the resulting Blob.

Downscaling keeps IndexedDB usage predictable. The original file is intentionally not kept; if re-processing is needed later, the user can re-upload.

### `src/lib/crop.ts`

Pure geometry plus one canvas call. `fitRect` places the photo inside the crop stage, `defaultCrop` picks the centered starting frame for an aspect ratio, `clampCrop` keeps a frame inside the image, and `resizeCrop` resizes from a corner while preserving the ratio and the opposite anchor. `cropImageToFile` draws the selected region at natural resolution and returns a WebP `File`, so the existing validation and compression pipeline stays unchanged.

### `src/components/CropDialog.tsx`

A modal that opens whenever a photo is chosen or the user presses Crop on an existing one. The frame is dragged with pointer capture, four corners resize it, and four shape presets (free, square, 4:5, 3:4) lock the ratio. The photo is inset from the stage edge so the handles never sit on the clipped boundary. Escape and the backdrop cancel without touching the saved photo; the cropped result only reaches the form after Use this crop.

### `src/lib/cutout.ts`

Wraps the in-browser cutout so the form never imports the model directly. `cutOutBackground` lazily imports `@imgly/background-removal`, runs the smallest model (`isnet_quint8`), and returns a PNG so transparency survives. The model and its WASM runtime are fetched on first use from the package's public CDN — never bundled into the app — which keeps the main chunk small and needs no key. Progress keys map through the pure `describeCutoutStage`, so the UI can show Downloading the model → Removing the background → Preparing the photo.

The library memoizes model loading by `JSON.stringify(config)`, which means a failed load stays failed for the rest of the page session. `cutoutConfig` therefore carries a small attempt offset; since a PNG ignores `quality`, the offset changes only the memo key. That is what makes Retry work without a page reload.

The cutout only replaces the working photo in the form. Saving is still deferred, so a bad cutout is discarded by leaving the form.

### `src/lib/outfits.ts`

Pure helpers behind the outfit UI, kept out of the components so they are testable:

- `toggleItemSelection` adds a piece or removes it, and can never produce a duplicate.
- `groupItemsByCategory` puts the wardrobe in category order for the picker and drops empty groups.
- `resolveOutfitItems` maps saved ids back to rows in the saved order; ids whose item was deleted simply disappear.
- `pieceCountLabel` handles the singular/plural copy.

### `src/lib/wear.ts`

The wear log stays honest about time zones. `localIsoDate` builds `YYYY-MM-DD` from local parts, so a wear logged at 23:45 stays on that day rather than moving to tomorrow in UTC. `describeWornOn` returns Today, Yesterday, or a readable date for older entries. `buildWearHistory` joins events to their look and remaining pieces, sorts by date and then insertion time, and keeps an event whose look is gone so the view can call it a removed look instead of failing.

### `src/lib/weather.ts`

The weather boundary. Pure, network-free helpers sit next to the two fetch calls so the API shape can be tested without a browser:

- `describeWeatherCode` maps the WMO code from Open-Meteo to a condition (`clear`, `cloudy`, `fog`, `drizzle`, `rain`, `snow`, `storm`) and a readable label.
- `isWetCondition` marks anything that warrants rain-ready clothing.
- `weatherBand` turns the feels-like temperature into `cold` (<5°C), `cool` (<14), `mild` (<22), `warm` (<28), or `hot`. The thresholds are a deliberate starting heuristic, easy to tune.
- `isCacheFresh` accepts a reading younger than 30 minutes and rejects future timestamps, so a clock change cannot keep stale data alive.
- `formatUpdatedAt` produces “just now”, “5 min ago”, or “2 hours ago” for the card.
- `parseWeatherPayload` and `parsePlaceResults` validate the JSON from Open-Meteo and skip malformed rows instead of failing a whole list.
- `fetchWeather` requests only `current` fields: temperature, apparent temperature, precipitation, weather code, wind, and day/night.
- `searchPlaces` calls the keyless geocoding endpoint and keeps six candidates.

Location and the last reading live in `localStorage`, not Dexie, so the feature needed no schema migration: `wardrobe.place.v1` stores the chosen coordinates and label, `wardrobe.weather.v1` stores the matching snapshot. A cached reading is reused only for the same coordinates; reading or writing storage is wrapped so a blocked or full store never breaks the page.

### `src/components/WeatherPanel.tsx`

The weather card on the Today page. It starts from the saved place and a cached reading, then fetches only when the cache is stale. Refresh forces a request. If a request fails but an older reading exists, the card shows that reading with an explicit “last reading” warning rather than an empty state.

Location can come from the browser geolocation permission or from a city search. A denied or unavailable permission leaves the current place untouched and points at search. Coordinates are rounded to three decimals before storing, and nothing is sent anywhere except Open-Meteo. The updated time is relative and refreshable; a one-minute interval keeps the label honest while the tab stays open.

### `src/components/TodayView.tsx`

The Today page shell: a local-date eyebrow, the `Today` heading, the weather card, the suggestion cards, and the wear log. It holds the current weather snapshot so the suggestions can react to it, and seeds that snapshot from the cache before the panel fetches. Splitting it out keeps `App` to tab routing.

### `src/lib/insights.ts`

Pure helpers behind the wardrobe ledger:

- `parsePrice` rounds to two decimals and accepts only a positive finite amount, so a blank, zero, negative, or absurd value becomes no price. `formatAmount` renders an amount with `Intl.NumberFormat` and no currency symbol, because the unit belongs to the user.
- `wearsByItem` joins wear events through saved looks and counts each piece once per wear, so a look that lists a piece twice cannot inflate a wear.
- `costSummary` returns the total value of priced pieces, the average cost per wear across their logged wears, and one row per priced piece. Rows with no wear carry a null value and sort last so the UI can name them instead of hiding them.
- `wardrobeGaps` maps the checklist against the suggestion engine's real constraints: a base (top and bottom, or a dress), a piece rated formal, warmth at both ends, shoes, a rain-ready pair, and a neutral anchor. It returns nothing for an empty wardrobe and nothing when the basics are covered.

### `src/components/InsightsPanel.tsx`

The ledger card on the wardrobe page. It reads outfits and wear events live, derives the cost summary and the gaps, and renders three stats, the top pieces by cost per wear, and the gap list. Each state is intentional: no prices yet, priced but never worn, and fully costed. Copy says plainly that prices stay in the currency the user enters and nothing is converted.

### `src/lib/preferences.ts`

Color preferences are a device-local lens on the wardrobe, not catalogue data:

- `wardrobePalette` aggregates the colors stored on items, counting each color once per piece, sorting by frequency then first appearance, and naming each hex with `nameColor`.
- `ColorPreferences` holds `undertone`, `contrast`, `lovedColors`, `avoidColors`, and `updatedAt`. `parsePreferences` is tolerant: unknown tone or contrast values become `unsure`, invalid or duplicate hex values are dropped, each list is capped at eight, and a color cannot be both loved and avoided.
- `readPreferences`, `writePreferences`, and `clearPreferences` wrap `localStorage` under `wardrobe.preferences.v1`. A blocked store returns defaults, and the panel says the choice may not survive a reload.
- `matchesAnyColor` compares with CIEDE2000 at a tolerance of 12, so a photo’s slightly shifted olive still matches the chosen olive. `dominantTemperature` classifies each piece by its first non-neutral hue; `contrastLevel` uses the CIELAB lightness spread of the first color per piece.
- Preferences are intentionally excluded from backups: they describe this browser’s taste, not the wardrobe.

### `src/components/PalettePanel.tsx`

The palette card on the wardrobe page. It shows the derived palette with a heart and a crossed circle on each swatch, undertone and contrast segmented controls, two capped color lists with a native color input, and a reset. Status messages distinguish saved, blocked storage, a full list, and cleared. Controls are buttons with `aria-pressed` where a state applies, and remove targets are at least 24 px.

### `src/lib/recommend.ts`

The rules-based brain behind the daily picks. All of it is pure except the small skip store, so the rules are tested without a browser.

Hard filters (`isEligible`):

- `status === 'clean'` — a look never asks for laundry.
- current season from `seasonForMonth`, where an empty season list means all-season.
- occasion formality range: casual 1–3, work 2–4, smart 3–4, formal 4–5.
- weather band warmth range: cold 4–5, cool 3–4, mild 2–4, warm 1–3, hot 1–2. Feels-like drives this, and the edges are strict on purpose: a 12°C day should not surface linen.
- wet days add a shoe rule (warmth ≥ 3 when cold or cool). There is no material field yet, so shoe warmth is the stand-in for “closed enough for rain”.

Candidate generation:

- a dress, or a top plus a bottom, is the base;
- shoes, outerwear (cold or cool only), and one accessory are optional;
- each category is ranked and capped (six tops, six bottoms, four dresses, four shoes, three outerwear, two accessories) before combos are formed, which keeps the search small.

Scoring:

- item base: distance from the occasion’s ideal formality and the band’s ideal warmth, a recency penalty for pieces worn in the last three days, a small bonus for never worn, and a bonus for pieces from a “loved” look;
- combo: colour harmony, a formality-consistency bonus, extra weight for outerwear on a cold day and for covered shoes on a wet one;
- preferences, when set: a loved colour adds +2 per matching piece (capped +6) with the reason “Includes a color you love”; an avoided colour subtracts −3 per matching piece (capped −6); a matching undertone or contrast adds +2 with an explicit reason. “Not sure” and empty lists change nothing.
- `colorHarmony` prefers neutrals plus one or two hue families and penalises four or more separate hues. It reads the first stored colour per piece, so a busy photo background can blur the signal — a known limitation.
- recency is a penalty, not a hard filter, so a small wardrobe still produces picks.

The top three deterministic combos win, each with up to three reasons. `lastWornByItem` joins wear events through saved looks, `lovedItemIds` collects pieces from looks marked loved, `findMatchingOutfit` compares item sets order-independently so “Wear this” reuses an existing look instead of duplicating it, and `suggestionName` anchors the saved name on the main piece.

Skips are a per-day convenience: `readSkippedKeys` / `writeSkippedKeys` keep `{ date, keys }` in `localStorage` under `wardrobe.skips.v1` and ignore a record from another day. Skipping is not training data; loved looks are the only feedback that changes a score so far.

### `src/components/SuggestionsPanel.tsx`

Owns the occasion picker and the three cards. It reads outfits and wear events live, derives recency and loved pieces, reads the stored palette preferences, and recomputes suggestions with `useMemo`. A short summary under the heading states the active preferences. Each card shows its pieces as thumbnails, the reasons with check marks, and two actions:

- **Wear this** opens one Dexie transaction: reuse a matching look or add a new one, then add today’s wear event only if it is not already there. Even a fast double press cannot duplicate the day.
- **Skip** hides that combination for the rest of the day; a “Show skipped” control brings the picks back.

Empty states distinguish an empty wardrobe, everything in the wash, nothing clean that fits the occasion/weather, and every pick skipped.

### `src/components/OutfitsView.tsx`

Owns the outfits tab. A `useLiveQuery` reads `outfits` newest first. The page has three states: wardrobe empty (send the user to Add), no saved looks, and the card grid. Each card shows up to four pieces in a fixed collage, the occasion, the name, the piece count, and the seasons. The collage sits in an absolutely positioned grid inside an `aspect-square` frame so a tall photo cannot stretch the card. Cards are buttons that open the detail dialog; switching to the builder is local state, and saving returns to the list with a toast.

### `src/components/OutfitBuilder.tsx`

The build form: name, one occasion, any seasons, and a category-grouped piece picker. A sticky summary shows the running count and up to eight thumbnails, and the save button stays disabled until the wardrobe has something in it. Validation is inline: a name is required and at least one piece must be picked. Writes go straight to `db.outfits.add`; there is no draft table.

### `src/components/OutfitDetail.tsx`

The read view for a saved look: the name, when it was saved, the occasion, every piece with its name, and the season chips. Rename is an inline form over the dialog with its own validation; delete asks for confirmation. The dialog keeps the focus on its close button, locks body scroll, and uses Escape to cancel a rename first, then to close. Deleted wardrobe pieces are counted and named as missing rather than silently dropped. After a rename, the parent's live query refreshes the heading in place.

“Wore this today” writes one `wearEvents` row with today’s local date. A live query checks for an existing entry and the button becomes “Logged for today”, so a second press cannot duplicate the day. The check runs again inside the click handler to cover a fast double press. Deleting a look removes its wear rows in the same transaction, so the log never points at a missing outfit.

### `src/components/WearHistoryView.tsx`

The wear log, now the second section of the Today page. It reads `wearEvents` and `outfits` live, builds the joined history with `buildWearHistory`, and groups rows by day: the date label only appears on the first row of each day. Each row shows up to three piece thumbnails, the look’s current name, its occasion, and how many pieces remain. Empty states distinguish “save a look first” from “nothing worn yet” and link to the outfits tab.

Each row also carries a heart toggle. It updates only that wear event’s `feedback` field — `loved`, or removed again — and disables the other hearts while the write is in flight. The live query then refreshes both the row and the suggestion panel, because `lovedItemIds` reads the same events. The label is icon-only on mobile and “Love” / “Loved” from `sm` up, with `aria-pressed` carrying the state for assistive tech. A failed write shows a short inline alert instead of pretending the tap worked.

### `src/components/ItemThumbnail.tsx`

A shared decorative thumbnail for outfit collages and summary strips. It creates and revokes an object URL for the item Blob, marks the image `aria-hidden`, and relies on the name rendered beside it. Pieces without a photo fall back to a quiet "No photo" block.

### `src/lib/backup.ts`

A backup is one versioned JSON file with the full catalogue: pieces with each photo embedded as a data URL, saved looks, and wear events. `downloadBackup` reads items and looks in `createdAt` order — wear rows are sorted in memory because `createdAt` is not indexed on that table — converts every Blob, and triggers a browser download.

`importBackup` validates the file, then treats it as a graph rather than a flat list. Items are matched by `name` + `createdAt`; a duplicate maps the backup id to the existing row. New items are inserted first, then looks are rebuilt with their `itemIds` remapped through that map, then wear events attach through a second look-id map. Missing pieces are dropped from a look, and a wear whose look cannot be mapped is skipped. The database assigns fresh ids; ids in the file are only mapping keys.

Import is additive and idempotent across all three tables: a piece duplicates by `name` + `createdAt`, a look by the same pair, and a wear by remapped look + `wornOn`. Re-importing a file is a no-op. Version 1 backups still import as pieces; a backup from a newer version is rejected with a readable message. Malformed rows are skipped and counted, and the panel reports pieces, looks, and wear entries on both export and import. Photos make backups personal data, so the UI warns the user to keep the file safe.

### `src/lib/storage.ts`

Wraps `navigator.storage` so the UI never calls it directly. `getStorageUsage` returns usage, quota, and a percentage from `estimate()`, plus the persisted flag; `requestPersistentStorage` asks `persist()` and swallows a rejection. `formatBytes` renders a friendly size, and `isQuotaError` recognises the `QuotaExceededError` family so both save and import can show a specific "out of storage" message instead of a generic failure.

`StorageStatus` renders the meter inside the backup panel and keeps three states distinct: checking, unsupported, and reported. It shows an alert above 85% and, if the browser refuses persistence, tells the user to keep a backup.

### `src/lib/colors.ts`

Color extraction is deterministic and local:

1. Draw the photo to a 160 px canvas.
2. Sample up to roughly 6,000 opaque pixels, skipping transparency.
3. Convert each pixel to CIELAB.
4. Run k-means with `maxColors + 2` clusters for 10 iterations.
5. Sort clusters by population and merge centroids closer than a Lab distance threshold.
6. Convert centroids back to hex.
7. Map each hex to the nearest human-readable color name with CIEDE2000.

This is intentionally simpler than a trained fashion attribute model. It is fast, explainable, and good enough to seed the color field. The user can add or remove colors manually.

The canvas work is a thin wrapper: `paletteFromImage` takes a raw RGBA buffer and does the sampling, clustering, and naming, which keeps the interesting part pure and testable. Only `extractPalette` touches `createImageBitmap` and `getImageData`.

## Tests

`npm test` runs Vitest without a real browser. Most tests exercise pure logic;
the DOM, canvas, and IndexedDB boundaries are either mocked or provided by
`fake-indexeddb`, and the reference server is exercised through Web
`Request`/`Response` objects in Node:

- `colors.test.ts` — color naming, and palette extraction from a hand-built RGBA buffer.
- `crop.test.ts` — fit, default frame, clamping, and corner resizing, including ratio and bounds.
- `images.test.ts` — the accepted types and the 20 MB limit.
- `backup.test.ts` — version checks including v1 compatibility, broken files, skipped items, looks, and wear entries, field filtering, and export of the recognition attributes.
- `storage.test.ts` — byte formatting and quota-error detection.
- `cutout.test.ts` — progress-key wording and the retry memo key for the cutout config.
- `outfits.test.ts` — toggling without duplicates, category grouping, resolving deleted items, and the piece count copy.
- `wear.test.ts` — local date keys, Today/Yesterday labels, history ordering, and removed looks.
- `weather.test.ts` — band boundaries, WMO code mapping, wet conditions, cache freshness (including future timestamps), update labels, payload/place parsing, and the localStorage round trip.
- `recommend.test.ts` — season mapping, neutrals and hue harmony, every hard filter, rain and heat exclusions, dress vs. top/bottom bases, formality, the three-pick cap, determinism, recency, loved pieces, skips, preference scoring, and the wear/loved joins.
- `insights.test.ts` — price parsing and formatting, wear counting through looks, the cost summary including unworn and unpriced pieces, and every gap rule including the empty-wardrobe case.
- `recognition/parse.test.ts` — complete payloads, flat and server envelopes, unknown vocabulary, invalid colors, out-of-range levels, category/subcategory consistency, signal-free failures, material-only responses, and confidence clamping.
- `recognition/client.test.ts` — provider selection, transient-vs-permanent retry rules, auth/rate-limit mapping, timeout, caller cancellation, fallback to the heuristic (including fallback failure), and palette reuse, with deterministic provider mocks.
- `recognition/openai-compatible.test.ts` — request shape, server error codes and Retry-After, non-JSON responses, and schema validation at the network adapter.
- `recognition/types.test.ts` — the low-confidence threshold, including the boundary and the no-result case.
- `recognition/draft.test.ts` — touched/saved-field protection, applicable category/type filtering, explicit edit-mode recognition, and conversion of form values to stored optional fields (including cleared keys and guarded types).
- `recognition/persistence.test.ts` — fake-IndexedDB regression tests for clearing optional fields, category changes, rejected predictions, preserved unrelated fields, and replacement-photo protection.
- `recognition/image.test.ts` — EXIF orientation, aspect-ratio downscaling, pixel and byte caps, transparency flattening, and the null fallback for unsupported images.
- `server/recognize.test.ts` — method/body/image validation, base64 and magic-byte checks, safe error mapping, provider request construction, timeout handling, rate limiting, and CORS.

The canvas and pointer-drag paths are verified in a browser instead; IndexedDB
write/clear behavior has `fake-indexeddb` regression coverage, and the manual
checks are recorded in the devlog. CI runs the tests between typecheck and
build.

### `src/hooks/useObjectUrl.ts`

Creates an object URL for a Blob and revokes it on change/unmount. This avoids leaking memory when the wardrobe re-renders.

## Data flow: add a piece

```mermaid
sequenceDiagram
  participant U as User
  participant F as AddItemView
  participant C as Color extractor
  participant R as Recognition provider
  participant I as Image pipeline
  participant D as Dexie

  U->>F: Choose photo
  F->>C: extractPalette(photo)
  C-->>F: hex colors
  F->>R: recognize(photo)
  alt default heuristic
    R-->>F: colors only, locally
  else opt-in AI provider
    R->>R: downscale to 1024 px WebP
    R-->>F: validated attributes or fallback + warning
  end
  U->>F: Review, reject, correct, confirm details
  F->>I: prepareImage(photo)
  I-->>F: compressed WebP Blob
  F->>D: items.add({ ...fields, image })
  D-->>F: id
  F-->>U: Back to wardrobe + toast
```

Recognition runs before the save step and never writes to Dexie itself. The
user remains the only writer, and every predicted value is visible and editable
before it can be stored.

## Feature notes

### Garment recognition (M5, shipped)

Two providers, one validated contract:

| Provider | Default | Network | What it fills |
| --- | --- | --- | --- |
| Heuristic | Yes | None | Colors (measured locally) |
| OpenAI-compatible | No | `POST /api/recognize` | Recognized attributes except colors |

The default is deliberately conservative: pixels alone cannot tell cotton from
linen, so the local provider does not pretend. The AI path is opt-in because a
static site cannot hide a key and a paid vision call is outside the free-only
constraint. When enabled, the image is downscaled to 1024 px WebP before it
leaves the browser, and only the deployer's function sees the key.

The local palette remains authoritative in both modes: an AI response can
suggest colors, but the app does not apply them over the measured palette.

The review rules are part of the contract, not polish:

- confidence is UI copy for the model's own 0–1 estimate, never a calibrated
  probability;
- a low-confidence value (≤ 0.6) is marked "low confidence";
- each reviewed row can be rejected, which clears the form value and protects
  it from a retry;
- every saved field is protected in edit mode; replacing a photo or cutting out
  an existing item does not auto-apply recognition;
- recognition never writes on its own, and saving still requires a name and a
  photo;
- a timeout, provider error, or malformed payload degrades to the local
  heuristic plus a warning, never to a broken form.

The closed vocabulary means "corduroy" or "wrap dress" is not invented when it
is not in `vocab.ts`; the value becomes unknown and the user can choose the
closest listed option. That is an intentional trade against a hallucinated
attribute reaching the catalogue.

### Background removal (M1, shipped)

Shipped in M1 as an in-browser cutout:

- The photo is passed to `@imgly/background-removal` in the same tab; nothing is uploaded.
- The model is a ~40 MB `isnet_quint8` ONNX file fetched on first use from a public CDN, so the catalog keeps working offline after the first cutout while the model stays cached.
- The output is a PNG, so the transparent background survives into the stored image. Color extraction skips pixels below alpha 180, so the palette becomes garment-only.
- The dependency is AGPL-3.0, which is why the repo license is AGPL-3.0.

Limits to remember: inference is CPU-bound and takes a few seconds, the first run is download-bound, and a blurry or busy background still yields a rough mask. The user can always skip the cutout.

### Weather (M3 slice 1, shipped)

Open-Meteo, fetched directly from the browser:

- `current` temperature and apparent temperature (feels-like drives the clothing band)
- precipitation and weather code
- wind speed
- day/night flag

Only coordinates are sent, rounded to three decimals. The reading is cached for 30 minutes in `localStorage` and reused across reloads without a request. The module boundary keeps the provider swappable without touching the recommendation logic. The UI falls back to a manual city search when geolocation is denied.

Limits to remember: the API has no key but also no uptime promise; the card can show a stale reading with a warning. Location is whatever the browser reports, so a VPN or desktop without GPS may resolve to a nearby city.

### Recommendation pipeline (M3 slice 2, shipped)

```text
hard filters
  occasion + formality range
  season + weather band
  status = clean
  wet-day shoe rule
        ↓
candidate generation
  top + bottom, or dress
  shoes
  optional outerwear
  optional accessory
        ↓
scoring
  color harmony (neutral anchors + hue families)
  formality consistency
  warmth vs feels-like
  recency and loved pieces
        ↓
top 3 + explanation
```

Shipped in `src/lib/recommend.ts` with the caps and ranges described above. The first version is rules-based: with one user and a small wardrobe, learned ranking has nothing to learn from. Loved looks are the one feedback signal that moves a score today; skips only hide a pick for the day, and the weights stay hand-tuned rather than fitted.

### Color preferences (M4 slice 3, shipped)

Palette preferences are a transparent tie-breaker, not a model of the wearer:

- Loved and avoided colors match perceptually (CIEDE2000 ≤ 12), so nearby shades still count.
- Undertone and contrast describe the colors in a combination, not skin. The UI says so, and the PRD explicitly excludes claims that skin tone scientifically determines flattering colors.
- The weights stay small relative to formality, warmth, and recency, so a preference can break a tie without overriding the weather or the occasion.
- Storage is `localStorage`, device-local, and excluded from backups.

### Deployment

The Vite build is static. `base: './'` makes it portable to a GitHub Pages project URL (`https://<user>.github.io/wardrobe/`). The workflow in `.github/workflows/deploy.yml` builds `dist/` and deploys it with GitHub Pages. No server runtime is needed. `server/recognize.ts` is a reference file outside the client build; the Pages deploy ignores it, so the AI provider is only available if a deployer hosts that function separately. That reference function is not deployed here and has not been integration-tested against a live provider.

## Security and privacy

- No secrets or API keys exist in the client. `RECOGNITION_API_KEY` is read only
  by the optional server function; any `VITE_*` value is public by definition.
- In the default build, no user photos are uploaded. With
  `VITE_RECOGNITION_PROVIDER=ai`, a 1024 px WebP copy is posted to the deployer's
  `/api/recognize`. If preparation fails, the original is never uploaded: the
  app falls back to the local heuristic, and the server independently enforces a
  body cap, a 4 MB decoded-image ceiling, and a real image-signature check.
- The reference function has no authentication and no distributed rate limiting.
  Its in-memory limiter is a single-instance safety valve, and its optional CORS
  allowlist is not authentication. Before exposing a paid provider publicly, a
  deployer must add platform/distributed abuse protection and a provider
  spending cap; otherwise the endpoint is an open proxy to their key.
- Weather coordinates are the only other network payload besides the cutout
  model download.
- Export files will contain personal wardrobe data; warn the user before sharing.
- If sync is added, authentication and row-level authorization become mandatory before the first sync.

## Constraints

- IndexedDB quota varies by browser; images should stay compressed.
- Data is per browser profile. Private browsing may evict storage.
- No background processing; heavy image work must stay off the main thread once it grows.
- A static site cannot hide API keys. Prefer keyless APIs or user-supplied keys.
