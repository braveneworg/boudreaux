# Bio Generator: Draggable Link/Image Palettes, Editor DnD, Lambda Quality — Design

Date: 2026-07-02
Status: Approved (brainstorming session, plan-mode gate)

## Context

The admin's artist bio generation (admin → artists/[artistId] → Biography) returns a read-only
list of discovered links and images. This design turns both into curated, draggable palettes
feeding the three TipTap bio editors (bio, shortBio, altBio), and adds substantial bio-generator
lambda quality work: full-name prompting, birth-date grounding, a fact-check pass, a plagiarism
check, richer formatting, and more links/images — now including streaming services and internal
release links.

Motivating bug: a generated bio claimed Ceschi's career began in 1949 — he was born in the '80s.
The lambda never receives `bornOn` from the database, so nothing anchors the timeline.

## Decisions (binding, confirmed with the product owner)

1. **Image discovery is scraping only.** The LLM never produces image URLs (preserves the
   phantom-`<img>` fix). Sources: Wikimedia Commons, Jina reader/search image summaries, extra
   search queries. The LLM may rank or caption candidates, nothing more.
2. **Listening-service blocklist: full reversal.** Bandcamp/Spotify/Apple Music links are allowed
   everywhere — removed from the lambda blocklist and from the app sanitizer strip. This is a
   deliberate reversal of a standing product rule.
3. **Emphasis regime: links first, richer emphasis.** "Prefer links over bold" stays primary; the
   emphasis budget rises for unlinkable facts (bold key dates/releases/collaborators) and work
   titles get `<em>`.
4. **50 links / 30 images are quality-gated caps, not targets.** Dedupe, junk-domain filter,
   plausible-photo filter; no padding to hit the number.
5. **Links branch by origin.** External: `rel="nofollow noopener noreferrer"`, `target="_blank"`,
   external-link icon. Internal (`/releases/…`, `/artists/…`, own host): plain same-tab Next
   Link, no rel restrictions, no icon.
6. **CDN timing: thumbnail re-host at generation; full re-host + variants on save** for
   kept/embedded images only. Dismissed candidates cost one small object, cleaned up on save.
7. **Editor DnD: native HTML5 drag + ProseMirror.** Palette tiles are `draggable` with JSON
   payloads in custom `dataTransfer` types; the editor's `handleDrop` inserts at the
   ProseMirror-computed position. Images become a draggable/resizable `bioFigure` node with a
   delete-X overlay and float control; links stay TipTap marks, edited/removed via a bubble menu
   (not atomic chips — preserves inline text editing). dnd-kit remains only where it is today.
8. **Anti-hallucination: constrained facts + critic-and-repair + programmatic gates.** DB fields
   (`bornOn`, `diedOn`, `formedOn`, full legal name incl. `middleName`) enter the prompt as
   authoritative facts outranking MusicBrainz; a deterministic gate flags output years earlier
   than birth; one Gemini critic pass lists unsupported claims; one repair pass rewrites only
   flagged sentences; a shingle-overlap check against the scraped sources catches plagiarism and
   triggers targeted rewording. At most 2–3 extra Gemini calls.
9. **Delivery: two PRs.** PR 1 = lambda quality + volume (plus a minimal app-side contract
   widening so it deploys safely). PR 2 = app palettes, editor extensions, sanitizer/renderer,
   save-time CDN pipeline. Each on its own branch off freshly fetched main.

## PR 1 — Lambda quality and volume

- **Input facts**: extend the lambda input schema (and its app mirror in
  `src/lib/validation/bio-generation-schema.ts`) with `fullName`, `bornOn`, `diedOn`, `formedOn`.
  Fix `deriveRealName` (`src/lib/services/bio-generation-service.ts`) to include `middleName`.
  Display name preferred for address; full legal name supplied for scraping/prompting.
- **Fact-check** (`bio-generator/src/factcheck.ts`): year gate + critic pass + repair pass.
- **Plagiarism** (`bio-generator/src/plagiarism.ts`): normalized 8–10-word shingle overlap vs
  held source texts; over-threshold sentences reworded.
- **Links**: blocklist removed; `kind: 'streaming'` added; MusicBrainz/Wikidata streaming
  relations kept; extra Jina queries; real page titles as anchor labels; cap 50 after gates.
- **Images**: Commons + scraped candidates merged (scraping no longer fallback-only), cap 30,
  attribution/license/sourceUrl and non-empty alt text carried through.
- **Formatting prompt**: `<ul>`/`<ol>` chunking for enumerable content; links-first richer
  emphasis; `<em>` for work titles.
- **App sliver**: schema widening; listening-service strip removed from
  `src/lib/utils/sanitize-bio-html.ts` and the `sanitizeLinks` path; `BioImageService` gains
  thumbnail-only re-host used at generation; `rehostImages` stops dropping attribution; fixture
  updated.

## PR 2 — Admin palettes, editor, save pipeline

- **Palettes** replace `DiscoveredLinks`/`DiscoveredImages` in
  `src/app/components/forms/artist-bio-generation-section.tsx`: two side-by-side, vertically
  scrollable sections directly above the bio editors. Link tiles show descriptive anchor text,
  kind badge, external icon, X-in-circle delete. Image tiles show the CDN thumb, attribution
  beneath, an eye icon opening a Dialog preview, and X-in-circle delete. X calls admin server
  actions deleting the `ArtistBioLink`/`ArtistBioImage` row.
- **Internal release links** are injected app-side after generation (label = release title,
  url = `/releases/{id}`, `kind: 'release'`) via the release repository — the lambda has no DB
  access.
- **Editor**: new `bioFigure` TipTap node (`figure > img + figcaption` carrying
  title/subtitle/attribution, width as a percentage, float left/right/none) with a React
  NodeView: pointer-event corner resize (mouse and touch), float toggles, delete-X overlay,
  ProseMirror-native drag to reposition with live text reflow. Caption text never renders below
  11px and does not scale with the image. `handleDrop` accepts the two palette payload types.
  Links get a bubble menu (edit/unlink). The insert-link dialog gains anchor text and an
  external toggle; the insert-image dialog gains optional attribution/title/subtitle and inserts
  a `bioFigure`. Legacy `BioEditorImage` content still parses.
- **Sanitizer/renderer**: allow `figure`/`figcaption`/classes/width; `transformTags.a` branches
  by origin (decision 5); `BioHtml` renders floated figures with tight wrap margins and ≥11px
  captions on the public page; float classes are a static Tailwind-visible map.
- **Save pipeline**: on artist update, scan bio HTML for `<img>` srcs not yet fully re-hosted →
  `rehostWithVariants` → rewrite srcs to CDN URLs and upgrade `ArtistBioImage.url`; clean up
  thumbnails of dismissed candidates. Manually pasted external image URLs go through the same
  step.

## Error handling

- Lambda passes degrade gracefully in the established pattern: a failed critic/repair pass logs
  and returns the prior prose rather than failing the run; the plagiarism reword pass falls back
  to the flagged-but-unmodified text with a logged warning.
- Save-time re-host failures are caught, logged, and non-blocking: the save succeeds with the
  thumbnail URL still in place, and the next save retries.
- Palette delete actions return the standard `{ success, error }` envelope; TanStack invalidation
  restores consistency.

## Testing

- TDD throughout; specs adjacent to source. Lambda: pure-function tests for factcheck/plagiarism,
  contract tests for the widened schemas, prompt-content assertions. App: palette render/delete/
  drag-payload specs, figure-extension parse/render round-trip through the sanitizer, sanitizer
  origin-branch specs, save-pipeline rewrite specs, release-link injection specs.
- Gates: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`, coverage
  regression check, lambda workspace tests.
- E2E (isolated Docker mongo only): palette visibility, X-delete, insert modals, figure
  persistence. Native drag covered at the unit level (`handleDrop`), with synthetic-DataTransfer
  E2E only if stable.

## Out of scope

- Reordering palette items (they are curated by deletion, not sorted).
- AI-generated imagery of any kind.
- Editing discovered link labels/URLs in the palette (drag in, then edit anchor text in-editor).
