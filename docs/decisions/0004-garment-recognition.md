# ADR 0004 — Local-first garment recognition, with optional server-side vision

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

M5 asks the add form to read a clothing photo and pre-fill category, type,
colors, pattern, material, fit, sleeve, formality, warmth, seasons, and
occasions. The user must review and confirm every value; recognition must never
save on its own, invent an attribute it cannot see, or block the manual flow.

Two project constraints collide with the obvious implementation:

- **Free only.** No paid API, no credit card, and no key in the client. The
  default build has to work for anyone who clones the repo.
- **Local-first.** The app is a static PWA with no backend. Photos currently
  never leave the browser, and the README promises that.

A cloud vision model would recognize far more than pixels alone, but it needs a
key that a static site cannot hide, costs money at scale, and sends a personal
photo to a third party.

## Decision

Use a provider abstraction with two implementations.

1. **Heuristic (default, shipped).** It reuses the existing `extractPalette`
   pipeline and fills only `colors`. Every other attribute stays `null`/empty
   rather than being guessed. It runs locally, offline, with no key and no
   network request.
2. **OpenAI-compatible (opt-in, reference).** `VITE_RECOGNITION_PROVIDER=ai`
   makes the client call `/api/recognize`. `server/recognize.ts` is a deployable
   serverless template that holds `RECOGNITION_API_KEY` server-side and forwards
   the image plus a strict JSON prompt. It is not part of the Vite build and is
   not required for the app to work.

Both providers return the same validated shape. `parseRecognitionResponse` is
the trust boundary: unknown categories, materials, patterns, colors, levels,
and confidence values are dropped or clamped. Nested `{ attributes, confidence }`
and flat provider payloads are both accepted. A payload with no usable signal
is a failure, which triggers the fallback.

The client wraps every run in a 20-second timeout, retries only network and
transient 5xx failures once, and then falls back to the heuristic with a readable
warning. Authentication failures, other 4xx responses, rate limits, timeouts,
and caller cancellations are not retried. The hook aborts an in-flight request
when a new photo is selected or the form unmounts. `recognizeGarment` never
throws into the form.

A remote request is downscaled to 1024 px WebP with explicit EXIF orientation,
flattened onto white, and capped by decoded pixels and final bytes. If
preparation fails, the original is not uploaded; the app falls back to the local
heuristic instead.

Recognition is a draft, not a write:

- Values land in normal editable fields.
- Model confidence is presented as a 0–1 estimate, not a calibrated probability;
  low-confidence fields (≤ 0.6) are marked “low confidence”.
- Each applied prediction can be rejected individually, and the review panel is
  built from the patch that actually reached the form.
- A touched-field guard stops a retry or cutout re-run from overwriting a manual
  correction. In edit mode every saved field is protected, and recognition only
  runs from an explicit “Analyze photo” action.
- Colors are never written by recognition: the locally measured palette stays
  authoritative.
- Clearing an optional field writes `undefined` so Dexie removes the stored
  value; a category change cannot leave an incompatible type behind.
- Nothing is stored until the user presses Save.
- The optional fields are added to the existing backup format without a version
  bump, because they are non-indexed and older v2 files remain valid.

The shipped default remains free, keyless, and local; the cloud path is
documented as a self-hosted option, not a product requirement. The reference
function is not a production-hardened public proxy: it has a request-body cap,
magic-byte image validation, a 15-second upstream timeout, safe error codes, an
optional CORS allowlist, and a best-effort single-instance rate limiter, but no
authentication or distributed rate limiting. A deployer must add platform abuse
protection and a provider spending cap before exposing a paid key.

## Consequences

**Positive**

- The zero-dollar, offline add flow still works and never depends on a key.
- A provider can be swapped without touching the form.
- AI output is validated before it reaches the database, so a hallucinated
  material cannot become saved data.
- Recognition is always recoverable: reject, edit, retry, or ignore it.

**Negative**

- The default only recognizes colors. Type, pattern, material, fit, sleeve,
  formality, warmth, seasons, and occasions are only filled by the opt-in AI
  path; users type them otherwise.
- The AI path requires a backend the project does not ship, and its cost,
  abuse protection, and privacy terms are the deployer's responsibility. The
  reference function is deliberately not a production-ready public proxy.
- Model confidence is self-reported and uncalibrated. No accuracy evaluation
  dataset ships with the app, so the values are suggestions, not verified facts.
- AI color guesses are ignored; the locally measured palette remains the only
  source of item colors.
- The taxonomy is a closed vocabulary. A real but unlisted value (for example
  "corduroy") becomes `null` instead of a new option.
- A remote run sends the image and the model's answer through a third party;
  the privacy copy changes to say so when that provider is active.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Cloud AI only | Violates the free-only, no-client-key rules and breaks the offline flow |
| Bundled on-device vision model | Huge download and slow on phones; no free model covers this taxonomy well |
| Browser built-in AI APIs | Not available across browsers and not reliable enough to ship |
| No recognition beyond colors | Leaves the requested attributes manual and does not meet the feature brief |
| Persist predictions automatically | Violates the review-and-confirm requirement and risks bad catalogue data |
