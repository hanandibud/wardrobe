# Roadmap

Each milestone is a shippable slice, not a folder of half-finished experiments. Keep `main` working.

## M0 — Capture and browse (done)

- [x] Vite + React + TypeScript + Tailwind scaffold
- [x] Local Dexie database
- [x] Add a piece with a photo
- [x] Downscale and store photos in IndexedDB
- [x] Automatic color extraction + color naming
- [x] Category, warmth, formality, seasons, availability, notes
- [x] Wardrobe grid, search, category filters
- [x] Item detail dialog
- [x] Change availability, delete item
- [x] Responsive mobile-first layout
- [x] Typecheck and production build pass

**Acceptance:** add 5 pieces, refresh the page, and all 5 pieces and photos are still present.

## M1 — A catalog worth keeping

- [x] Manual crop before save
- [x] Edit an existing item
- [ ] Background removal / cutout pipeline
- [x] Export wardrobe to a zip or JSON backup
- [x] Import a backup
- [x] Empty/loading/error states for storage quota
- [x] Unit tests for color extraction and image validation
- [x] First GitHub Actions CI run

**Acceptance:** add a piece, crop it, remove its background, edit its name, export the wardrobe, clear site data, import the backup, and everything returns.

**Decision needed:** local Python `rembg` helper vs in-browser segmentation. Start with the helper if it unblocks M1 faster; move in-browser only when the phone-only flow matters.

## M2 — Outfits

- [ ] Outfit builder from wardrobe items
- [ ] Save, rename, delete outfits
- [ ] Occasion and season fields
- [ ] Outfit detail view
- [ ] “Wore this today” action
- [ ] Wear history list
- [ ] Prevent duplicate items in one outfit

**Acceptance:** build three outfits from real clothes, save them, log one as worn, and see it in history.

## M3 — Daily suggestion

- [ ] Weather module (Open-Meteo, geolocation permission)
- [ ] Weather cache and manual location fallback
- [ ] Occasion picker
- [ ] Rule-based candidate generation
- [ ] Scoring: color harmony, formality, warmth, recency, availability
- [ ] Top 3 suggestions with a short “why”
- [ ] Feedback: wore / skipped / loved
- [ ] Tests for scoring and hard filters

**Acceptance:** on a rainy 12°C day, the app does not suggest sandals and a linen shirt; on a 30°C day, it does not suggest a heavy coat. Every suggestion only uses clean items.

## M4 — Personal and portable

- [ ] PWA manifest and service worker
- [ ] GitHub Pages deployment workflow
- [ ] Export/import polish
- [ ] Color palette and undertone preferences (editable, clearly heuristic)
- [ ] Cost-per-wear and wardrobe gap insights
- [ ] Accessibility pass (keyboard, focus, labels, contrast)
- [ ] Demo GIF and refreshed screenshots

**Acceptance:** install the app on a phone home screen, open it offline, and add a piece.

## Later, only if the core is solid

- Optional multi-device sync (Supabase free tier or similar)
- On-device learned ranking
- Shareable look books
- Shopping gap analysis
- Native wrapper if the PWA cannot access a needed camera feature
