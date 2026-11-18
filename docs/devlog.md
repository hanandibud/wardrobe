# Devlog

A short, append-only record of what changed and why. Newest entries first.

## 2026-11-18 — M4: a palette you can tune, not a verdict

- Added `src/lib/preferences.ts` plus `src/components/PalettePanel.tsx`. The panel sits on the wardrobe page and derives the colors that actually appear in the wardrobe, most-used first, with a piece count beside each swatch.
- Every swatch has a heart and a crossed circle: loved colors and avoided colors are separate lists capped at eight. Adding a color to one list removes it from the other, so a color cannot be both. Custom colors are available when the garment’s color is not in the derived palette.
- Added undertone (warm, cool, neutral, not sure) and contrast (low, medium, high, not sure). The copy is explicit that these describe the clothes and are small tie-breakers, not a claim that skin tone determines flattering colors.
- Preferences live in `localStorage` under `wardrobe.preferences.v1`, not Dexie, so there is no schema bump. Parsing is tolerant: unknown values become “not sure”, malformed colors are dropped, lists are capped, and blocked storage falls back to the defaults with an inline warning. Preferences are deliberately not part of a backup and the panel says so.
- Scoring changes are deliberately small. A combo with a loved color gets +2 per matching piece (capped +6) and the reason “Includes a color you love”; an avoided color costs −3 per matching piece (capped −6). A matching undertone or contrast adds +2. The defaults and “Not sure” are no-ops, so an untouched install ranks exactly as before.
- Preference reasons are inserted before the generic formality and harmony reasons so they survive the three-reason cap; the browser check caught them being crowded out.
- Color matching uses CIEDE2000 with a tolerance of 12, so “olive” covers the near-olive a photo produced rather than demanding an exact hex. Shared `isNeutralColor` and `hueOf` moved to `src/lib/colors.ts`; `recommend.ts` re-exports `isNeutralColor` for compatibility.
- The Today page reads preferences on mount and shows a short summary line under the suggestion heading, e.g. “Your palette: warm undertone · high contrast · 2 loved colors · 1 avoided color.”
- Added `preferences.test.ts` and four `recommend` integration tests: parsing, storage failure, palette counting, perceptual matching, tone and contrast classification, loved/avoided scoring, and matching reasons. Suite is 175.
- Verified in a browser at 390 px and 1440 px: palette renders with no horizontal overflow; love, avoid, tone, and contrast survive a reload; moving a color between lists works; a custom color adds; reset clears both storage and UI; the Today summary and pick reasons respond. Screenshots kept locally only because the seeded wardrobe is test data.
- Fixed two edges found during that pass: a full list now says “That list is full. Remove a color first.” instead of silently dropping a color, and reset confirms “Preferences cleared.” Remove targets are 24 px minimum.

**Next:** M4 slice 4 — cost-per-wear and wardrobe gap insights.

## 2026-11-18 — M4: a deploy should not hide behind the HTTP cache

- Live-checking the backup release found the new HTML on Pages but the old bundle still running. GitHub Pages sends `Cache-Control: max-age=600` for HTML, and the worker’s network-first fetch was accepting that HTTP-cached response.
- Navigation now calls `fetch(request, { cache: 'no-cache' })`. It still revalidates with the ETag, so a deploy is visible on the next online load without a ten-minute wait or a forced reload.
- Bumped the shell cache to `wardrobe-shell-v2` because the strategy changed; activate deletes v1. No data or schema change.
- Verified on preview from a clean registration: v2 installs nine entries and the offline reload still renders. The live backup panel was confirmed with a cache-busting load.

**Next:** M4 slice 3 — editable palette and undertone preferences.

## 2026-11-18 — M4: a backup that includes the looks and the log

- Bumped the backup format to v2. It now carries saved looks and wear events, including `loved`, so a restore is the whole wardrobe rather than just the pieces.
- Import treats the file as a graph: pieces are inserted or matched first, then outfit `itemIds` are remapped to the new ids, then wear rows attach through a second map. Ids in the file are mapping keys only; the database still assigns its own.
- Version 1 files still import as pieces. The parser rejects newer versions and skips malformed looks or wear rows instead of failing the whole file.
- Duplicate detection now spans all three tables: a piece or look by `name` + `createdAt`, and a wear by remapped look + `wornOn`. Importing the same file twice is a no-op.
- The panel reports what actually moved: “Backed up 3 pieces, 1 look, 1 wear entry,” and an import that hits only duplicates says “Everything in that backup is already here.”
- Fixed a bug the browser test caught: `wearEvents` has no `createdAt` index, so `orderBy('createdAt')` threw and the export catch showed a generic failure. Wear rows are now sorted in memory; no Dexie bump for an ordering query.
- Added parser coverage for v2 looks and wears, v1 compatibility, and malformed rows. Suite is 148.
- Verified in the browser: created a two-piece look, logged and loved it, exported, cleared all three tables, imported, and saw 3 pieces / 1 look / 1 loved wear with remapped ids; re-imported for the duplicate path; and imported a hand-built v1 file that added only its piece. No schema change.

**Next:** M4 slice 3 — editable palette and undertone preferences.

## 2026-11-18 — M4: install it, then open it offline

- Started M4 with the installable shell, which is the milestone’s acceptance test. No dependency: `public/manifest.webmanifest`, a hand-written `public/sw.js`, and icons generated from the existing hanger silhouette.
- The manifest uses relative `id`, `start_url`, and `scope` because `vite.config.ts` builds with `base: './'` for the GitHub Pages project path. `display: standalone`, paper theme, and 192/512/maskable icons under `public/icons/`.
- `index.html` links the manifest and Apple touch icon and adds the mobile web app meta tags. Registration lives in `src/main.tsx`, after `load`, production only, and swallows failures so a blocked worker cannot break the app.
- The worker precaches the shell and then reads the hashed entry JS/CSS out of the built HTML. That was the difference between “offline works after one reload” and “offline works after one online visit”.
- Navigation is network-first with a cached `index.html` fallback; same-origin assets are cache-first and runtime-cached. `.wasm` is deliberately bypassed so the 24 MB cutout runtime never lands in Cache Storage.
- Found and fixed a real offline bug: Vite preview sends `Vary: Origin`, and module/style requests carry an `Origin` header that the precache entries lack, so `cache.match` missed and the offline page rendered as empty HTML. `{ ignoreVary: true }` on the shell cache fixed it.
- Activate deletes other cache names; bump `wardrobe-shell-v1` when the shell list or strategy changes. The installed app picks up a deploy on its next online open.
- No Dexie change. Cache Storage is device-local, is not exported, and is safe to clear.
- Verified on `npm run preview` at 390 px from a clean registration: one online visit produced nine cache entries, an offline reload rendered the wardrobe, and Add → upload → crop → name → save worked with the network off, storing the item with extracted colors.
- Updated the README install section, architecture, data model, and roadmap, and moved the footer to “Early build · M4 in progress”. Corrected the stale Pages checkbox; the workflow has been live since M1.

**Next:** M4 slice 2 — export/import polish, then palette preferences, insights, accessibility, and refreshed screenshots.

## 2026-11-18 — M3: love a look, and the picks remember

- Added a heart toggle to every wear-log row. It flips `WearEvent.feedback` between `loved` and absent, one event at a time; the other hearts disable while the write is in flight so a fast double tap cannot race.
- The toggle is icon-only on mobile and “Love” / “Loved” from `sm` up. `aria-pressed` plus a state-specific `aria-label` carry the meaning without relying on color. A failed write shows an inline alert.
- This closes the feedback loop that was already in the engine: `lovedItemIds` reads the same events, so loving a wear immediately adds the “Includes a piece you loved” reason and a small item bonus to later picks. No new scoring code was needed.
- Skips stay what they were: a per-day hide in `localStorage`, explicitly not training data.
- No schema change. `feedback` was already in the `WearEvent` type and Dexie stores the whole object, so the first three milestones needed no migration.
- Marked M3 complete in the roadmap and README, updated the architecture and data-model notes, and moved the footer to “Early build · M3 complete”.
- Verified in a browser: love a row, reload, the state persists; unlove it, the field disappears and the picks lose the loved reason; at 390 px the hearts stay icon-only with no horizontal overflow.

**Next:** M4 — installable PWA, then screenshots and a demo pass.

## 2026-11-18 — M3: three picks, and the reason why

- Added `src/lib/recommend.ts` as the rules-based suggestion engine. It is pure apart from the per-day skip store, so every filter and score is testable.
- Hard filters are clean status, season, occasion formality, and weather warmth. The warmth ranges are strict on purpose: cool is 3–4, so a 12°C rainy day rejects linen, sandals, and thin sneakers.
- Combinations are a dress, or a top plus a bottom, with optional shoes, outerwear (cold/cool only), and one accessory. Each category is ranked and capped before combos are formed, keeping the search in the hundreds rather than thousands.
- Scoring blends formality distance, warmth distance, recency (a penalty, not a hard filter), loved pieces, colour harmony, and small bonuses for outerwear in the cold and covered shoes in the wet.
- Colour harmony uses the first stored colour per piece: neutral anchors plus one or two hue families score well, four separate hues are penalised. It is transparent, not scientific; a busy photo background can blur the signal.
- “Wear this” runs one Dexie transaction: reuse a look with the same piece set or create one, then add today’s wear only if it is missing. The card switches to “In today’s log” through the live query.
- Skips persist per local day in `localStorage` (`wardrobe.skips.v1`), so hiding a pick survives a reload and resets overnight. A “Show skipped picks” control brings them back.
- Added an occasion picker (casual, work, smart, formal) and an honest set of empty states: empty wardrobe, all laundry, nothing fits the filters, or every pick skipped.
- The Today page now holds the weather snapshot so the suggestion panel can react to feels-like and rain without a second request.
- Added `recommend.test.ts` (34 tests): season mapping, neutral detection, every hard filter, the rainy-12°C and hot-30°C acceptance cases, dress bases, formality, the three-pick cap, determinism, recency, loved pieces, skips, and the wear/loved joins. Suite is now 144.
- Verified in a browser at 1440 px and 390 px with a seeded 13-piece test wardrobe: three cards with reasons, “Wear this” creating one look and one wear, occasion switching, three skips surviving a reload, and resetting them. No horizontal overflow.

**Next:** M3 slice 3 — loved feedback in the wear log, then milestone docs and polish.

## 2026-11-18 — M3: today’s weather, cached

- Added `src/lib/weather.ts`: WMO code mapping, a feels-like clothing band, cache freshness, relative update labels, payload and place parsing, and the two keyless Open-Meteo calls.
- The weather band is a starting heuristic: cold below 5°C, cool below 14, mild below 22, warm below 28, hot above. It only reads feels-like, not the raw temperature.
- Location and the last reading live in `localStorage` (`wardrobe.place.v1`, `wardrobe.weather.v1`) with a 30-minute TTL. That avoided a Dexie migration; the cache is a device preference, not wardrobe data.
- Rebuilt the Today tab as `TodayView`: a local-date eyebrow, the weather card, then the existing wear log. The wear log heading is now an `h2` under the page `h1`.
- The weather card starts from the saved place and cached reading, fetches only when stale, and exposes Refresh. A failed refresh keeps the last reading visible with an explicit warning instead of blanking the card.
- Geocoding search accepts ≥2 letters, lists six candidates with their region and country, and marks the current one. A denied geolocation leaves the place untouched and suggests search.
- Coordinates are rounded to three decimals before they are stored or sent. Nothing else leaves the browser.
- Added `weather.test.ts` (25 tests): band boundaries, every WMO group, wet conditions, cache freshness including future clocks, relative labels, payload validation, malformed place rows, and the localStorage round trip. Suite is now 110.
- Verified in a browser at 1440 px and 390 px: empty state, Bandung search and selection, weather render, reload with zero weather requests (cache hit), Refresh issuing exactly one request, denied geolocation fallback, and no horizontal overflow.

**Next:** M3 slice 2 — the occasion picker and the rules-based suggestion with a short “why”.

## 2026-11-18 — M2: wear logging and the wear log

- The outfit dialog now has “Wore this today”. It writes a `wearEvents` row, and a live query flips the button to “Logged for today”, so the same look cannot be logged twice in a day. The click handler re-checks before writing to cover a fast double press.
- `wornOn` is a local calendar date, not a UTC timestamp; a wear logged at 23:45 stays on that day.
- Added a wear log in the Today tab: rows newest first, a date heading per day, three thumbnails, the look’s current name, occasion, and piece count.
- The log distinguishes an empty wardrobe from an empty log, and an event whose look is gone is shown as a removed look instead of disappearing.
- Deleting a look now removes its wear rows in the same Dexie transaction, and the confirmation says so. Verified: log a temporary look, delete it, and the event count drops back with the original entry intact.
- Removed the old `ComingSoon` placeholder; every tab now has real content.
- Added `wear.test.ts` (10 tests): local date keys, Today/Yesterday across a month boundary, malformed dates, history ordering, and removed looks. Total suite is 85.
- Verified in a browser at 1440 px and 390 px: empty log, log a wear, reload and see it still logged, and delete a worn look. No horizontal overflow at 390 px.

**Next:** M3 — weather, the occasion picker, and the first rule-based suggestion.

## 2026-11-18 — M2: open, rename, and remove a look

- Outfit cards are now buttons. The dialog shows the saved name, date, occasion, every remaining piece with its name, and the season chips.
- Rename happens inline in the dialog: the field is prefilled and focused, an empty name is rejected, and the heading updates in place because the list's live query re-reads the row.
- Remove asks for confirmation, deletes the row, closes the dialog, and toasts. The cancel path leaves the outfit untouched.
- Escape cancels a rename first and closes the dialog second, matching the item dialog. Focus starts on the close button, body scroll is locked, and the dialog is a bottom sheet on mobile.
- If some pieces were deleted from the wardrobe, the dialog shows only the pieces that remain and counts the missing ones instead of silently shrinking the look.
- Verified in a browser at 1440 px and 390 px: open, rename to a blank (error), rename properly, reload to confirm the new name, create a second look, delete it with confirmation, and check the first look survived. No horizontal overflow at 390 px.

**Next:** “wore this today” and wear history — the last M2 slice.

## 2026-11-18 — M2: build and save an outfit

- The Outfits tab is now a real page: a newest-first card grid, a "Build an outfit" action, and separate empty states for an empty wardrobe and an empty outfit list.
- Added the builder: name, one of four occasions (`casual | work | smart | formal`), any seasons, and a picker grouped by category. A sticky summary tracks the pieces as they are picked.
- A piece toggles on and off, so the same item can never be saved twice in one look. The pure `toggleItemSelection` helper has a test that presses the same piece five times and still ends with one id.
- Outfit cards show a four-piece collage, occasion, name, piece count, and seasons. The collage is an absolutely positioned grid inside an `aspect-square` frame; without that, a tall photo stretched the card far past its intended height.
- Deleted wardrobe items are filtered out by `resolveOutfitItems` at read time, so an outfit keeps working and simply shows the pieces that remain.
- Added `outfits.test.ts` (12 tests): toggling, grouping order, missing ids, and count copy. Total suite is now 75.
- Verified in a browser at 1440 px and 390 px: build a look, toggle the same piece three times, save, reload, and the card is still there with two unique ids. No horizontal overflow at 390 px.

**Next:** outfit detail with rename and delete.

## 2026-11-17 — M1: retrying a failed cutout

- `@imgly/background-removal` memoizes model loading by `JSON.stringify(config)`, so a load that failed stayed failed for the rest of the page session and the Retry button did nothing.
- `cutoutConfig` now includes an attempt offset. A PNG ignores `quality`, so the offset only changes the memo key and never the output.
- Verified in a browser: block the model CDN, watch the cutout fail, restore the network, press Retry, and the cutout completes.

## 2026-11-17 — M1: in-browser background removal

- Added a "Remove background" action to the shared item form, below the photo card, with working, progress, and failed states.
- Cutouts run locally through `@imgly/background-removal` on the smallest `isnet_quint8` model, imported lazily so the main bundle stays small.
- The model and its WASM runtime come from the package's public CDN on first use. No key, no account, and the photo never leaves the browser.
- The result is a PNG, so the transparent background survives. Color extraction already skips pixels below alpha 180, so the palette comes back garment-only.
- Progress is shown as Downloading the model → Removing the background → Preparing the photo, from the pure `describeCutoutStage` helper.
- `@imgly/background-removal` is AGPL-3.0, so the repo license moved from MIT to AGPL-3.0. `LICENSE` is now the verbatim AGPL text and `package.json` declares `AGPL-3.0-or-later`. Recorded in ADR 0003.
- Added a test for the progress-key wording.
- Verified in a browser: cut out a synthetic flat lay, watch the progress, confirm the saved card shows the cutout and the palette drops the background colors.

**Next:** M2 — the outfit builder.

## 2026-11-17 — M1: unit tests

- Added Vitest as a dev dependency and an `npm test` script; CI runs it between typecheck and build.
- Split the pure part of color extraction into `paletteFromImage`, which takes a raw RGBA buffer, leaving only `extractPalette` to touch canvas APIs. That makes the sampling, clustering, and naming testable without a DOM.
- Added 54 tests across `colors`, `crop`, `images`, `backup`, and `storage`: color naming, palette extraction, crop fit/clamp/resize with ratio and bounds, the 20 MB upload limit, backup version and field validation, byte formatting, and quota-error detection.
- Kept the suites dependency-light: Vitest runs in the default Node environment because nothing under test needs a browser. Canvas, IndexedDB, and drag interactions stay covered by in-browser checks.

**Next:** background removal, the last M1 item.

## 2026-11-17 — M1: crop before saving

- Picking a photo now opens a crop step instead of committing the file straight away.
- Added `CropDialog`: drag the frame to move it, pull a corner to resize, and pick free, square, 4:5, or 3:4.
- Crop geometry lives in `src/lib/crop.ts` as pure functions so a corner drag cannot leave the image or break the ratio.
- Cropping draws the selected region on a canvas and hands the result back as a WebP `File`, so the existing validation, downscaling, and color extraction still run unchanged.
- The item editor has a Crop button, so a saved photo can be re-cropped without re-uploading it.
- Escape and Cancel close the crop step and keep the current photo.
- The photo is inset from the crop stage edge, so corner handles stay easy to grab.
- Verified in a browser: crop, apply, save, and reload, plus re-cropping a saved piece and the 390 px layout.

**Next:** tests, and background removal.

## 2026-11-17 — M1: storage quota states

- Added a local storage meter to the backup panel, built on `navigator.storage.estimate()`.
- Added a "Protect local data" action that calls `navigator.storage.persist()` and reports whether the browser agreed.
- Handling covers the checking, unsupported, and reported states, plus an alert above 85% usage.
- Saving a photo and importing a backup now detect `QuotaExceededError` and explain what to do instead of failing silently.
- Verified the meter and the persistence message in a browser.

**Next:** crop, tests, and background removal.

## 2026-11-17 — M1: back up and restore

- Added a versioned JSON backup that embeds each photo as a data URL.
- Export downloads `wardrobe-backup-YYYY-MM-DD.json` with every piece and its details.
- Import validates the file, restores photos as Blobs, and merges into the current wardrobe.
- Same name + `createdAt` counts as a duplicate, so importing twice is safe.
- Malformed items are skipped and counted; unreadable files show a readable error.
- Backup files are capped at 100 MB and contain personal photos, so the UI says to keep them safe.
- Verified export → clear IndexedDB → import in a browser, including a duplicate import and an invalid file.

**Next:** storage quota states, crop, tests, and background removal.

## 2026-11-17 — M1: edit a saved piece

- Extracted the add form into a shared `ItemForm` so capture and edit use the same fields, photo pipeline, and color detection.
- Added an edit mode to the item dialog: name, category, colors, warmth, formality, seasons, availability, notes, and the photo.
- A replacement photo is compressed and color-detected locally; the saved Blob changes only after the user saves.
- Escape now cancels editing first and closes the dialog on the second press.
- Added a “Changes saved.” toast and an edit screenshot.
- Verified the edit flow in a browser, including a reload, and checked the layout at 390 px.

**Next:** export/import backup, storage quota states, crop, tests, and background removal.

## 2026-11-17 — M0: the wardrobe exists

- Scaffolded Vite + React + TypeScript + Tailwind.
- Added Dexie with `items`, `outfits`, and `wearEvents` tables.
- Built the add-piece flow: photo, name, category, colors, warmth, formality, seasons, availability, notes.
- Added local image compression to WebP (max 1600 px) before storing in IndexedDB.
- Added CIELAB k-means color extraction with editable color chips and human-readable names.
- Built the wardrobe grid with search, category filters, empty state, and loading state.
- Built the item detail dialog with availability changes and deletion.
- Added responsive navigation and tested at 390 px width.
- Verified `npm run build`.
- Wrote the PRD, architecture, data model, roadmap, setup guide, ADRs, and agent instructions.

**Next:** GitHub login and first push, then M1 — edit, crop, cutout, export/import, tests.

**Known gaps:** no edit yet, no crop, no background removal, no outfits, no weather, no export/import, no tests.
