# ADR 0003 — In-browser cutout, and an AGPL-3.0 license

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

M1 asks for a background removal / cutout step. The palette is only as good as the pixels it sees, and a flat-lay photo is usually dominated by the floor or the sheet behind the garment (see ADR 0002).

Constraints from the project brief:

- Free only. No paid API, no credit card, no key in the client.
- Local-first. The phone-only capture flow has to work with no install and no helper process.
- A local Python `rembg` helper was considered, but it excludes the phone, which is the primary camera.

The one practical off-the-shelf browser package is `@imgly/background-removal`. It is AGPL-3.0, and this repo was MIT-licensed.

## Decision

Use `@imgly/background-removal` in the browser and move the repository license from MIT to AGPL-3.0.

- The package is imported lazily so it never reaches the main bundle.
- The smallest model (`isnet_quint8`, ~40 MB) is used and fetched on first cutout from the package's public CDN. No key, no account.
- The result is a PNG, so the transparent background survives.
- Color extraction skips pixels below alpha 180, so the palette becomes garment-only.
- `LICENSE` is the verbatim AGPL-3.0 text and `package.json` declares `AGPL-3.0-or-later`.

## Consequences

**Positive**

- Works in the phone-only flow with no install and no server.
- No cost and no key.
- The cutout improves color extraction as well as the card image.

**Negative**

- The repo is now copyleft. Anyone who forks and deploys it must publish their source under AGPL-3.0.
- The first cutout downloads ~40 MB; later runs use the cached model.
- CPU inference takes a few seconds and blocks the tab while it runs.
- Mask quality depends on the photo; busy backgrounds still cut out roughly.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Local Python `rembg` helper | Best quality, but it needs a computer and breaks the phone-only, no-install flow |
| `Xenova/modnet` (Apache-2.0) | Keeps MIT, but it is portrait matting and performs poorly on flat-lay garments |
| BiRefNet (MIT) | Fine license, but a much heavier ONNX model to download and run on a phone |
| remove.bg / Photoroom API | Paid, rate-limited, and uploads personal photos |
| Skip the cutout | Leaves the M1 goal unmet and keeps the palette dominated by the background |
