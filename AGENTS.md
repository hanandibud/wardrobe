# AGENTS.md

## Read first

Before changing code, read:

1. `docs/PRD.md`
2. `docs/architecture.md`
3. `docs/data-model.md`
4. `docs/roadmap.md`

The roadmap is the scope contract. Do not start a later milestone while the current one is incomplete.

## Project

A local-first virtual wardrobe: React + TypeScript + Vite, Tailwind CSS, Dexie over IndexedDB, and no backend in the MVP.

Current state: **M0 complete** (add, colors, browse, details, availability, delete). Next: **M1** (edit, crop, cutout, export/import, tests).

## Commands

```bash
npm run dev        # Vite dev server (LAN enabled)
npm run build      # typecheck + production build
npm run typecheck  # TypeScript only
npm run lint       # Oxlint
npm test           # unit tests (Vitest)
npm run preview    # preview dist
```

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before committing.

## Free-only constraint

- No paid services, no paid APIs, no credit cards.
- No Vercel, Supabase, Firebase, or cloud storage in the MVP.
- No API keys in the client.
- Weather uses Open-Meteo (keyless). Background removal stays local.
- If a feature seems to require a paid service, propose a free/local alternative first.

## Rules

- **One vertical slice per change.** Keep diffs reviewable.
- **Ask before adding a dependency.** Prefer the platform and existing packages.
- **TypeScript strict.** Avoid `any`; if it is unavoidable, explain why in a comment.
- **Mobile first.** Test at 390 px width as well as desktop.
- **Accessibility:** label inputs, keep focus states, support Escape in dialogs.
- **Data migrations:** never edit an existing Dexie `version(n)` store definition. Add `version(n + 1)` and update `docs/data-model.md`.
- **Privacy:** never commit personal photos, wardrobe exports, `.env` files, or API keys.
- **Tests:** pure logic (colors, scoring, weather mapping) needs unit tests once Vitest is added. UI tests are optional.
- **Docs:** update the relevant file when behavior, data, or scope changes.
- **No destructive git commands** (`reset --hard`, `clean -fd`, force-push) without explicit approval.

## UI conventions

- Warm paper background (`bg-paper`), ink text, terracotta accent, forest secondary.
- `font-display` for headings, system sans for body.
- Rounded cards, subtle borders, generous whitespace.
- Keep the empty and loading states intentional; no bare "TODO" screens.
- Use Lucide icons at `strokeWidth={1.8}` or similar.

## Suggested workflow with a CLI agent

1. Pick one GitHub issue with clear acceptance criteria.
2. Ask the agent for a short plan before it edits files.
3. Implement the smallest working slice.
4. Run lint, typecheck, and build.
5. Update docs and screenshots if the UI changed.
6. Commit with `type(scope): summary`.
7. Push and let CI verify.

## Commit style

```text
feat(add): extract palette from uploaded photo
fix(db): keep item images after refresh
docs(setup): add GitHub auth steps
chore(ci): run lint and build on pull requests
```
