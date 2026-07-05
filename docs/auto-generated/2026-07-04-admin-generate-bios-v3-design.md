# Admin Generate Bios v3 — Design

- **Date:** 2026-07-04
- **Status:** Approved (design); pending spec review → implementation plan
- **Branch/worktree:** `worktree-admin-generate-bios-v3` (off `main`)
- **Supersedes/extends:** `docs/auto-generated/2026-07-03-bio-media-discovery-v2-design.md`

## Context

Artist bio authoring lives inside the shared artist create/edit form at
`/admin/artists/[artistId]` — there is **no** standalone "generate bios" page.
The Biography section (`src/app/components/forms/sections/artist-bio-section.tsx`)
hosts: the AI generation trigger, two discovered-media palettes (images + links)
in a sticky rail, and three TipTap v3 editors (`bio`, `shortBio`, `altBio`).

This iteration makes manual images first-class, unifies the image model,
strengthens automated image discovery, and adds a safe link-preview affordance.

### Grounded current-state facts (from subsystem map)

- **Discovery** runs in a standalone AWS Lambda (`fakefour-bio-generator`,
  `/bio-generator`), invoked **synchronously** by the web app with a **16-minute**
  client timeout, while the client **also** polls `/api/artists/[id]/bio-generation`
  every 2.5s. Image tiers: Wikidata P18, Commons P373, Cover Art Archive, and
  web images **scraped via Jina AI** (`s.jina.ai` / `r.jina.ai`). The Lambda runs
  **no headless browser** (Jina renders remotely) and does **no crawling**
  (depth-1). Prose via Gemini `gemini-2.5-flash` (free-tier oriented).
- **No blur/quality filter** exists. Dedupe is **exact-byte SHA-256** (app-side,
  `BioImageService.rehostImages`) + case-insensitive URL (Lambda) — re-encoded
  copies slip through. **No minimum image count**; discovery is best-effort and
  can return 0.
- **Attribution is already threaded** into the RTE: the `bioFigure` node carries
  an `attribution` attr, the RTE image dialog has an attribution field, and drag
  payloads carry attribution. The sanitizer (`src/lib/utils/sanitize-bio-html.ts`)
  **already allows** `figcaption` + `span.bio-figure-attribution`. What is missing
  is **editing** attribution after insertion.
- **`artist.images`** (the `Image[]` relation managed by
  `artist-images-section.tsx`) is **not** rendered on any public surface. Public
  artist card (`artist-list-card.tsx`) and detail (`artist-detail-content.tsx`)
  render **`artist.bioImages`** (`isPrimary`). `artist.images` today only (a) seeds
  the RTE insert-image picker (`computeBioEditorImages`) and (b) is a low-priority
  fallback in `get-featured-artist-cover-art.ts`.
- **Security posture is strict**: CSP `frame-src` allows only `'self'` +
  Turnstile + Stripe, `frame-ancestors 'none'`, `X-Frame-Options: DENY`; `img-src`
  is allowlisted to own CDN/S3; a hardened SSRF proxy exists
  (`/api/proxy-image`, own-domain allowlist, DNS pinning). **Zero** iframe usage.
  Admin upload pipeline exists: presigned S3 PUT (15-min, 50MB, `requireRole`),
  `sharp` variant generation, cropper, drag-and-drop uploader.

## Goals

1. Manual image upload with required attribution, landing in the discovered-images
   sidebar and usable in the editor.
2. A single, coherent bio-image model (`bioImages`) that is also what the public
   site renders.
3. Stronger automated image discovery, quality-gated (deduped, in-focus).
4. Editable attribution, both in the library and on inserted figures.
5. A reliable link preview that works on the sites admins actually cite.
6. Full desktop **and** mobile support.

## Non-goals

- No live `<iframe>` preview of arbitrary sites (blocked by remote
  `X-Frame-Options`/`frame-ancestors` and our own CSP; blank for most targets).
- No recursive/arbitrary web crawling.
- No hard "≥30 images" floor (padding with junk defeats curation).
- No new client-facing image host in CSP (everything re-hosted to CDN).

## Challenged assumptions → decisions

| Original ask                      | Decision                                                                                                                                           | Why                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ≥30 images before stopping        | **Quality-gated target**, not a floor: dedupe + blur/low-res filter, surface up to ~30 that pass, stop when good candidates run dry, admin tops up | No quality gate exists today; forcing 30 pads with near-dupes/junk and risks the 900s Lambda / 16-min wait for obscure artists         |
| Live iframe link preview          | **OG/metadata unfurl card**                                                                                                                        | Most cited sites refuse framing; iframe renders blank and forces a CSP weakening                                                       |
| Wait-for-load + crawl links/pages | **Bounded expansion**: targeted queries + follow a fixed set of known links 1 level deep                                                           | Lambda has no browser (Jina renders remotely); recursive crawl multiplies a paid single-provider dependency inside a fixed time budget |
| Remove section; uploads → sidebar | **Unify on `bioImages` + migrate** existing `artist.images` in                                                                                     | `artist.images` isn't public; `bioImages` already is. Unifying removes a dual-model drift source                                       |

## Architecture & delivery (sequenced PRs)

Everything rests on one foundation: **the discovered-images sidebar becomes the
single, persistent bio-image library** (discovered _and_ uploaded). PRs are
ordered to avoid any regression window.

### PR 1a — Persistent bio-image library (additive; no removals)

Purely additive; ships safely with zero behavior change to existing uploads.

- **Sidebar as library:** `BioMediaPalettes` / `BioImagePalette` render the
  artist's persisted `bioImages` **independent of generation status** (today they
  return `null` until a job succeeds). Seed `bioImages` server-side on the edit
  page; keep the existing generation polling query as one writer of that cache.
- **Backend actions** the upload dialog (1b) will consume, all `requireRole(admin)`:
  - `createArtistBioImageAction` — persist an `ArtistBioImage` (attribution
    required), reusing presigned upload + `generateImageVariantsAction`.
  - `updateArtistBioImageAttributionAction` — edit `attribution`, re-run
    `sanitizeBioText`.
  - (Delete already exists: `deleteArtistBioImageAction`.)
- **Query/hook:** a query hook exposing the persisted `bioImages` for the artist
  (stable key under `queryKeys.artists.*`), forwarding `AbortSignal`.
- No UI removal, no picker repoint, no migration in 1a.

**Acceptance:** sidebar shows persisted bioImages even before any generation run;
new admin actions covered by unit tests; existing flows unchanged.

### PR 1b — Upload dialog + editable attribution + cutover

Does the cutover atomically so manual-upload capability is never absent.

- **RTE image button → upload dialog** (replaces the pick-only dialog in
  `rich-text-editor.tsx`). Two modes:
  - _Upload from computer_ — drag **or** tap-to-pick (native file input;
    mobile-safe) + **required attribution** field. Reuses
    `uploadAndRegisterImages` → `getPresignedUploadUrlsAction(artists,…)` →
    `uploadFilesToS3` → `createArtistBioImageAction` → `generateImageVariantsAction`.
    Uploaded image appears in the sidebar immediately.
  - _Pick from library_ — the existing bioImages grid.
- **Editable attribution:**
  - **Sidebar tile:** inline edit → `updateArtistBioImageAttributionAction`
    (fixes the library value for future inserts).
  - **Inserted figure:** add an edit control to `BioFigureNodeView`
    (`bio-figure-node-view.tsx`) editing the `bioFigure` `attribution` attr.
    Survives save (sanitizer already allows `span.bio-figure-attribution`).
  - **Source-of-truth rule:** the `ArtistBioImage` row is the library truth; an
    inserted `bioFigure` is an independent copy. Editing one does not mutate the
    other — no sync machinery.
- **Cutover:**
  - Repoint the RTE insert-image picker source (`computeBioEditorImages`) from
    `artist.images` → `bioImages`.
  - Repoint `get-featured-artist-cover-art.ts` fallback from `artist.images[0]` →
    a primary `bioImage`.
  - **Migration** (`scripts/`, dry-run default): copy `artist.images` →
    `ArtistBioImage` (attribution from `caption`/`altText`, else `"Uploaded"`),
    dedup by URL against existing `bioImages`.
  - **Remove** `ArtistImagesSection` from `ArtistForm` and drop now-dead wiring in
    `use-image-operations.ts`.

**Acceptance:** admin can upload an attributed image from the RTE that lands in
the sidebar and inserts as a captioned figure; attribution editable in both
places; migration idempotent + dry-runnable; old section gone; featured fallback
and picker sourced from bioImages.

### PR 2 — Discovery quality gate + bounded expansion

- **Quality gate in the web-app re-host pass** (`BioImageService.rehostImages`),
  **not the Lambda** — it already downloads bytes and runs `sharp`, so the checks
  piggyback with zero Lambda bundling changes:
  - **Blur/low-res rejection:** Laplacian-variance sharpness score (via `sharp`)
    - a minimum-dimension floor. Thresholds constant + tunable.
  - **Perceptual dedupe:** aHash/dHash from the decoded buffer, reusing the
    existing `seenHashes` / `duplicateAliases` seam; catches resized/re-encoded
    copies exact SHA-256 misses.
  - Pure functions over image buffers → straightforward unit tests with fixtures.
- **Target, not floor:** aim for up to ~30 that pass; render the count; stop when
  candidates run dry; no padding.
- **Bounded expansion in the Lambda** (`bio-generator/src/handler.ts` +
  `jina.ts`): add targeted Jina queries (`press photo`, `live`, `interview`,
  label/Bandcamp/Discogs) and follow a **fixed set** of already-discovered
  high-value links (official site, Wikipedia, Bandcamp, Discogs) **one level
  deep** for images. No recursive crawl. Respect existing caps/backoff.
- **Async decoupling (conditional):** if the heavier run risks the 16-min
  synchronous invoke, switch `BioGenerationService` to fire the Lambda
  asynchronously and rely solely on the existing 2.5s status polling, removing the
  synchronous-timeout failure mode. Decide during implementation with measured
  timing.

**Acceptance:** duplicate/blurry images are filtered before reaching the palette;
palette count reflects passing images; discovery yields more _good_ images on
representative artists without exceeding the time budget.

### PR 3 — Link OG-unfurl preview

- **New endpoint** (admin-gated `withAdmin`, `withRateLimit`, SSRF-hardened via
  `isPubliclyRoutableUrl` + the DNS-pinned undici dispatcher pattern from
  `proxy-image`): fetch the link HTML server-side, extract OG/Twitter/meta
  (`title`, `description`, `site_name`, hero image, favicon), **re-host the hero
  image to the CDN** (CSP-clean), cache by URL.
- **UI:** `BioLinkPalette` row gains an **eye icon** → shadcn `Popover`/`HoverCard`
  unfurl card (hover on desktop, **tap on mobile**). Falls back to bare URL/host
  when no OG tags.

**Acceptance:** hovering/tapping a discovered link shows a title/description/image
card for OG-tagged sites; graceful fallback otherwise; endpoint rejects
private/reserved hosts and rate-limits.

## Data model

- Reuse **`ArtistBioImage`** (`prisma/schema.prisma` ~409): `url`, `thumbnailUrl`,
  `title`, `attribution`, `license`, `sourceUrl`, `originalUrl`, `width`,
  `height`, `isPrimary`, `kind`, `alt`, `sortOrder`. Manual uploads set
  `kind = 'upload'` (or equivalent) and a required `attribution`.
- No schema change strictly required for uploads (fields already exist). If a
  perceptual-hash cache column is wanted for cross-run dedupe, add a nullable
  `perceptualHash String?`; otherwise compute in-pass.
- Migration is data-only (`artist.images` rows → `ArtistBioImage`); `Image[]`
  relation is left intact for other entities (releases/tours still use `Image`).

## Security considerations

- No CSP `frame-src` change. No iframe. Every external image (uploads, OG heroes)
  re-hosted to the CDN to satisfy `img-src`.
- New external-fetch endpoints (OG preview; any 1-level image fetch triggered
  server-side) route through `isPubliclyRoutableUrl` / `isDisallowedAddress` +
  DNS pinning, `withAdmin`, and `withRateLimit` (bandwidth-amplification guard).
- Uploaded/edited attribution runs through `sanitizeBioText`; bio HTML continues
  through `sanitizeBioHtml` (http/https only, allowlisted tags/classes) on save.

## Mobile & responsive

- HTML5 drag is desktop-only; all drag paths retain the existing **Plus
  click-to-insert** (via `BioEditorRegistry`) and **tap** fallbacks.
- Upload dialog uses a native file input (tap-to-choose) alongside drag.
- Link preview opens on **tap** on touch devices.
- Sidebar rail responsive behavior is unchanged (`md:grid-cols-2 xl:grid-cols-1`,
  sticky at `xl`).

## Testing (TDD, per AGENTS.md)

- Test-first for every new unit: server actions (mock service boundary),
  quality-gate functions (pure, buffer fixtures — sharp/perceptual hash),
  OG parser, NodeView attribution edit, migration script (dry-run assertions).
- Keep affected specs green; extend E2E for the upload → sidebar → insert flow and
  the link-preview affordance where practical.
- Gate before each commit: `pnpm run typecheck && pnpm run test:run &&
pnpm run lint && pnpm run format`. Do not regress the `COVERAGE_METRICS.md`
  baseline.

## Risks & open items

- **Lambda time budget:** heavier discovery + 1-level fetches must stay within
  900s; async decoupling is the mitigation if needed (PR 2).
- **Jina dependency:** single paid provider for scraping/images; expansion
  increases calls. Keep within existing caps; monitor.
- **Blur thresholds:** need tuning against real artist imagery to avoid rejecting
  legitimate grainy/vintage photos — expose thresholds as constants.
- **Migration on production data:** dry-run first; confirm dedup against existing
  `bioImages` before writing.

## Build order

1. **PR 1a** — persistent bio-image library (additive).
2. **PR 1b** — upload dialog + editable attribution + migration + section removal.
3. **PR 2** — discovery quality gate + bounded expansion.
4. **PR 3** — link OG-unfurl preview.
