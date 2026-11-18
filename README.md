# Wardrobe

A local-first virtual wardrobe. Add a garment with one photo, let the app pull its main colors, and build a closet you can actually use. The long-term goal is a daily outfit suggestion based on the weather, the occasion, and what is clean.

> **Status: M2 in progress.** Add, edit, crop, cut out, and back up a local wardrobe, then build and save looks from it. Everything is stored in your browser — no account, no backend, no paid API.

**Live:** https://hanandibud.github.io/wardrobe/

![Wardrobe home](screenshots/home.png)

## What works today

- Add a piece from a photo (camera or library on mobile)
- Crop the photo before saving, or re-crop a saved one, with free, square, 4:5, and 3:4 frames
- Remove the background in the browser, leaving the piece on a transparent cutout
- Detect the main colors automatically in CIELAB space
- Record category, warmth, formality, seasons, availability, and notes
- Edit any detail of a saved piece, including replacing its photo
- Export the whole wardrobe, photos included, to one JSON file
- Import that file on another device or after clearing browser data
- Browse, search, and filter the wardrobe
- Build an outfit from pieces you own, with a name, occasion, and seasons
- Save looks and browse them newest first
- Open a saved look to see its pieces, rename it, or remove it
- Open a piece to see its details
- Mark a piece clean, needs wash, or in laundry
- Remove a piece
- Local persistence with IndexedDB — refresh and it is still there
- See local storage usage, request persistent storage, and get a clear warning when it runs low

![Add a piece](screenshots/add-item-filled.png)

![Crop a photo](screenshots/crop-dialog.png)

![Remove the background](screenshots/cutout-form.png)

![Edit a piece](screenshots/edit-item.png)

![Back up and restore](screenshots/backup-panel.png)

![Build an outfit](screenshots/outfits-builder.png)

![Saved outfits](screenshots/outfits-list.png)

![Outfit detail](screenshots/outfit-detail.png)

## Planned

- Weather-aware daily suggestions
- Wear history and feedback
- Installable PWA
- Skin-tone and color-preference tuning (as a preference, not a scientific claim)

See [docs/roadmap.md](docs/roadmap.md) for the order and acceptance criteria.

## Free by design

The MVP intentionally avoids services that can start charging:

| Need | Choice | Cost |
| --- | --- | --- |
| Hosting | GitHub Pages | Free for public repos |
| Database | IndexedDB (browser) | Free |
| Auth | None — single local user | Free |
| Weather | Open-Meteo | Free, no API key |
| Background removal | In-browser model (`@imgly/background-removal`) | Free; model fetched once from a public CDN |
| CI | GitHub Actions | Free tier |

No Vercel, Supabase, or paid AI API is required. If the app later needs multi-device sync, Supabase's free tier is a reasonable next step — but it is not part of the local-first MVP.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Dexie (IndexedDB)
- `culori` for color conversion and Delta E
- `@imgly/background-removal` on `onnxruntime-web` for the in-browser cutout
- Lucide icons
- Open-Meteo (planned)
- GitHub Pages (live)

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints. To use it on your phone, connect both devices to the same Wi-Fi and open the **Network** URL. Windows Firewall may ask for permission the first time.

Useful commands:

```bash
npm run dev        # local dev server
npm run build      # typecheck + production build
npm run typecheck  # TypeScript only
npm run lint       # Oxlint
npm test           # unit tests (Vitest)
npm run preview    # preview the production build
```

## Project structure

```text
src/
  App.tsx                 app shell, tabs, toast, item actions
  db.ts                   Dexie database and tables
  types.ts                domain types and option lists
  components/
    Header.tsx            brand + navigation
    WardrobeView.tsx      grid, search, filters, empty state
    ItemCard.tsx          wardrobe card
    ItemDetail.tsx        item dialog with edit mode
    ItemForm.tsx          shared add/edit form and photo pipeline
    ItemThumbnail.tsx     small decorated image shared by outfit views
    OutfitsView.tsx       saved looks grid, empty states, builder switch
    OutfitBuilder.tsx     name, occasion, seasons, piece picker
    OutfitDetail.tsx      outfit dialog with rename and delete
    CropDialog.tsx        crop frame with drag and resize handles
    BackupPanel.tsx       export/import controls and status
    StorageStatus.tsx     storage usage meter and persistence request
    AddItemView.tsx       add page shell
    ComingSoon.tsx        roadmap placeholders
  hooks/
    useObjectUrl.ts       object URL lifecycle for Blob images
  lib/
    backup.ts             JSON export/import with embedded photos
    colors.ts             k-means palette extraction + color names
    crop.ts               crop geometry and canvas cropping
    cutout.ts             in-browser background removal wrapper
    images.ts             image validation and WebP compression
    outfits.ts            selection toggling, category groups, item resolution
    storage.ts            storage estimate, persistence, quota detection
    *.test.ts             Vitest unit tests for the pure logic
docs/                     product, architecture, setup, roadmap, ADRs
screenshots/              documentation screenshots
```

## Privacy

- Photos and wardrobe data are stored in IndexedDB in your browser.
- Nothing is uploaded by the current app. Background removal runs locally too — only the model file is downloaded, and the photo never leaves the device.
- The future weather request will send only coordinates to Open-Meteo.
- IndexedDB is per browser and per device. Clearing site data deletes the wardrobe unless you keep a backup. Export/import is built in.
- Backup files contain your photos. Treat them like personal documents and do not commit or share them.

## Documentation

- [Product brief](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Roadmap](docs/roadmap.md)
- [Setup and GitHub](docs/setup.md)
- [Devlog](docs/devlog.md)
- [Decisions](docs/decisions/)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

The app is licensed under the AGPL because its background removal depends on
[`@imgly/background-removal`](https://github.com/imgly/background-removal-js), which is
AGPL-3.0. Everything else in the repo is original work. If you fork it, keep the license and
publish your source under the same terms.
