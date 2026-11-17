# ADR 0002 — Local k-means color extraction

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Every item needs a small set of colors for the wardrobe cards, search, and future outfit matching. Asking the user to type color names is slow and inconsistent. A paid vision API is against the project constraints. A large fashion-attribute model is overkill for M0.

## Decision

Extract colors locally in the browser:

1. Downscale the photo to 160 px on the longest edge.
2. Sample opaque pixels.
3. Convert sRGB to CIELAB with `culori`.
4. Run k-means (`maxColors + 2` clusters, 10 iterations) using Euclidean Lab distance.
5. Sort by cluster size, merge near-duplicates, and keep up to four colors.
6. Convert centroids to hex.
7. Map each hex to the nearest named color with CIEDE2000.

The user can remove detected colors and add a color manually.

## Consequences

**Positive**

- No API key, no network, no per-image cost.
- Fast enough to run while the user fills in the form.
- Perceptually better clustering than RGB distance.
- Explainable and easy to tune.

**Negative**

- The background can dominate a flat-lay photo.
- Patterns are reduced to a few dominant colors.
- Very dark or very light photos can cluster poorly.
- It is not a garment detector; it does not know “shirt” from “wall.”

## Mitigation

- Show the detected palette as editable chips, not as truth.
- Recommend plain, contrasting backgrounds in the capture UI.
- Add background removal/cropping in M1 so the palette sees more garment.
- Keep the function pure and testable; revisit with a segmentation-aware palette later.

## Alternatives considered

| Option | Why not now |
| --- | --- |
| remove.bg / Photoroom API | Paid, limited free tier, sends photos to a server |
| CLIP / fashion attribute model | Larger, slower, harder to explain, unnecessary for four colors |
| Manual color picker only | Too much friction for the core add flow |
| RGB histogram | Faster but perceptually worse; Lab clustering is worth the small cost |
