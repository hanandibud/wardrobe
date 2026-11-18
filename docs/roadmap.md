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
- [x] Background removal / cutout pipeline
- [x] Export wardrobe to a zip or JSON backup
- [x] Import a backup
- [x] Empty/loading/error states for storage quota
- [x] Unit tests for color extraction and image validation
- [x] First GitHub Actions CI run

**Acceptance:** add a piece, crop it, remove its background, edit its name, export the wardrobe, clear site data, import the backup, and everything returns.

**Decision (2026-11-17):** in-browser segmentation with `@imgly/background-removal`. It keeps the phone-only, no-install flow and needs no key or paid tier; the trade-off is an AGPL-3.0 dependency, so the repo license moved from MIT to AGPL-3.0. The first cutout downloads a ~40 MB model (`isnet_quint8`) from a free CDN.

## M2 — Outfits (done)

- [x] Outfit builder from wardrobe items
- [x] Save, rename, delete outfits
- [x] Occasion and season fields
- [x] Outfit detail view
- [x] “Wore this today” action
- [x] Wear history list
- [x] Prevent duplicate items in one outfit

**Acceptance:** build three outfits from real clothes, save them, log one as worn, and see it in history.

**Delivered (2026-11-18):** three reviewable slices — build and save with a list, then a detail with rename and delete, then wear logging and history.

## M3 — Daily suggestion (done)

- [x] Weather module (Open-Meteo, geolocation permission)
- [x] Weather cache and manual location fallback
- [x] Occasion picker
- [x] Rule-based candidate generation
- [x] Scoring: color harmony, formality, warmth, recency, availability
- [x] Top 3 suggestions with a short “why”
- [x] Feedback: wore / skipped / loved
- [x] Tests for scoring and hard filters

**Acceptance:** on a rainy 12°C day, the app does not suggest sandals and a linen shirt; on a 30°C day, it does not suggest a heavy coat. Every suggestion only uses clean items.

**Plan (2026-11-18):** three slices — weather and its cache, then the rules-based suggestion with an occasion picker, then feedback and polish. Slice one shipped the Today page, the weather card, and the location fallback. Slice two shipped the recommendation engine, the occasion picker, “Wear this”, and per-day skips.

**Delivered (2026-11-18):** slice three added loved feedback to the wear log. Loving a logged wear marks its saved look, and pieces from a loved look get a small bonus in later picks with the reason “Includes a piece you loved”. Skips stay a per-day convenience and do not train the ranking.

## M4 — Personal and portable

- [x] PWA manifest and service worker
- [x] GitHub Pages deployment workflow
- [x] Export/import polish
- [x] Color palette and undertone preferences (editable, clearly heuristic)
- [ ] Cost-per-wear and wardrobe gap insights
- [ ] Accessibility pass (keyboard, focus, labels, contrast)
- [ ] Demo GIF and refreshed screenshots

**Acceptance:** install the app on a phone home screen, open it offline, and add a piece.

**Delivered (2026-11-18):** slice one added the installable shell. `public/manifest.webmanifest` and 192/512/maskable icons give the app an identity; a hand-written `public/sw.js` precaches the shell plus the hashed entry JS/CSS read from the built HTML, serves navigation network-first with a cached fallback, and serves same-origin assets cache-first. The app registers the worker after load in production only. The Pages deployment workflow had already been shipping every push since M1, so its checkbox was stale; no new deployment code was needed.

**Delivered (2026-11-18):** slice two made backups whole-catalogue. Format v2 carries pieces, saved looks, and wear events, including loved feedback. Import rebuilds the relationships through id maps, so a look keeps its pieces and a wear keeps its look even though the database assigns fresh ids. Version 1 files still import their pieces. Duplicate detection covers all three tables, making re-imports idempotent, and the panel reports piece/look/wear counts.

**Delivered (2026-11-18):** slice three added an editable palette on the wardrobe page. It derives the colors that actually appear in the wardrobe, lets the user mark loved and avoided colors, and records a warm/cool/neutral undertone and a low/medium/high contrast preference. Choices live in `localStorage` under `wardrobe.preferences.v1`, are overridable at any time, and are deliberately excluded from backups. The engine treats them as small tie-breakers: loved colors lift a combo, avoided colors push it down, and a matching tone or contrast adds a little weight, each with an honest reason. Defaults and “Not sure” are no-ops. The panel says plainly that tone and contrast describe the clothes, not a verdict about the wearer.

## Later, only if the core is solid

- Optional multi-device sync (Supabase free tier or similar)
- On-device learned ranking
- Shareable look books
- Shopping gap analysis
- Native wrapper if the PWA cannot access a needed camera feature
