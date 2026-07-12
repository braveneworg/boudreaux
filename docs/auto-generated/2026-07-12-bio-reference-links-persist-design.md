# Persist bio reference links into the draggable link palette

- **Date:** 2026-07-12
- **Status:** Approved — ready for implementation plan
- **Area:** Admin artist bio generator (`/admin/artists/[artistId]`)

## Problem

In the AI Bio Generation section, the admin can add **Reference links** — URLs
that seed the generator Lambda. Today those links live only in local
`useState` (`artist-bio-generation-section.tsx`): they are passed to the
generation trigger and then lost. They never persist and never appear in the
draggable **Discovered links** palette (`bio-link-palette.tsx`), so the admin
cannot drag a reference link into the rich-text editor, and the links vanish on
reload.

## Goal

When the admin clicks **Add** on a reference link, persist it immediately as an
`ArtistBioLink` row (`origin: 'custom'`) so it:

1. Appears in the **Discovered links** palette and is draggable into the RTE.
2. Survives page reload.
3. Still seeds the next generation, exactly as it does today.

Non-goal: changing the generator, the RTE drop mechanics, or the bio save
action. Reference links reuse the existing custom-link persistence path.

## Key facts verified in the codebase

- The persist path already exists end-to-end:
  `useCreateBioLinkMutation` (`use-bio-media-mutations.ts`) →
  `createArtistBioLinkAction` → `ArtistService.createBioLink` →
  `ArtistRepository.createBioLink` (stamps `origin: 'custom'`).
- The palette renders from **live persisted rows**, not only post-generation
  state. `BioGenerationService.buildBioContent` (`bio-generation-service.ts`)
  returns `content` whenever `status === 'succeeded'` **or** any persisted
  `bioImages`/`bioLinks` exist (`hasPersistedMedia`), with
  `content.links = state.bioLinks`. So the first persisted reference link makes
  `BioMediaPalettes` render even for an artist that never generated a bio.
- `useCreateBioLinkMutation` already invalidates
  `queryKeys.artists.bioGeneration(artistId)` on success, so the palette
  (`BioMediaPalettes`, whose status query is enabled by default) refreshes
  automatically.
- `createBioLinkInputSchema` requires `label` (`min(1)`). Reference links are
  URL-only, so we must synthesize a label.

## Design

### 1. Label derivation util

New `src/lib/utils/derive-bio-link-label.ts`:

```ts
/** Human-ish label for a URL-only reference link: the hostname minus a
 *  leading `www.` (e.g. https://en.wikipedia.org/wiki/X → "en.wikipedia.org").
 *  Falls back to the raw URL if it cannot be parsed. */
export const deriveBioLinkLabel = (url: string): string => { ... }
```

The caller only ever passes a URL that already passed `isHttpUrl`, so parsing
succeeds in practice; the fallback is defensive. Admins who want a curated
label or `kind` continue to use the existing **Add link** editor
(`custom-link-editor.tsx`) — that is the clean division of labour that lets both
inputs coexist:

- **Reference links input** — fast, URL-only, auto-labelled, and seeds
  generation.
- **Add link editor** — full label + `kind` curation.

### 2. Server-side dedupe (covers both inputs)

Both inputs persist through `createArtistBioLinkAction`, so dedupe lives in the
service layer and benefits both.

- New pure query `ArtistRepository.findBioLinkByUrl(artistId, url)` →
  `ArtistBioLinkRecord | null` (`prisma.artistBioLink.findFirst`).
- `ArtistService.createBioLink` gains the rule: if a row with that URL already
  exists for the artist, return it instead of creating a duplicate
  (idempotent). Comparison is exact match on the sanitized URL the action
  already produces (`sanitizeUrl`). Adding a URL already in the palette becomes
  a no-op that succeeds.

Edge case (documented, not handled specially): if a reference URL matches an
existing **generated** link, dedupe returns that row and it stays
`origin: 'generated'` (still draggable; may be replaced on the next
regeneration). Acceptable for a first cut.

### 3. Wire the reference input to persist

In `ArtistBioGenerationSection`:

- Instantiate `useCreateBioLinkMutation(artistId)`.
- In `addLink()`, after the existing local-state update, fire
  `createBioLink({ artistId, label: deriveBioLinkLabel(candidate), url: candidate })`.
- Local badge state and the generation-seed payload (`links`) are unchanged.

Deliberate boundary: removing a reference **badge** removes it from _this
session's generation seed only_; it does **not** delete the persisted palette
row (that is the palette's own X / `deleteArtistBioLinkAction`). On reload the
seed badges are empty but the links live in the palette. Persist failures
surface via the mutation hook's existing error toast; the local badge remains
usable as a seed.

## Data flow (after change)

```
Admin types URL → clicks Add
  ├─ local: append to `links` (seed badge shows)           [unchanged]
  └─ createBioLink({ artistId, label, url })
       → createArtistBioLinkAction (sanitize, requireRole admin)
       → ArtistService.createBioLink
            → findBioLinkByUrl → exists? return it (no-op)
                               → else ArtistRepository.createBioLink (origin 'custom')
       → mutation onSuccess invalidates bioGeneration(artistId)
       → BioMediaPalettes status query refetches
       → content.links includes the new row → palette tile appears (draggable)
```

## Files touched

- `src/lib/utils/derive-bio-link-label.ts` (new) + spec
- `src/lib/repositories/artist-repository.ts` — add `findBioLinkByUrl` (+ spec)
- `src/lib/services/artist-service.ts` — dedupe in `createBioLink` (+ spec)
- `src/app/components/forms/artist-bio-generation-section.tsx` — fire create on Add
- `src/app/components/forms/artist-bio-generation-section.spec.tsx` — new assertions + mock the create hook

No schema change (the `ArtistBioLink` model, actions, RTE drop, and save action
already support everything).

## Testing (TDD — one behaviour per test)

1. **`derive-bio-link-label` util** — strips protocol/path to hostname; strips
   leading `www.`; returns raw URL on unparseable input.
2. **`ArtistRepository.findBioLinkByUrl`** — returns the matching row; returns
   `null` when none (mocked Prisma).
3. **`ArtistService.createBioLink` dedupe** — returns the existing row without
   creating when a URL match exists; creates when it does not.
4. **`ArtistBioGenerationSection`** — clicking **Add** fires the create mutation
   with `{ artistId, label: <derived>, url }`; existing seed/badge/dup/remove
   tests still pass (mock `useCreateBioLinkMutation`).

Coverage must not regress the `COVERAGE_METRICS.md` baseline. Full gate before
commit: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.

## Out of scope

- Editing an existing palette link's label/kind.
- URL normalization beyond exact sanitized-string match for dedupe.
- Repopulating the reference-seed badges from persisted custom links on reload.
