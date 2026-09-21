# ADR-0009: Genres are human-owned and survive regeneration

- **Status**: Accepted
- **Date**: 2026-09-20

## Context

An artist's `genres` are produced almost entirely by the bio generation job.
The Lambda's vision and prose passes guess a comma-separated list, and
`runBioGeneration` preferred that guess over whatever the artist already had:

```ts
const genres = checked.genres?.trim() || input.existingGenres?.trim() || null;
```

`existingGenres` was therefore only ever a fallback for a model that returned
nothing. Any genre an admin curated by hand was silently replaced the next
time the artist was regenerated, with no record that it had been.

Two smaller problems compounded it. The model writes free prose —
`"indie rock"`, `"Indie Rock"`, `"hip hop"` — so the same genre arrived in a
different shape on each run and the column accumulated near-duplicates that
no query could group. And the only editor was a comma-separated text input at
the bottom of the artist admin form, far below the bio-generation panel that
produces the values, so an admin reviewing a freshly generated artist never
saw what the model had guessed.

This is the same shape as the problem [ADR-0008](0008-display-images-are-chosen-by-humans-and-survive-regeneration.md)
solved for images: a generation job overwriting a human's curation because
nothing marked the field as owned.

## Decision

**An artist's genres are human-owned. A bio generation job may suggest them
only into a field that is already blank, and every term is stored in one
normalised form.**

- Precedence flips in `runBioGeneration`: `input.existingGenres` wins, and
  `checked.genres` fills only a blank field. Once an artist has genres,
  regeneration never touches them.
- One storage form, `normalizeVocabularyTerm`: lowercase and dash-separated,
  with `&` and `+` spelled out as `and` before slugifying (so `"R&B"` stores
  as `r-and-b`, not the `rb` a bare `generateSlug` would produce). It applies
  to the write path and to any read-side grouping — if those two ever diverge,
  usage counts stop matching what is stored.
- The generation path normalises too, after sanitizing, so the blank-fill
  case cannot reintroduce a raw `"indie rock"` beside curated `indie-rock`.
- Display is a render-time concern, never a stored one: `formatVocabularyTerm`
  title-cases the stored term, with an override map for the few that read
  wrong title-cased (`lo-fi` → `Lo-Fi`, `r-and-b` → `R&B`).
- The `Artist.genres` column is the source of truth. The `Genre` collection
  (`prisma/schema.prisma:246`) has no reader anywhere in `src` and is not
  part of this decision.
- Tags follow the same rules. The schema already asked for dasherized tags in
  a comment; this makes it enforced rather than aspirational.

## Alternatives rejected

- **A `genresLockedOn` timestamp or an `origin` flag** — the same conflation
  ADR-0008 rejected for images. Presence already carries the signal: a
  non-empty field is a field someone owns.
- **Merging the model's genres into the existing ones** — silently grows a
  curated list on every regeneration, and nothing distinguishes a genre an
  admin removed on purpose from one they never saw.
- **Promoting the `Genre` collection to the source of truth** — a join table
  with no reader, no UI, and no migration path, to replace a column every
  query already reads.
- **Normalising only on read** — leaves the stored column inconsistent, so
  every consumer has to remember to normalise and the first one that forgets
  reintroduces the duplicates.

## Consequences

- Once an artist has genres, regeneration will never refresh them. Clearing
  the field and regenerating is the escape hatch, which is why clearing has
  to actually work — `toOptionalString` turned `''` into `undefined` and
  Prisma omitted it, so the column could not be emptied.
- Existing rows keep their un-normalised values until something rewrites
  them. A regeneration will not do it (the field is no longer blank), so the
  column holds a mix of `"indie rock"` and `indie-rock` until each artist is
  saved through the admin form. Display handles both, because
  `formatVocabularyTerm` normalises before rendering.
- The precedence flip ships in `bio-generator/`, which deploys on its own
  track. The Lambda must be redeployed for it to take effect; the app-side
  normalisation lands with the app.
- No schema change and no `prisma db push`.
