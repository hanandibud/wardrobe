# Devlog

A short, append-only record of what changed and why. Newest entries first.

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
