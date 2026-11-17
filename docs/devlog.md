# Devlog

A short, append-only record of what changed and why. Newest entries first.

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
