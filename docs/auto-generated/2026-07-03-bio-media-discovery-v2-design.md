# Bio Media Discovery v2 — Design

Date: 2026-07-03 · Branch: `feat/bio-media-discovery-v2` · Status: approved (pending spec review)

## Context

Iterates on the bio-generator work shipped in PRs #545–#549. Much of the
original request already exists on `main` (draggable link/image palettes with
X-dismiss and eye-preview, editor drag-drop at cursor, resizable/floatable
figures with captions, link/image insert dialogs, save-time CDN re-host,
DOB constraint, plagiarism detector). This design covers only what is new:
bigger and better-verified discovery, atom-node links in the editor, a palette
layout refresh, and prose formatting upgrades.

## Decisions (user-confirmed)

1. **Images are discovery-only.** No AI-generated imagery of real people —
   Gemini is used to _verify_ subjects, never to create them. (Jina cannot
   generate images at all.)
2. **Caps raised to 100, best effort** — pipeline gathers aggressively and
   ships whatever survives verification; no infinite loop chasing 100.
3. **Links-first emphasis** (keeps PR #545): if an entity can be a link it is
   a link; `<em>` for unlinked work titles; `<strong>` sparingly for unlinked
   pivotal names/dates; never stack strong+em+a.
4. **Editor links become inline atom nodes** — draggable as units with
   hover/select X-remove; anchor text edited via the existing link dialog;
   serialized HTML stays plain `<a>`.
5. **Architecture A + sticky rail**: evolve the existing lambda pipeline in
   place; palettes move to a sticky right rail on desktop.
6. **Link underline is global** — site-wide `a { text-decoration-line:
underline }`, with a carve-out for anchors rendered as buttons/nav tiles
   (`Button asChild`, zine menu tiles) which opt out via `no-underline`.

## 1. Lambda — link discovery (≤100)

- `MAX_LINKS` 50 → 100 (`bio-generator/src/handler.ts`).
- Jina search: `MAX_RESULTS` 5 → 10 per query; add a third query targeting
  press/interviews (`"{name} musician feature profile"` family).
- Expand MusicBrainz url-relation mapping (`musicbrainz.ts relationToLink`) to
  keep Discogs / SoundCloud / YouTube / Bandcamp relations currently dropped.
- New link kind `'press'` for interview/review pages (lambda `types.ts`,
  app `bio-generation-schema.ts`, palette badge). Prisma `kind` is a plain
  string — no schema migration.
- Descriptive labels: page title when available, else pattern like
  "{Display} on Bandcamp" — never bare hostnames. New label-derivation util
  in the lambda with unit tests.
- Existing junk-host filter, lowercased-URL dedupe, and listening-service
  streaming reclassifier unchanged.

## 2. Lambda — image discovery + verification (≤100 best effort)

Sources in trust order:

| Source                                                                            | New?     | Verification                    |
| --------------------------------------------------------------------------------- | -------- | ------------------------------- |
| Wikidata P18 portrait (Commons)                                                   | existing | skipped — subject guaranteed    |
| Commons category members (P373)                                                   | **new**  | skipped — subject guaranteed    |
| Cover Art Archive front covers for the artist's release-groups (**new `caa.ts`**) | **new**  | skipped — provenance guaranteed |
| Scraped page images (Jina search + official-site reader)                          | existing | **Gemini vision, fail-closed**  |

- Listening-service pages are **un-skipped** for image collection (they were
  excluded to avoid album art; album art is now wanted).
  `MAX_SCRAPED_IMAGES` 20 → 60; junk-alt/junk-URL filters stay.
- **`vision.ts` (new)**: scraped candidates fetched (≤1.5 MB each, pooled
  concurrency ~8, 8s timeout), batched ~10 per `generateContent` call with
  displayName, realName (incl. middle name), akaNames, and known release
  titles. Per-image JSON verdict: `artist_photo | album_cover | reject`,
  confidence, and a short **alt-text description**. Keep at confidence ≥ 0.5
  (named const). Vision unavailable (quota/outage) ⇒ scraped images dropped;
  provenance-guaranteed sources still ship.
- Wire shape: `BioImage` gains optional `kind?: 'photo' | 'cover'` and
  `alt?: string` (lambda `types.ts` + app `bio-generation-schema.ts` +
  `ArtistBioImage` prisma fields, all optional/backward-compatible).
- `MAX_IMAGES` 30 → 100 post-merge (Commons → CAA → verified scraped,
  URL-deduped; attribution-free ranked first within each tier).

## 3. Lambda — prose, fact-checking, formatting

- **Chronology grounding**: structured timeline (MusicBrainz release-group
  first-release dates + life-span + label releases from new input field
  `releases: [{title, releasedOn, url}]`) injected into draft/synthesis/critic
  prompts; dates must come from the table. DOB hard-constraint +
  pre-birth-year regex screen stay.
- **Claim grounding folded into `critiqueProse`**: the critic additionally
  flags claims unsupported by sources/facts/chronology; existing
  `reviseProse` repairs. No extra pass.
- Internal release URLs (`/releases/{id}`) join the prompt link allowlist so
  all three formats can inline-link label releases.
- Formatting prompts: shortBio in 2–3 short paragraphs; longBio must use
  `<ol>`/`<ul>` where content warrants (discography highlights, collaborator
  lists); emphasis per decision 3; every image placeholder carries
  meaningful alt.
- Plagiarism shingle detector + revise loop unchanged.

## 4. App services

- Mirror wire changes in `src/lib/validation/bio-generation-schema.ts`; keep
  lockstep comment with lambda `types.ts`. Update
  `bio-generation-fixture.ts` for deterministic E2E (more items, new fields).
- Pass `releases` (title/releasedOn/url from `ReleaseRepository`) in
  `BioGenerationInput`.
- **`appendInternalCoverImages` (new, `bio-generation-service.ts`)**: after
  generation, append the artist's published releases' existing CDN cover
  images as palette rows (`kind: 'cover'`, alt/attribution from release
  title; `thumbnailUrl` via `buildCdnImageVariantUrl(…, 384)`). Rights-clear,
  zero fetch; re-host planner already skips CDN srcs.
- **Pooled concurrency util (new, `src/lib/utils/pooled-map.ts`)** used by
  `BioImageService.rehostImages` thumbnail pipeline (~8 at a time, per-image
  size cap) — 100 unbounded parallel fetches is not acceptable.
- Save-time re-host flow (`artist-service.ts finalizeBioImages`) unchanged.

## 5. Editor

- **`BioLink` inline atom node (new `bio-link-extension.ts`)** replaces the
  StarterKit Link mark: `inline`, `atom: true`, `draggable: true`; attrs
  `{href, text}`; parses existing `<a href>` content; serializes to plain
  `<a href rel target>` (rel/target derived from `isInternalBioUrl`, matching
  the sanitizer's `transformAnchor`). NodeView: underlined anchor text,
  external-icon suffix for external hrefs, X-remove on hover/select,
  drag handle behavior via ProseMirror atom drag. Editing goes through the
  existing link dialog (anchor text + URL + external toggle). The
  `bio-editor-drop.ts` handler inserts `bioLink` nodes; the toolbar link flow
  inserts/updates nodes. No `class` attr in serialized HTML — **sanitizer
  allowlists are unchanged** (`a: [href, rel, target]` already covers it).
- **Underline (global)**: `globals.css` — `a { text-decoration-line:
underline }`; `buttonVariants` base gains `no-underline`; zine nav tiles /
  logo opt out where they visually break. Bio editor content + `BioHtml`
  render underlined links by default as a result.
- **Wrap**: floated figures get `[shape-outside:margin-box]` with tightened
  gutters (~0.75rem) in both `bio-html.tsx` float classes and the NodeView
  preview. Deliberately not zero-gap — text touching the image edge is
  unreadable.
- Caption/attribution stays fixed 11px at every figure width (pinned by
  test).

## 6. Palette UI (redesign)

- `ArtistBioSection` layout on `xl+`: editors left (~2/3), palettes stacked
  in a **sticky right rail** (`sticky`, header-offset top, own scroll) that
  stays visible while scrolling all three editors; below `xl` the current
  above-editors stack remains.
- Each palette: count in header, taller `ScrollArea`, small client-side
  **filter input** (needed at 100 items), kind badges (links: streaming /
  press / release / social / …; images: photo / cover), existing X-dismiss
  (destructive row delete; regeneration restores) and eye-preview kept.
- **Click-to-insert button on every tile** inserting at the focused editor's
  cursor (fallback: long-bio editor), via a new `BioEditorFocusContext`
  registering the active TipTap instance. This is the touch path (HTML5 drag
  does not exist on touch) and the keyboard path. Drag stays for mouse.

## 7. Security

- Sanitizer allowlists unchanged (deliberate).
- Vision fetches respect the same size caps/timeouts; lambda has no DB or S3
  access (unchanged). App-side re-host keeps the SSRF guard
  (`isPubliclyRoutableUrl`) and CDN-src skip.
- External links continue to be forced to
  `rel="nofollow noopener noreferrer" target="_blank"` by the sanitizer and
  `BioHtml`; internal links stripped of rel/target.

## 8. Testing

- TDD throughout. New unit specs: vision batching/threshold/fail-closed,
  `caa.ts`, label derivation, chronology builder, critic-prompt additions
  (prompt-content assertions), `pooled-map`, `appendInternalCoverImages`,
  `BioLink` parse/serialize round-trip + NodeView behavior, drop-handler
  payloads, palette filter/insert/badges, `BioHtml` underline/icon/wrap,
  button `no-underline`.
- bio-generator workspace runs its own vitest/tsc (repo-wide lint covers it).
- E2E: palette rail visibility, click-to-insert into editor, drag-drop
  (CDP-dispatched), save round-trip preserving `<a>`/figure HTML. Fixture
  (`BIO_GENERATOR_FAKE`) drives determinism.
- Coverage: hold the `COVERAGE_METRICS.md` baseline; all four gates
  (`typecheck`, `test:run`, `lint`, `format`) before every commit.

## 9. Rollout

- Wire changes are optional-fields-only → app and lambda deploy in either
  order. Lambda deploys via existing `deploy-bio-generator.yml` on merge.
- Single PR, phased atomic commits: (1) lambda discovery + vision,
  (2) lambda prose/fact-check, (3) app services/schema, (4) editor BioLink +
  styling, (5) palette rail UI, (6) e2e + docs.

## Out of scope (explicitly, with reasons)

- **AI-generated imagery** — fabricated likenesses of real artists on an
  official label site; rejected by user.
- **Hard 100 target with source pagination loops** — cost/latency without
  admin value; best-effort cap chosen.
- **Sanitizer allowlist expansion** — not needed by any shipped markup; not
  widening it is a security property.
- **Zero-gap text wrap** — unreadable; tightened gutters instead.
- **Non-rectangular `shape-outside`** (alpha-channel contours) — album art
  and photos are rectangles; complexity with no visible effect.
- **Palette virtualization** — 100 lazy-loaded thumbs is fine; revisit only
  if profiling says otherwise.
