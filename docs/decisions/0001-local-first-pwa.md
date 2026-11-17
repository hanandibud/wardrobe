# ADR 0001 — Local-first static PWA

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

This is a solo, zero-budget project. The builder wants to start slowly, has not used Vercel or Supabase, and needs a wardrobe that works on a phone camera without paying for hosting, storage, or AI APIs.

The core job is personal: catalog clothes, browse them, and get outfit suggestions. Multi-user collaboration and social features are not requirements.

## Decision

Build a static, local-first React SPA:

- Vite + React + TypeScript
- Tailwind CSS for styling
- Dexie over IndexedDB for wardrobe data and image Blobs
- No backend, no authentication, no cloud storage in the MVP
- GitHub Pages for hosting (free for public repositories)
- Open-Meteo for weather later (free, no API key)
- Local `rembg` or browser-side segmentation for cutouts later

## Consequences

**Positive**

- Zero recurring cost.
- Photos never leave the device.
- No auth, API keys, CORS, or server deployment to debug.
- Fast reads and writes.
- A static build is easy to host and easy to reason about.

**Negative**

- Data is per browser and per device.
- Clearing site data deletes the wardrobe unless a backup exists.
- No sync between phone and laptop.
- Heavy image processing must run in the browser or in an optional local helper.
- Multi-user features would require a backend later.

## Alternatives considered

| Option | Why not now |
| --- | --- |
| Next.js + Supabase | Adds accounts, auth, schema migrations, storage policies, and a second free-tier service before the core loop is proven |
| Native iOS/Android | App store fees, platform-specific camera work, slower iteration |
| Local Python server | Good for experiments, bad for phone access and free hosting |
| Electron desktop | Solves the wrong problem; the user wants mobile capture |

## Revisit when

- The user needs the same wardrobe on two devices.
- A real multi-user or sharing feature appears.
- In-browser image processing cannot meet the quality or performance bar.
- A backend is required for a feature that cannot be done locally.
