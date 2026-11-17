# Devlog

A short, append-only record of what changed and why. Newest entries first.

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
