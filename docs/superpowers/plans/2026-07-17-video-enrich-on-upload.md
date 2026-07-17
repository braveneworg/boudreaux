# Video Enrich-on-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Video row as an unpublished draft the moment the S3 upload finishes (enrichment streams in while the admin fills the form), sharply improve artist extraction end-to-end (filename parser, richer feat markers, MusicBrainz recording-first lookups with split validation and featured-artist discovery), add a reviewable description suggestion, and move the auto-poster window to seconds 3–10.

**Architecture:** Four coordinated changes in one PR, per the approved spec `docs/superpowers/specs/2026-07-17-video-enrich-on-upload-design.md`. All row-anchored enrichment machinery (status, job token, callback, suggestions, apply) is reused unchanged. No Prisma schema changes (drafts use nullable `publishedAt`; new suggestion kinds are new values of the existing `VideoEnrichmentSuggestion.field` string). New video-level suggestion fields are **client-applied** into the RHF form, mirroring `releasedOn` today.

**Tech Stack:** Next.js 16 App Router, React 19, RHF 7 + Zod 4, Prisma 6 + MongoDB, Vitest 4, Playwright; `bio-generator/` is a separate pnpm workspace (AWS Lambda) with its own vitest project.

## Global Constraints

- Work happens in the existing worktree `.claude/worktrees/feat-video-enrich-on-upload` on branch `feat/video-enrich-on-upload`. Never touch the main checkout.
- TDD per task: write the failing test, watch it fail, implement, watch it pass, commit.
- Gate before every commit: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- Every new source file starts with the 3-line MPL header from `HEADER.txt`.
- Arrow functions only; named exports only; no `any`, no `!`, no lint/type suppressions; ESLint `complexity` cap is 10 — extract helpers up front.
- Commits: `type(scope): <gitmoji> subject`, subject ≤48 visible chars before the emoji; NO AI attribution lines.
- `describe`/`it`/`expect`/`vi` are vitest globals — never import them. Server-only specs need `vi.mock('server-only', () => ({}))`.
- Wire lockstep: `src/lib/validation/video-enrichment-schema.ts` and `bio-generator/src/types.ts` mirror each other and cannot share a module — change both when the contract changes (Tasks 11 and 13).
- E2E DB isolation is MANDATORY: only `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` via `pnpm run e2e:docker:up`; never read `.env*`.
- Bio-generator tests run with `pnpm --dir bio-generator exec vitest run <path>`.
- Web unit tests run with `pnpm exec vitest run <path>`.

## File Structure (what's created/modified where)

```
src/app/components/forms/videos/
  video-metadata.ts                 # T1 poster window; T4 filename-parser wiring
  use-video-upload.ts               # T10 onUploadComplete callback
  use-video-draft.ts                # T10 NEW draft-at-upload hook
  use-video-artist-review.ts        # T5 primary split candidates
  video-artist-review-section.tsx   # T5 split hint card
  enrichment/video-field-suggestion.tsx      # T12 NEW generalized video-level card
  enrichment/video-enrichment-panel.tsx      # T12 video-level card list
  enrichment/video-release-date-suggestion.tsx # T12 DELETED (absorbed)
src/app/components/forms/video-form.tsx      # T10 draft mode; T12 apply switch
src/lib/utils/
  artist-name-split.ts              # T2 markers + splitNameCandidates
  parse-video-filename.ts           # T3 NEW pure parser
  multipart-upload.ts               # T9 E2E short-circuit
src/lib/validation/
  video-draft-schema.ts             # T8 NEW lenient draft schema
  video-enrichment-schema.ts        # T11 field whitelist + video-level wire
src/lib/actions/
  video-action-helpers.ts           # T6 artist gate; T7 artistDetailsDiffer; T8 export coercers; T9 E2E confirm gate
  update-video-action.ts            # T7 change-detection
  create-video-draft-action.ts      # T8 NEW
  apply-video-suggestion-action.ts  # T11 video-level rejection list
src/lib/services/
  video-enrichment-service.ts       # T11 persistence for description/featuredArtist
  video-enrichment-fixture.ts       # T11 fixture entries
src/lib/types/domain/video-enrichment.ts     # T11 VideoEnrichmentState.description
src/lib/repositories/video-repository.ts     # T11 getEnrichmentState projection
bio-generator/src/
  types.ts                          # T13 wire growth
  musicbrainz.ts                    # T13 searchRecordingCandidates
  video-enrichment.ts               # T14 recording-first integration
  video-description.ts              # T15 NEW description synthesis
  release-date.ts                   # T15 export `adjudicate`
e2e/
  helpers/e2e-db.ts                 # T16 NEW cleanup helper
  tests/admin-video-draft-upload.spec.ts     # T16 NEW keystone spec
  tests/admin-video-enrichment.spec.ts       # T16 new fixture fields
  tests/admin-dashboard.spec.ts / admin-videos-list.spec.ts  # T16 toPass hardening
```

---

### Task 1: Poster capture window moves to seconds 3–10

**Files:**

- Modify: `src/app/components/forms/videos/video-metadata.ts` (lines 113–179)
- Test: `src/app/components/forms/videos/video-metadata.spec.ts` (exists)

**Interfaces:**

- Consumes: nothing new.
- Produces: exported `POSTER_SAMPLE_START_SECONDS = 3`, `POSTER_SAMPLE_END_SECONDS = 10`, and exported `posterCandidateTimes(duration: number): number[]` (currently private). `captureVideoPoster` behavior otherwise unchanged; manual `atSeconds` untouched.

- [ ] **Step 1: Write the failing table test** — in `video-metadata.spec.ts` add:

```typescript
describe('posterCandidateTimes', () => {
  it('samples 5 times inside [3, 10] for long videos', () => {
    const times = posterCandidateTimes(245);
    expect(times).toHaveLength(5);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(POSTER_SAMPLE_START_SECONDS);
    expect(Math.max(...times)).toBeLessThanOrEqual(POSTER_SAMPLE_END_SECONDS);
    expect(times[0]).toBeCloseTo(3.7, 5); // 3 + (7 * 0.5) / 5
  });

  it('samples [3, duration] when the video is shorter than 10s', () => {
    const times = posterCandidateTimes(6);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...times)).toBeLessThanOrEqual(6);
  });

  it('falls back to whole-video sampling at or under 3s', () => {
    const times = posterCandidateTimes(3);
    expect(times).toHaveLength(5);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...times)).toBeLessThanOrEqual(3);
  });

  it('returns [0] for a non-finite or non-positive duration', () => {
    expect(posterCandidateTimes(Number.NaN)).toEqual([0]);
    expect(posterCandidateTimes(0)).toEqual([0]);
  });
});
```

Import `posterCandidateTimes`, `POSTER_SAMPLE_START_SECONDS`, `POSTER_SAMPLE_END_SECONDS` from `./video-metadata`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-metadata.spec.ts`
Expected: FAIL — `posterCandidateTimes` is not exported.

- [ ] **Step 3: Implement** — replace `POSTER_SAMPLE_WINDOW_SECONDS` (line 116) and the private `posterCandidateTimes` (lines 169–179) with:

```typescript
/** Auto-poster candidates come from this window (skips fade-ins/title cards). */
export const POSTER_SAMPLE_START_SECONDS = 3;
export const POSTER_SAMPLE_END_SECONDS = 10;

/**
 * Evenly spaced sample times inside the poster window: `[3s, 10s]` clamped to
 * the duration, whole-video for clips of 3s or less; `[0]` when unknowable.
 */
export const posterCandidateTimes = (duration: number): number[] => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0];
  }
  const start = duration <= POSTER_SAMPLE_START_SECONDS ? 0 : POSTER_SAMPLE_START_SECONDS;
  const end = Math.min(POSTER_SAMPLE_END_SECONDS, duration);
  const window = end - start;
  return Array.from(
    { length: POSTER_CANDIDATE_COUNT },
    (_, index) => start + (window * (index + 0.5)) / POSTER_CANDIDATE_COUNT
  );
};
```

Update the JSDoc on `captureVideoPoster` ("opening seconds" → the 3–10s window). Fix any existing spec assertions that pinned the old 0–3 window.

- [ ] **Step 4: Run tests + gate** — same command passes; then full gate.
- [ ] **Step 5: Commit** — `feat(videos): ✨ poster window 3-10s skips intros`

---

### Task 2: Feat markers + multi-name split candidates

**Files:**

- Modify: `src/lib/utils/artist-name-split.ts`
- Test: `src/lib/utils/artist-name-split.spec.ts` (exists)

**Interfaces:**

- Produces: `splitFeaturedArtists` now also splits on `feat`/`ft` without a dot and on `w/` (canonical — used by server `syncVideoArtists` too). NEW export `splitNameCandidates(name: string): string[]` — returns the parts when `name` looks like multiple artists joined by `", "`, `" & "`, or `" x "`, else `[]`. It is candidates-only: NEVER called by the canonical save-time split (spec: "not silently trusted").
- Consumed by: Task 3 (feat-clause list explosion), Task 5 (review-UI hint).

- [ ] **Step 1: Write the failing tests**

```typescript
describe('splitFeaturedArtists extended markers', () => {
  it('splits on feat and ft without a dot', () => {
    expect(splitFeaturedArtists('Alpha feat Bravo')).toEqual([
      { name: 'Alpha', role: 'primary' },
      { name: 'Bravo', role: 'featured' },
    ]);
    expect(splitFeaturedArtists('Alpha ft Bravo')[1]).toEqual({ name: 'Bravo', role: 'featured' });
  });

  it('splits on w/ followed by a space', () => {
    expect(splitFeaturedArtists('Alpha w/ Bravo')[1]).toEqual({ name: 'Bravo', role: 'featured' });
  });

  it('does not split w/o or mid-word ft', () => {
    expect(splitFeaturedArtists('Alpha w/o tears')).toEqual([
      { name: 'Alpha w/o tears', role: 'primary' },
    ]);
    expect(splitFeaturedArtists('Daft Punk')).toEqual([{ name: 'Daft Punk', role: 'primary' }]);
  });
});

describe('splitNameCandidates', () => {
  it('returns parts for comma, ampersand, and x separators', () => {
    expect(splitNameCandidates('Alpha & Bravo')).toEqual(['Alpha', 'Bravo']);
    expect(splitNameCandidates('Alpha, Bravo, Charlie')).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(splitNameCandidates('Alpha x Bravo')).toEqual(['Alpha', 'Bravo']);
  });

  it('returns [] for single names, including x inside a word', () => {
    expect(splitNameCandidates('Alpha')).toEqual([]);
    expect(splitNameCandidates('Xavier Exodus')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts`

- [ ] **Step 3: Implement** — replace the `FEAT_SEPARATOR` and add the new export:

```typescript
/**
 * Matches a featuring separator as its own word: `feat`/`ft` (dot optional),
 * `featuring`, or `w/ ` (case-insensitive), optionally preceded by an opening
 * `(`/`[`. The leading `\b` blocks mid-word hits ("Featurecast", "Daft");
 * `w/` requires trailing whitespace so `w/o` never splits. Ambiguous joiners
 * (`&`, `x`, `,`, `+`) are still never split on here — see
 * {@link splitNameCandidates} for the candidates-only path.
 */
const FEAT_SEPARATOR = /\s*[([]?\s*(?:\b(?:feat|ft)\.?\s+|\bfeaturing\s+|\bw\/\s+)/gi;

/** Joiners that MAY separate multiple artists (also live inside band names). */
const NAME_CANDIDATE_SEPARATOR = /\s*,\s*|\s+&\s+|\s+x\s+/i;

/**
 * Candidate multi-artist split of one name on `", "`, `" & "`, or `" x "`.
 * Returns the trimmed parts when there are 2+, else `[]`. Candidates only:
 * the canonical splitter never uses this (a legit band name may contain the
 * joiner), so callers must surface the split for explicit review.
 */
export const splitNameCandidates = (name: string): string[] => {
  const parts = name
    .split(new RegExp(NAME_CANDIDATE_SEPARATOR.source, 'gi'))
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 1 ? parts : [];
};
```

`splitFeaturedArtists` and `composeArtistString` bodies stay as-is (the regex swap is the only canonical change; round-trip still holds because compose emits `feat.` which the regex still matches).

- [ ] **Step 4: Run task tests, then the canonical consumers** — `pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts src/lib/services/video-enrichment-service.spec.ts src/app/components/forms/videos/use-video-artist-fields.spec.ts src/app/components/forms/videos/use-video-artist-review.spec.ts` — fix any spec that pinned the old marker set. Then full gate.
- [ ] **Step 5: Commit** — `feat(videos): ✨ richer feat markers + split hints`

---

### Task 3: `parse-video-filename` pure util

**Files:**

- Create: `src/lib/utils/parse-video-filename.ts`
- Test: `src/lib/utils/parse-video-filename.spec.ts`

**Interfaces:**

- Consumes: `splitFeaturedArtists`, `splitNameCandidates` from `@/utils/artist-name-split` (Task 2).
- Produces:

```typescript
export interface ParsedVideoFilename {
  title: string; // cleaned title, never empty for a non-empty file name
  artist: string | null; // primary artist when `Artist - Title` was found
  featuredArtists: string[]; // feat-clause names from BOTH segments, deduped
}
export const parseVideoFilename = (fileName: string): ParsedVideoFilename;
```

Client-safe (no `'server-only'`) — Task 8's server action also imports it.

- [ ] **Step 1: Write the failing table test**

```typescript
import { parseVideoFilename } from './parse-video-filename';

describe('parseVideoFilename', () => {
  it.each([
    [
      'Alpha - Song (feat. Bravo) [Official Video].mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo'] },
    ],
    ['Alpha – Song (Lyric Video).webm', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    ['Alpha | Song [4K].mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    [
      'Alpha feat. Bravo - Song.mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo'] },
    ],
    [
      'Alpha - Song (feat. Bravo & Charlie).mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo', 'Charlie'] },
    ],
    ['01 - Alpha - Song.mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    ['Alpha_-_Song_1080p_x264.mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    [
      'Alpha.Name.-.Song.Title.mp4',
      { title: 'Song Title', artist: 'Alpha Name', featuredArtists: [] },
    ],
    ['Song (Remastered 2011).mp4', { title: 'Song', artist: null, featuredArtists: [] }],
    ['plain-clip.mp4', { title: 'plain-clip', artist: null, featuredArtists: [] }],
  ])('%s', (fileName, expected) => {
    expect(parseVideoFilename(fileName)).toEqual(expected);
  });

  it('keeps the title when every token is decoration', () => {
    const parsed = parseVideoFilename('[HD].mp4');
    expect(parsed.title).not.toBe('');
  });
});
```

Note the `plain-clip.mp4` row: an UNSPACED hyphen is not an artist/title separator (only `-` is), and dots normalize to spaces only when the stem has no spaces — a stem like `plain-clip` keeps its hyphen.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/utils/parse-video-filename.spec.ts` — module not found.

- [ ] **Step 3: Implement** (with the MPL header):

```typescript
import { splitFeaturedArtists, splitNameCandidates } from '@/utils/artist-name-split';

/** One filename parsed into prefill-ready pieces. */
export interface ParsedVideoFilename {
  title: string;
  artist: string | null;
  featuredArtists: string[];
}

const FILE_EXTENSION = /\.[^/.]+$/;
/** Bracketed decoration junk: (Official Video), [HD], (Remastered 2011)… */
const BRACKETED_DECORATION =
  /[([](?:official\s+(?:music\s+)?video|official\s+audio|official\s+visualizer|music\s+video|lyric\s+video|lyrics|visualizer|audio(?:\s+only)?|remaster(?:ed)?(?:\s+\d{4})?|explicit|clean|hd|4k|\d{3,4}p|x26[45]|h\.?26[45])[)\]]/gi;
/** Bare resolution/codec tokens safe to strip outside brackets. */
const BARE_DECORATION = /\b(?:\d{3,4}p|x26[45]|h26[45])\b/gi;
/** Leading track numbers: `01 - `, `01. `, `1_`. */
const LEADING_TRACK_NUMBER = /^\s*\d{1,3}\s*[-._]\s*/;
/** `Artist - Title` separators: hyphen/en-dash/em-dash/pipe with spaces. */
const ARTIST_TITLE_SEPARATOR = /\s+[-–—|]\s+/;

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Underscores always become spaces; dots only when the stem has no spaces. */
const normalizeSeparators = (stem: string): string => {
  const underscored = stem.replace(/_/g, ' ');
  return underscored.includes(' ') ? underscored : underscored.replace(/\./g, ' ');
};

const stripDecorations = (value: string): string =>
  collapseWhitespace(value.replace(BRACKETED_DECORATION, ' ').replace(BARE_DECORATION, ' '));

const dedupeNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Split one segment into its base name plus exploded feat-clause names. */
const extractFeatured = (segment: string): { base: string; featured: string[] } => {
  const parts = splitFeaturedArtists(segment);
  if (parts.length === 0) return { base: '', featured: [] };
  const [first, ...rest] = parts;
  const featured = rest.flatMap((part) => {
    const candidates = splitNameCandidates(part.name);
    return candidates.length > 0 ? candidates : [part.name];
  });
  return { base: first.name, featured };
};

/**
 * Parse a video file name into prefill pieces: strip the extension, normalize
 * `_`/`.` separators, drop decoration junk and leading track numbers, split
 * `Artist - Title`, and extract feat-clauses from both segments (list-shaped
 * clauses like `feat. A, B & C` explode into individual names — the prefill
 * is fully visible in the form, so aggressive parsing is reviewable).
 */
export const parseVideoFilename = (fileName: string): ParsedVideoFilename => {
  const stem = normalizeSeparators(fileName.replace(FILE_EXTENSION, ''));
  const cleaned = stripDecorations(stem).replace(LEADING_TRACK_NUMBER, '');
  const [left, ...restSegments] = cleaned.split(ARTIST_TITLE_SEPARATOR);

  if (restSegments.length === 0) {
    const { base, featured } = extractFeatured(collapseWhitespace(left));
    const title = base || collapseWhitespace(left) || collapseWhitespace(stem);
    return { title, artist: null, featuredArtists: dedupeNames(featured) };
  }

  const right = restSegments.join(' - ');
  const artistSide = extractFeatured(collapseWhitespace(left));
  const titleSide = extractFeatured(collapseWhitespace(right));
  return {
    title: titleSide.base || collapseWhitespace(right),
    artist: artistSide.base || null,
    featuredArtists: dedupeNames([...artistSide.featured, ...titleSide.featured]),
  };
};
```

- [ ] **Step 4: Run tests + gate.**
- [ ] **Step 5: Commit** — `feat(videos): ✨ real filename parser for prefill`

---

### Task 4: Wire the parser into the prefill fallback

**Files:**

- Modify: `src/app/components/forms/videos/video-metadata.ts` (lines 12–94: `ExtractedVideoTags`, `deriveTitleFromFileName`, `extractVideoTags`)
- Test: `src/app/components/forms/videos/video-metadata.spec.ts`

**Interfaces:**

- Consumes: `parseVideoFilename` (T3), `splitFeaturedArtists`/`composeArtistString` (T2).
- Produces: `extractVideoTags(file)` unchanged signature; container tags stay preferred; filename supplies the cleaned title, an artist fallback, and supplemental feat-clause names. `deriveTitleFromFileName` and its regexes are DELETED (orphaned).

- [ ] **Step 1: Write the failing tests** (the spec already mocks `music-metadata` via `vi.mock` — follow its existing pattern for the parseBlob mock):

```typescript
it('falls back to parsed artist and featured names when tags are absent', async () => {
  parseBlobMock.mockRejectedValueOnce(new Error('unparseable'));
  const file = new File(['x'], 'Alpha - Song (feat. Bravo) [Official Video].mp4', {
    type: 'video/mp4',
  });
  await expect(extractVideoTags(file)).resolves.toEqual({
    title: 'Song',
    artist: 'Alpha feat. Bravo',
  });
});

it('prefers container artist but supplements filename feat-clauses', async () => {
  parseBlobMock.mockResolvedValueOnce({ common: { title: 'Tagged', artist: 'Real Alpha' } });
  const file = new File(['x'], 'Alpha - Song (feat. Bravo).mp4', { type: 'video/mp4' });
  await expect(extractVideoTags(file)).resolves.toEqual({
    title: 'Tagged',
    artist: 'Real Alpha feat. Bravo',
  });
});

it('does not duplicate a featured name the container already carries', async () => {
  parseBlobMock.mockResolvedValueOnce({
    common: { title: 'Tagged', artist: 'Real Alpha feat. Bravo' },
  });
  const file = new File(['x'], 'Alpha - Song (feat. Bravo).mp4', { type: 'video/mp4' });
  await expect(extractVideoTags(file)).resolves.toEqual({
    title: 'Tagged',
    artist: 'Real Alpha feat. Bravo',
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/forms/videos/video-metadata.spec.ts`

- [ ] **Step 3: Implement** — delete `deriveTitleFromFileName`, `FILE_EXTENSION`, `FILENAME_SEPARATORS`, `WHITESPACE` from this file; rewrite `extractVideoTags` with a helper to stay under the complexity cap:

```typescript
import { composeArtistString, splitFeaturedArtists } from '@/utils/artist-name-split';
import { parseVideoFilename } from '@/utils/parse-video-filename';

/** Fold filename feat-clauses into a container artist, skipping known names. */
const supplementFeatured = (containerArtist: string, parsedFeatured: string[]): string => {
  if (parsedFeatured.length === 0) return containerArtist;
  const parts = splitFeaturedArtists(containerArtist);
  const known = new Set(parts.map((part) => part.name.toLowerCase()));
  const extras = parsedFeatured.filter((name) => !known.has(name.toLowerCase()));
  if (extras.length === 0 || parts.length === 0) return containerArtist;
  const [primary, ...featured] = parts;
  return composeArtistString(primary.name, [...featured.map((part) => part.name), ...extras]);
};

export const extractVideoTags = async (file: File): Promise<ExtractedVideoTags> => {
  const parsed = parseVideoFilename(file.name);
  const parsedArtist = parsed.artist
    ? composeArtistString(parsed.artist, parsed.featuredArtists)
    : undefined;
  try {
    const { parseBlob } = await import('music-metadata');
    const { common } = await parseBlob(file, { skipCovers: true, duration: false });
    const tags: ExtractedVideoTags = { title: common.title || parsed.title };
    const artist = common.artist
      ? supplementFeatured(common.artist, parsed.featuredArtists)
      : parsedArtist;
    if (artist) tags.artist = artist;
    const releasedOn = resolveReleasedOn(common.date, common.year);
    if (releasedOn) tags.releasedOn = releasedOn;
    return tags;
  } catch {
    return { title: parsed.title, ...(parsedArtist ? { artist: parsedArtist } : {}) };
  }
};
```

Update any existing spec rows that pinned the old separator-flattening titles (`My_Video.File.mp4`-style expectations).

- [ ] **Step 4: Run tests + gate.**
- [ ] **Step 5: Commit** — `feat(videos): ✨ prefill artist+feat from filename`

---

### Task 5: Primary-split hint in the artist review UI

**Files:**

- Modify: `src/app/components/forms/videos/use-video-artist-review.ts`
- Modify: `src/app/components/forms/videos/video-artist-review-section.tsx`
- Modify: `src/app/components/forms/video-form.tsx` (wire the accept callback)
- Tests: adjacent `.spec` files for all three.

**Interfaces:**

- Consumes: `splitNameCandidates`, `composeArtistString`, `splitFeaturedArtists` (T2).
- Produces: `UseVideoArtistReviewResult` gains `primarySplitParts: string[] | null` (candidates for the PRIMARY entry's sourceName, null when none). `VideoArtistReviewSectionProps` gains `primarySplitParts: string[] | null` and `onApplySplit: (parts: string[]) => void`. VideoForm's handler rewrites the artist field: first part stays primary, the rest become featured (`composeArtistString(parts[0], [...parts.slice(1), ...existingFeaturedNames])`).

- [ ] **Step 1: Failing hook test** (`use-video-artist-review.spec.ts`):

```typescript
it('surfaces split candidates for a multi-name primary', async () => {
  const { result } = renderHook(() => useVideoArtistReview('Alpha & Bravo'));
  await waitFor(() => expect(result.current.primarySplitParts).toEqual(['Alpha', 'Bravo']));
});

it('has no split candidates for a single-name primary', async () => {
  const { result } = renderHook(() => useVideoArtistReview('Alpha feat. Bravo'));
  await waitFor(() => expect(result.current.primarySplitParts).toBeNull());
});
```

(Reuse the spec's existing debounce/query mocking setup.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the hook** — inside `useVideoArtistReview`, after the parse step:

```typescript
const primary = parts.find((part) => part.role === 'primary') ?? null;
const candidates = primary ? splitNameCandidates(primary.name) : [];
const primarySplitParts = candidates.length > 1 ? candidates : null;
```

Memoize with the existing derivation and add `primarySplitParts` to the returned object + result interface.

- [ ] **Step 4: Failing section test** (`video-artist-review-section.spec.tsx`): renders a hint card `Multiple artists? Split as Alpha + Bravo` with an `Apply split` button when `primarySplitParts` is set; clicking calls `onApplySplit(['Alpha', 'Bravo'])`; nothing renders when null. Then implement — a small card above the entries list:

```tsx
{
  primarySplitParts ? (
    <div className="rounded-md border p-3 text-sm" role="note">
      <p>
        Multiple artists? Split as <strong>{primarySplitParts.join(' + ')}</strong>
      </p>
      <Button type="button" variant="secondary" onClick={() => onApplySplit(primarySplitParts)}>
        Apply split
      </Button>
    </div>
  ) : null;
}
```

Keep the section's early `null` return when there are no entries AND no split parts.

- [ ] **Step 5: Wire VideoForm** — add a callback next to `handleApplyReleaseDate`:

```typescript
const handleApplySplit = useCallback(
  (parts: string[]): void => {
    const existing = splitFeaturedArtists(form.getValues('artist'))
      .filter((part) => part.role === 'featured')
      .map((part) => part.name);
    const composed = composeArtistString(parts[0], [...parts.slice(1), ...existing]);
    setValue('artist', composed, { shouldDirty: true, shouldValidate: true });
  },
  [form, setValue]
);
```

Pass `primarySplitParts` and `onApplySplit={handleApplySplit}` to `<VideoArtistReviewSection>`.

- [ ] **Step 6: Run all three spec files + gate.**
- [ ] **Step 7: Commit** — `feat(videos): ✨ artist split hint in review UI`

---

### Task 6: `kickPostSaveEnrichment` artist-blank gate

**Files:**

- Modify: `src/lib/actions/video-action-helpers.ts` (lines 186–214)
- Test: the existing spec covering these helpers (`src/lib/actions/video-action-helpers.spec.ts`; if the helpers are covered from `create-video-action.spec.ts` instead, extend there — search first, never duplicate).

**Interfaces:**

- Produces: `kickPostSaveEnrichment` skips `syncVideoArtists` AND `runEnrichmentJob` when `artist.trim() === ''`; probe behavior unchanged. Never mints an "Unknown Artist" shell for artist-less drafts (spec §1). Task 8's draft action relies on this gate.

- [ ] **Step 1: Failing test** — mock `VideoEnrichmentService` and `VideoProbeService` at the service boundary (follow the file's existing mock pattern):

```typescript
it('skips artist sync and enrichment when the artist is blank', async () => {
  await kickPostSaveEnrichment({
    videoId: 'v1',
    artist: '   ',
    category: 'MUSIC',
    reProbe: true,
  });
  expect(VideoEnrichmentService.syncVideoArtists).not.toHaveBeenCalled();
  expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
  expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith('v1');
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — at the top of `kickPostSaveEnrichment`:

```typescript
const hasArtist = artist.trim() !== '';
```

Wrap the sync stage in `if (hasArtist) { … }` and change the enrichment gate to `if (category === 'MUSIC' && hasArtist) { … }`. Extend the JSDoc: a blank artist (draft created before the admin typed one) probes only — no shell, no dispatch.

- [ ] **Step 4: Run tests + gate.**
- [ ] **Step 5: Commit** — `feat(videos): ✨ blank-artist gate on save kick`

---

### Task 7: Update-action enrichment change-detection

**Files:**

- Modify: `src/lib/actions/video-action-helpers.ts` (new exported helper)
- Modify: `src/lib/actions/update-video-action.ts` (lines 73–91)
- Tests: `update-video-action.spec.ts` + the helpers spec.

**Interfaces:**

- Consumes: `VideoArtistRepository.findByVideoId(videoId): Promise<VideoArtistWithArtist[]>` (existing, from `@/lib/repositories/video-artist-repository`).
- Produces: exported `artistDetailsDiffer(details: VideoArtistDetail[], rows: VideoArtistWithArtist[]): boolean` in `video-action-helpers.ts`. `scheduleUpdateEnrichment` re-kicks ONLY when: artist string changed, OR file replaced, OR provided `artistDetails` actually differ from the linked artists' stored parts (checked inside `after()`, off the request path). In the draft world an ordinary save no longer re-runs a job that already ran at upload-complete (spec §1 "Save-time double-run fix").

- [ ] **Step 1: Failing helper tests**:

```typescript
const row = (over: Partial<VideoArtistWithArtist['artist']> = {}): VideoArtistWithArtist =>
  ({
    artistId: 'a1',
    role: 'PRIMARY',
    artist: {
      firstName: 'Alpha',
      middleName: null,
      surname: 'Beta',
      displayName: 'Alpha Beta',
      akaNames: null,
      bornOn: null,
      ...over,
    },
  }) as VideoArtistWithArtist;

describe('artistDetailsDiffer', () => {
  it('is false when every detail matches the linked artist', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(false);
  });

  it('is true when a provided part differs', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Changed' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(true);
  });

  it('is true when the source name matches no linked artist', () => {
    expect(artistDetailsDiffer([{ sourceName: 'Nobody' }], [row()])).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the helper** in `video-action-helpers.ts`:

```typescript
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';

/** The linked artist's matchable display name (mirrors the enrichment service). */
const linkedNameFor = (row: VideoArtistWithArtist): string =>
  (
    row.artist.displayName?.trim() || `${row.artist.firstName} ${row.artist.surname}`.trim()
  ).toLowerCase();

/** True when one provided part differs from the stored value (undefined = not provided). */
const detailPartDiffers = (stored: string | null, provided: string | undefined): boolean =>
  provided !== undefined && (stored ?? '').trim() !== provided.trim();

/**
 * True when any admin-reviewed artist detail actually differs from the linked
 * artists' stored name parts (an unmatched sourceName counts as a change).
 * Lets the update action skip re-kicking enrichment for a no-op save.
 */
export const artistDetailsDiffer = (
  details: VideoArtistDetail[],
  rows: VideoArtistWithArtist[]
): boolean =>
  details.some((detail) => {
    const match = rows.find((row) => linkedNameFor(row) === detail.sourceName.trim().toLowerCase());
    if (!match) return true;
    return (
      detailPartDiffers(match.artist.firstName, detail.firstName) ||
      detailPartDiffers(match.artist.middleName, detail.middleName) ||
      detailPartDiffers(match.artist.surname, detail.surname) ||
      detailPartDiffers(match.artist.displayName, detail.displayName)
    );
  });
```

- [ ] **Step 4: Failing action tests** in `update-video-action.spec.ts` (reuse its mocks): (a) same artist + same s3Key + `artistDetails` matching the linked rows → `kickPostSaveEnrichment` NOT called; (b) details with a changed surname → called with `reProbe: false`; (c) artist changed → called without any repository read. Then rewrite `scheduleUpdateEnrichment`:

```typescript
const scheduleUpdateEnrichment = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): void => {
  const artistChanged = data.artist !== current.artist;
  if (artistChanged || s3KeyReplaced) {
    after(() =>
      kickPostSaveEnrichment({
        videoId: current.id,
        artist: data.artist,
        category: data.category,
        reProbe: s3KeyReplaced,
        artistDetails: data.artistDetails,
      })
    );
    return;
  }
  const details = data.artistDetails;
  if (!details?.length) return;
  // Details-only saves are common in the draft flow — verify an ACTUAL change
  // against the linked artists before re-running a job that already ran.
  after(async () => {
    const rows = await VideoArtistRepository.findByVideoId(current.id);
    if (!artistDetailsDiffer(details, rows)) return;
    await kickPostSaveEnrichment({
      videoId: current.id,
      artist: data.artist,
      category: data.category,
      reProbe: false,
      artistDetails: details,
    });
  });
};
```

Add the `VideoArtistRepository` and `artistDetailsDiffer` imports; update the JSDoc.

- [ ] **Step 5: Run both spec files + gate.**
- [ ] **Step 6: Commit** — `feat(videos): ✨ skip no-op enrichment on update`

---

### Task 8: `videoDraftSchema` + `createVideoDraftAction`

**Files:**

- Create: `src/lib/validation/video-draft-schema.ts`
- Create: `src/lib/actions/create-video-draft-action.ts`
- Modify: `src/lib/actions/video-action-helpers.ts` (export `parseDurationSeconds` / `parseFileSize`, currently private at lines 44–53)
- Tests: `video-draft-schema.spec.ts`, `create-video-draft-action.spec.ts`

**Interfaces:**

- Consumes: `confirmVideoUpload`, `kickPostSaveEnrichment` (T6 gate), `parseDurationSeconds`, `parseFileSize` (helpers); `parseVideoFilename` (T3); `VideoService.getVideoById` / `VideoService.createVideo` (existing); `requireRole`, `logSecurityEvent`, `loggers.media`.
- Produces:

```typescript
// video-draft-schema.ts
export const videoDraftSchema: z.ZodObject<…>;
export type VideoDraftInput = z.infer<typeof videoDraftSchema>;
// create-video-draft-action.ts
export type CreateVideoDraftResult =
  | { success: true; videoId: string }
  | { success: false; error: string };
export const createVideoDraftAction = (input: unknown) => Promise<CreateVideoDraftResult>;
```

Task 10's client hook calls this action. Idempotent on an existing row; the row is created UNPUBLISHED (`publishedAt` omitted); upload is never blocked by a draft failure (caller degrades to create-on-submit).

- [ ] **Step 1: Failing schema tests** (`video-draft-schema.spec.ts`):

```typescript
it('requires only the upload triple and the id', () => {
  const parsed = videoDraftSchema.safeParse({
    preGeneratedId: '65a1b2c3d4e5f6a7b8c9d0e1',
    s3Key: 'media/videos/65a1b2c3d4e5f6a7b8c9d0e1/x.mp4',
    fileName: 'x.mp4',
    mimeType: 'video/mp4',
  });
  expect(parsed.success).toBe(true);
  expect(parsed.data?.category).toBe('MUSIC'); // defaulted
});

it('rejects a malformed id and an unknown mime type', () => {
  expect(
    videoDraftSchema.safeParse({
      preGeneratedId: 'nope',
      s3Key: 'k',
      fileName: 'f',
      mimeType: 'video/mp4',
    }).success
  ).toBe(false);
  expect(
    videoDraftSchema.safeParse({
      preGeneratedId: '65a1b2c3d4e5f6a7b8c9d0e1',
      s3Key: 'k',
      fileName: 'f',
      mimeType: 'text/html',
    }).success
  ).toBe(false);
});
```

- [ ] **Step 2: Implement the schema** (MPL header):

```typescript
import { z } from 'zod';

import { VIDEO_ALLOWED_MIME_TYPES } from '@/lib/constants/video-uploads';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { videoArtistDetailSchema } from './video-artist-detail-schema';

/**
 * Lenient payload for the draft row created at upload-complete: only the
 * upload triple + pre-generated id are required; every display field is an
 * optional snapshot of the in-progress form (the action fills fallbacks).
 */
export const videoDraftSchema = z.object({
  preGeneratedId: z.string().regex(OBJECT_ID_REGEX),
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(500),
  mimeType: z.enum(VIDEO_ALLOWED_MIME_TYPES),
  title: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  category: z.enum(['MUSIC', 'INFORMATIONAL']).default('MUSIC'),
  releasedOn: z.string().max(10).optional(),
  description: z.string().max(2000).optional(),
  durationSeconds: z.union([z.string(), z.number()]).optional(),
  fileSize: z.union([z.string(), z.number()]).optional(),
  artistDetails: z.array(videoArtistDetailSchema).max(20).optional(),
});
export type VideoDraftInput = z.infer<typeof videoDraftSchema>;
```

- [ ] **Step 3: Failing action tests** (`create-video-draft-action.spec.ts`, `vi.mock('server-only', () => ({}))`, mock `requireRole`, `VideoService`, `confirmVideoUpload`-bearing helpers module, and `next/server`'s `after` to run callbacks inline). Cover exactly:

```typescript
it('creates an unpublished draft with fallbacks and kicks the pipeline', async () => {
  // getVideoById → { success: false }; confirmVideoUpload → null; createVideo → success
  const result = await createVideoDraftAction({
    preGeneratedId: ID,
    s3Key: `media/videos/${ID}/x.mp4`,
    fileName: 'Alpha - Song.mp4',
    mimeType: 'video/mp4',
    artist: 'Alpha',
  });
  expect(result).toEqual({ success: true, videoId: ID });
  const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
  expect(input.id).toBe(ID);
  expect(input.title).toBe('Song'); // filename-parser stem fallback
  expect(input.publishedAt).toBeUndefined(); // draft stays unpublished
  expect(input.releasedOn).toBeInstanceOf(Date); // today fallback
  expect(kickPostSaveEnrichment).toHaveBeenCalledWith(
    expect.objectContaining({ videoId: ID, artist: 'Alpha', reProbe: true })
  );
});

it('is idempotent when the row already exists', async () => {
  // getVideoById → { success: true, data: {...} }
  const result = await createVideoDraftAction(validInput);
  expect(result).toEqual({ success: true, videoId: ID });
  expect(VideoService.createVideo).not.toHaveBeenCalled();
});

it('fails softly on S3 confirm errors and on create failures', async () => {
  // confirmVideoUpload → 'File not found…' → { success: false }
  // then confirm ok but createVideo → { success: false } → { success: false }
});

it('rejects invalid input without touching services', async () => {
  await expect(createVideoDraftAction({ nope: true })).resolves.toEqual({
    success: false,
    error: 'Invalid draft request.',
  });
});
```

- [ ] **Step 4: Implement the action** — first export the two coercers in `video-action-helpers.ts` (add `export` to `parseDurationSeconds` and `parseFileSize`, keep JSDoc). Then:

```typescript
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { VideoService } from '@/lib/services/video-service';
import type { CreateVideoData } from '@/lib/types/domain/video';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { parseVideoFilename } from '@/utils/parse-video-filename';
import { videoDraftSchema, type VideoDraftInput } from '@/lib/validation/video-draft-schema';

import {
  confirmVideoUpload,
  kickPostSaveEnrichment,
  parseDurationSeconds,
  parseFileSize,
} from './video-action-helpers';

const logger = loggers.media;

/** Result of the draft create — the caller degrades gracefully on failure. */
export type CreateVideoDraftResult =
  | { success: true; videoId: string }
  | { success: false; error: string };

/** Draft title: the form value, else the cleaned filename stem. */
const draftTitle = (title: string | undefined, fileName: string): string => {
  const provided = title?.trim();
  if (provided) return provided.slice(0, 200);
  const parsed = parseVideoFilename(fileName).title.trim();
  return (parsed || fileName).slice(0, 200);
};

/** Draft release date: the form value when parseable, else today (UTC day). */
const draftReleasedOn = (value: string | undefined): Date => {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(new Date().toISOString().slice(0, 10));
};

/** Repository payload for the draft — `publishedAt` omitted: always a draft. */
const buildDraftCreateInput = (data: VideoDraftInput, userId: string): CreateVideoData => ({
  id: data.preGeneratedId,
  title: draftTitle(data.title, data.fileName),
  artist: data.artist?.trim() ?? '',
  category: data.category,
  description: data.description?.trim() || undefined,
  releasedOn: draftReleasedOn(data.releasedOn),
  durationSeconds: parseDurationSeconds(data.durationSeconds),
  s3Key: data.s3Key,
  fileName: data.fileName,
  fileSize: parseFileSize(data.fileSize),
  mimeType: data.mimeType,
  createdBy: userId,
});

const DRAFT_FAILED: CreateVideoDraftResult = {
  success: false,
  error: 'Could not create the draft.',
};

/**
 * Server Action: create the video row as an unpublished draft the moment the
 * S3 multipart upload completes, so enrichment can run while the admin is
 * still filling the form. Idempotent (an existing row returns success and
 * changes nothing — guards double-fire on flaky networks). In `after()` the
 * post-save pipeline probes always; artist sync + enrichment run only when
 * the artist snapshot is non-blank (gate inside kickPostSaveEnrichment).
 * A failure here NEVER blocks the upload — the form falls back to
 * create-on-submit.
 */
export const createVideoDraftAction = async (input: unknown): Promise<CreateVideoDraftResult> => {
  const session = await requireRole('admin');
  const parsed = videoDraftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid draft request.' };
  const data = parsed.data;

  try {
    const existing = await VideoService.getVideoById(data.preGeneratedId);
    if (existing.success) return { success: true, videoId: data.preGeneratedId };

    const confirmError = await confirmVideoUpload(data.s3Key, data.preGeneratedId);
    if (confirmError) return { success: false, error: confirmError };

    const response = await VideoService.createVideo(buildDraftCreateInput(data, session.user.id));
    logSecurityEvent({
      event: 'media.video.created',
      userId: session.user.id,
      metadata: { videoId: data.preGeneratedId, draft: true, success: response.success },
    });
    if (!response.success) {
      logger.warn('video_draft_create_failed', {
        videoId: data.preGeneratedId,
        error: response.error,
      });
      return DRAFT_FAILED;
    }

    revalidatePath('/admin/videos');
    after(() =>
      kickPostSaveEnrichment({
        videoId: response.data.id,
        artist: data.artist ?? '',
        category: data.category,
        reProbe: true,
        artistDetails: data.artistDetails,
      })
    );
    return { success: true, videoId: response.data.id };
  } catch (error) {
    logger.error('video_draft_create_error', {
      videoId: data.preGeneratedId,
      error: error instanceof Error ? error.message : String(error),
    });
    return DRAFT_FAILED;
  }
};
```

- [ ] **Step 5: Run both spec files + gate.**
- [ ] **Step 6: Commit** — `feat(videos): ✨ draft row at upload-complete`

---

### Task 9: E2E upload fake

**Files:**

- Modify: `src/lib/utils/multipart-upload.ts` (client short-circuit)
- Modify: `src/lib/actions/video-action-helpers.ts` (`confirmVideoUpload`, lines 60–73)
- Tests: `src/lib/utils/multipart-upload.spec.ts`, helpers spec.

**Interfaces:**

- Produces: with `NEXT_PUBLIC_E2E_MODE === 'true'` (established client pattern — see `pusher-client.ts:40`), `uploadVideoMultipart` returns `{ success: true, s3Key: 'media/videos/{videoId}/e2e-upload.mp4', fileSize: file.size }` immediately, no network. With `E2E_MODE === 'true'` (established server pattern — `link-preview-service.ts:39`), `confirmVideoUpload` keeps the namespace/prefix check but skips the S3 HEAD. Together these let Playwright drive the full upload→draft flow with no AWS.

- [ ] **Step 1: Failing tests**

```typescript
// multipart-upload.spec.ts
it('short-circuits to a deterministic success in E2E mode', async () => {
  vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');
  const onProgress = vi.fn();
  const file = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
  await expect(uploadVideoMultipart(file, { videoId: 'vid1', onProgress })).resolves.toEqual({
    success: true,
    s3Key: 'media/videos/vid1/e2e-upload.mp4',
    fileSize: 3,
  });
  expect(onProgress).toHaveBeenCalledWith(1);
});

// helpers spec
it('confirms without an S3 HEAD in E2E mode', async () => {
  vi.stubEnv('E2E_MODE', 'true');
  await expect(confirmVideoUpload('media/videos/v1/x.mp4', 'v1')).resolves.toBeNull();
  expect(verifyS3ObjectExists).not.toHaveBeenCalled();
});

it('still rejects a wrong-namespace key in E2E mode', async () => {
  vi.stubEnv('E2E_MODE', 'true');
  await expect(confirmVideoUpload('media/other/x.mp4', 'v1')).resolves.toMatch(/Invalid S3 key/);
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — top of `uploadVideoMultipart` (import `VIDEO_KEY_PREFIX` from `@/lib/constants/video-uploads`):

```typescript
// E2E has no S3: short-circuit to a deterministic key under the video's
// namespace so confirmVideoUpload's prefix check still holds downstream.
if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
  options.onProgress?.(1);
  return {
    success: true,
    s3Key: `${VIDEO_KEY_PREFIX}${options.videoId}/e2e-upload.mp4`,
    fileSize: file.size,
  };
}
```

And in `confirmVideoUpload`, between the prefix check and the HEAD:

```typescript
// E2E runs without S3 — the namespace check above still guards the key shape.
if (process.env.E2E_MODE === 'true') return null;
```

- [ ] **Step 4: Run tests + gate.**
- [ ] **Step 5: Commit** — `feat(e2e): ✨ fake video upload path for E2E`

---

### Task 10: Draft mode in the video form

**Files:**

- Modify: `src/app/components/forms/videos/use-video-upload.ts` (add `onUploadComplete`)
- Create: `src/app/components/forms/videos/use-video-draft.ts`
- Modify: `src/app/components/forms/video-form.tsx`
- Tests: `use-video-upload.spec.tsx`, new `use-video-draft.spec.tsx`, `video-form` coverage via the section specs it already has.

**Interfaces:**

- Consumes: `createVideoDraftAction`/`CreateVideoDraftResult` (T8), `VideoDraftInput` (T8), `VideoArtistDetail`.
- Produces:

```typescript
// use-video-upload.ts — UseVideoUploadArgs gains:
onUploadComplete?: () => void; // fired once after hidden fields are written
// use-video-draft.ts
export interface UseVideoDraftResult {
  draftId: string | null;
  handleUploadComplete: () => void;
}
export const useVideoDraft = (args: {
  form: UseFormReturn<VideoFormData>;
  preGeneratedId: string;
  isEditMode: boolean;
  getArtistDetails: () => VideoArtistDetail[];
}) => UseVideoDraftResult;
```

VideoForm behavior: on draft success the URL is swapped with `globalThis.history.replaceState` (NO Next navigation — the mounted form and all its state survive; a mid-fill refresh resumes on the edit page). Submit becomes the update path (`isPersisted = isEditMode || draftId !== null`), the enrichment panel gate becomes "a row exists AND watched category is MUSIC", and a successful draft-mode save navigates to `/admin/videos`. Draft failure = today's behavior (create-on-submit), silently (the action logs server-side).

- [ ] **Step 1: Failing `use-video-upload` test** — extend the existing spec: a successful upload invokes `onUploadComplete` after the hidden fields are written; a failed upload does not. Implement by threading the callback through `ApplyResultDeps` and calling it at the end of the success branch of `applyUploadResult`.

- [ ] **Step 2: Failing `use-video-draft` tests** (`renderHook`; mock `createVideoDraftAction`; stub `globalThis.history.replaceState` with `vi.spyOn(globalThis.history, 'replaceState')`):

```typescript
it('creates the draft from a form snapshot and swaps the URL', async () => {
  vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
  const { result } = renderHook(() =>
    useVideoDraft({ form, preGeneratedId: ID, isEditMode: false, getArtistDetails: () => [] })
  );
  act(() => result.current.handleUploadComplete());
  await waitFor(() => expect(result.current.draftId).toBe(ID));
  expect(createVideoDraftAction).toHaveBeenCalledWith(
    expect.objectContaining({ preGeneratedId: ID, s3Key: form.getValues('s3Key') })
  );
  expect(historySpy).toHaveBeenCalledWith(null, '', `/admin/videos/${ID}`);
});

it('never fires in edit mode, twice, or after a failure keeps create mode', async () => {
  // isEditMode: true → action not called;
  // two rapid calls → action called once;
  // action → { success: false } → draftId stays null, no URL swap.
});
```

- [ ] **Step 3: Implement `use-video-draft.ts`** ('use client', MPL header):

```typescript
import { useCallback, useRef, useState } from 'react';

import { createVideoDraftAction } from '@/lib/actions/create-video-draft-action';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { UseFormReturn } from 'react-hook-form';

interface UseVideoDraftArgs {
  form: UseFormReturn<VideoFormData>;
  preGeneratedId: string;
  isEditMode: boolean;
  getArtistDetails: () => VideoArtistDetail[];
}

export interface UseVideoDraftResult {
  draftId: string | null;
  handleUploadComplete: () => void;
}

/** Snapshot the in-progress form into the lenient draft payload. */
const buildDraftInput = (
  values: VideoFormData,
  preGeneratedId: string,
  artistDetails: VideoArtistDetail[]
): Record<string, unknown> => ({
  preGeneratedId,
  s3Key: values.s3Key,
  fileName: values.fileName,
  mimeType: values.mimeType,
  category: values.category,
  ...(values.title ? { title: values.title } : {}),
  ...(values.artist ? { artist: values.artist } : {}),
  ...(values.releasedOn ? { releasedOn: values.releasedOn } : {}),
  ...(values.description ? { description: values.description } : {}),
  ...(values.durationSeconds ? { durationSeconds: values.durationSeconds } : {}),
  ...(values.fileSize ? { fileSize: values.fileSize } : {}),
  ...(artistDetails.length > 0 ? { artistDetails } : {}),
});

/**
 * Owns the draft-at-upload-complete transition: snapshot the current form
 * values (corrections made during the upload ride along), create the
 * unpublished draft row, then swap the URL to the edit route WITHOUT
 * navigating (history.replaceState keeps the mounted form alive; a refresh
 * resumes on the edit page). A failed draft leaves `draftId` null and the
 * form silently falls back to create-on-submit — the upload is never blocked.
 */
export const useVideoDraft = ({
  form,
  preGeneratedId,
  isEditMode,
  getArtistDetails,
}: UseVideoDraftArgs): UseVideoDraftResult => {
  const [draftId, setDraftId] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const handleUploadComplete = useCallback((): void => {
    if (isEditMode || draftId !== null || inFlightRef.current) return;
    inFlightRef.current = true;
    void (async () => {
      try {
        const result = await createVideoDraftAction(
          buildDraftInput(form.getValues(), preGeneratedId, getArtistDetails())
        );
        if (result.success) {
          setDraftId(result.videoId);
          globalThis.history.replaceState(null, '', `/admin/videos/${result.videoId}`);
        }
      } catch {
        // Degrade silently — the server action logs; create-on-submit still works.
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [isEditMode, draftId, form, preGeneratedId, getArtistDetails]);

  return { draftId, handleUploadComplete };
};
```

- [ ] **Step 4: Wire VideoForm** (`video-form.tsx`) — surgical edits, extracting where the complexity cap demands:

```typescript
const { draftId, handleUploadComplete } = useVideoDraft({
  form,
  preGeneratedId,
  isEditMode,
  getArtistDetails: buildArtistDetails,
});
const upload = useVideoUpload({
  preGeneratedId,
  form,
  onPosterCandidate: setPosterCandidate,
  onUploadComplete: handleUploadComplete,
});
const categoryValue = useWatch({ control, name: 'category' });
const isPersisted = isEditMode || draftId !== null;
const effectiveVideoId = videoId ?? draftId ?? undefined;
```

NOTE: `useVideoDraft` needs `buildArtistDetails` from `useVideoArtistReview`, which needs `artistValue` from `useWatch` — keep the existing hook order (review hook before draft hook) and move the `useVideoUpload` call after both.

`submitVideo` deps change from `isEditMode`/`videoId` to `isPersisted`/`effectiveVideoId`:

```typescript
const result = isPersisted && effectiveVideoId
  ? await deps.updateVideoAsync({ id: effectiveVideoId, values: data })
  : await deps.createVideoAsync({ ...data, preGeneratedId });
…
toast.success(`Video ${isPersisted ? 'saved' : 'created'} successfully.`);
router.push(isPersisted ? '/admin/videos' : `/admin/videos/${preGeneratedId}`);
```

`EnrichmentPanelMount` changes from the loaded-video gate to the row-exists gate:

```tsx
/** MUSIC-only, row-required: mounts as soon as a draft/edit row exists. */
const EnrichmentPanelMount = ({
  videoId,
  category,
  control,
  onApplyReleaseDate,
}: EnrichmentPanelMountProps): React.ReactElement | null =>
  videoId !== undefined && category === 'MUSIC' ? (
    <VideoEnrichmentErrorBoundary>
      <VideoEnrichmentPanel
        videoId={videoId}
        control={control}
        onApplyReleaseDate={onApplyReleaseDate}
      />
    </VideoEnrichmentErrorBoundary>
  ) : null;
```

with `EnrichmentPanelMountProps` now `{ videoId: string | undefined; category: VideoFormData['category'] | undefined; control; onApplyReleaseDate }`, rendered as `<EnrichmentPanelMount videoId={effectiveVideoId} category={categoryValue} …/>`. (In edit mode the form reset mirrors `video.category`, so behavior is unchanged there.)

- [ ] **Step 5: Update/extend the adjacent specs** — `use-video-upload.spec.tsx` (callback), plus a focused rendering test asserting the panel mounts in create mode once `draftId` exists (mock `useVideoDraft`). Run the whole forms/videos folder: `pnpm exec vitest run src/app/components/forms` + gate.
- [ ] **Step 6: Commit** — `feat(videos): ✨ draft mode form flip at upload`

---

### Task 11: Video-level suggestion wire growth (server)

**Files:**

- Modify: `src/lib/validation/video-enrichment-schema.ts`
- Modify: `src/lib/types/domain/video-enrichment.ts` (`VideoEnrichmentState` gains `description: string | null`)
- Modify: `src/lib/repositories/video-repository.ts` (`getEnrichmentState` selects `description`)
- Modify: `src/lib/services/video-enrichment-service.ts` (persistence rows)
- Modify: `src/lib/actions/apply-video-suggestion-action.ts` (video-level rejection list)
- Modify: `src/lib/services/video-enrichment-fixture.ts`
- Tests: adjacent specs for schema, service, action, repository.

**Interfaces:**

- Produces (wire — Task 13 mirrors this EXACTLY in `bio-generator/src/types.ts`):

```typescript
export const VIDEO_SUGGESTION_FIELDS = [
  'firstName', 'middleName', 'surname', 'akaNames', 'bornOn', 'displayName',
  'releasedOn', 'description', 'featuredArtist',
] as const;
/** Video-level fields (artistId null) — applied client-side into the form. */
export const VIDEO_LEVEL_SUGGESTION_FIELDS = ['releasedOn', 'description', 'featuredArtist'] as const;
export type VideoLevelSuggestionField = (typeof VIDEO_LEVEL_SUGGESTION_FIELDS)[number];
// videoEnrichmentDataSchema.video becomes:
video: z.object({
  releasedOn: videoLevelSuggestionSchema.optional(),
  description: videoDescriptionSuggestionSchema.optional(), // value ≤2000 (2–4 sentences)
  featuredArtists: z.array(videoLevelSuggestionSchema).max(5).optional(),
}).optional(),
```

where `const videoLevelSuggestionSchema = videoSuggestionSchema.omit({ field: true })` and `const videoDescriptionSuggestionSchema = videoLevelSuggestionSchema.extend({ value: z.string().min(1).max(2000) })`. Persistence: `completeCallback` emits pending rows `{ artistId: null, field: 'description' | 'featuredArtist', … }` with dedupe/fence rules below. Apply action rejects `op: 'apply'` for ALL of `VIDEO_LEVEL_SUGGESTION_FIELDS` (client-applied; dismiss still allowed). Fixture emits one description + one featured artist (`'E2E Discovered Feature'`) — Task 16 pins the E2E assertions to these values.

- [ ] **Step 1: Failing schema tests** — `videoEnrichmentDataSchema` accepts a payload with `video.description` (value length 600) and two `video.featuredArtists`; rejects a 6th featured artist and a 2001-char description.

- [ ] **Step 2: Implement schema changes** as pinned above (replace the current inline `video:` object at lines 89–91; keep `releasedOn`'s existing shape via `videoLevelSuggestionSchema`).

- [ ] **Step 3: Failing service tests** (`video-enrichment-service.spec.ts`, existing mock style) for `completeCallback` persistence:

```typescript
it('persists description and featuredArtist rows from the callback', async () => {
  /* rows include
  { artistId: null, field: 'description', value: '…' } and { artistId: null, field: 'featuredArtist', value: 'New Name' } */
});
it('drops a description equal to the stored one (case-insensitive)', async () => {});
it('drops featured artists already linked or already in the artist string', async () => {});
it('fences previously applied/dismissed video-level facts', async () => {});
```

- [ ] **Step 4: Implement service persistence** — extend `VideoEnrichmentState` (domain type) and the `getEnrichmentState` select with `description`; in the service add after `buildReleaseDateRow`:

```typescript
/** Video-level description row — skipped when it matches the stored text. */
const buildDescriptionRow = (
  data: VideoEnrichmentData,
  state: VideoEnrichmentState,
  facts: ExistingFact[]
): CreateSuggestionRow | null => {
  const description = data.video?.description;
  if (!description) return null;
  const value = description.value.trim();
  if (!value) return null;
  if (state.description && normalizeText(state.description) === normalizeText(value)) return null;
  if (matchesExistingFact(facts, null, 'description', value)) return null;
  return {
    artistId: null,
    field: 'description',
    value,
    confidence: description.confidence,
    sources: toJsonSources(description.sources),
    note: description.note ?? null,
  };
};

/** Names already represented on the video (linked rows + artist string parts). */
const knownArtistNames = (
  state: VideoEnrichmentState,
  rows: VideoArtistWithArtist[]
): Set<string> =>
  new Set([
    ...rows.map((row) => displayNameFor(row).toLowerCase()),
    ...splitFeaturedArtists(state.artist).map((part) => part.name.toLowerCase()),
  ]);

/** Featured-artist discovery rows: deduped, fence-checked, never already linked. */
const buildFeaturedArtistRows = ({
  data,
  state,
  rows,
  facts,
}: BuildPendingRowsInput): CreateSuggestionRow[] => {
  const known = knownArtistNames(state, rows);
  const seen = new Set<string>();
  const out: CreateSuggestionRow[] = [];
  for (const suggestion of data.video?.featuredArtists ?? []) {
    const value = suggestion.value.trim();
    const key = value.toLowerCase();
    if (!value || known.has(key) || seen.has(key)) continue;
    if (matchesExistingFact(facts, null, 'featuredArtist', value)) continue;
    seen.add(key);
    out.push({
      artistId: null,
      field: 'featuredArtist',
      value,
      confidence: suggestion.confidence,
      sources: toJsonSources(suggestion.sources),
      note: suggestion.note ?? null,
    });
  }
  return out;
};
```

and in `buildPendingRows`, after the release row:

```typescript
const descriptionRow = buildDescriptionRow(data, state, facts);
if (descriptionRow) out.push(descriptionRow);
out.push(...buildFeaturedArtistRows({ data, state, rows, facts }));
```

- [ ] **Step 5: Apply-action rejection list** — failing test first (`apply on a description/featuredArtist suggestion returns the edit-form error; dismiss succeeds`), then replace the `releasedOn`-only branch (lines 161–169) with:

```typescript
if ((VIDEO_LEVEL_SUGGESTION_FIELDS as readonly string[]).includes(suggestion.field)) {
  return {
    ok: false,
    result: {
      success: false,
      error: 'This suggestion applies in the edit form, not on the server.',
    },
  };
}
```

(import `VIDEO_LEVEL_SUGGESTION_FIELDS`; update the spec that pinned the old release-date message).

- [ ] **Step 6: Fixture** — add to `videoEnrichmentFixture`'s `video` object:

```typescript
description: {
  value:
    'A deterministic E2E description of the track, its artists, and its release context.',
  confidence: 'medium',
  sources: [FIXTURE_MB_SOURCE],
  note: 'Deterministic fixture description (E2E).',
},
featuredArtists: [
  {
    value: 'E2E Discovered Feature',
    confidence: 'medium',
    sources: [FIXTURE_MB_SOURCE],
    note: 'Deterministic fixture featured artist (E2E).',
  },
],
```

- [ ] **Step 7: Run all touched specs + gate.**
- [ ] **Step 8: Commit** — `feat(videos): ✨ description+featured suggestions`

---

### Task 12: Panel UI for the new video-level cards

**Files:**

- Create: `src/app/components/forms/videos/enrichment/video-field-suggestion.tsx`
- Delete: `src/app/components/forms/videos/enrichment/video-release-date-suggestion.tsx` (+ its spec — absorbed)
- Modify: `src/app/components/forms/videos/enrichment/video-enrichment-panel.tsx`
- Modify: `src/app/components/forms/video-form.tsx`
- Tests: new `video-field-suggestion.spec.tsx`, updated panel spec.

**Interfaces:**

- Consumes: `VideoLevelSuggestionField` (T11), `splitFeaturedArtists`/`composeArtistString`, `SuggestionFieldRow` (existing).
- Produces: `VideoEnrichmentPanelProps.onApplyReleaseDate` is REPLACED by `onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void`. Video-level cards render for every `artistId === null` suggestion: releasedOn (apply label `Use this date`, testid `video-release-date-suggestion` — E2E depends on it), description (`Use this description`, testid `video-description-suggestion`, full-text preview), featuredArtist (`Add featured artist`, testid `video-featured-artist-suggestion`, one card per row). Applied state derives from the live form (`useWatch`) exactly like the old release-date card: value equality for releasedOn/description; for featuredArtist, the artist string's split parts contain the value case-insensitively. Never calls the server apply (T11 rejects it); dismiss still goes through the mutation.

- [ ] **Step 1: Failing component tests** (`video-field-suggestion.spec.tsx`): renders value + apply button with the given label; apply fires `onApply`; `isAppliedToForm` shows the row as applied plus the "Applied to the form — Save to persist." status line; dismiss fires `onDismiss`.

- [ ] **Step 2: Implement `VideoFieldSuggestion`** — generalize the deleted card 1:1:

```tsx
interface VideoFieldSuggestionProps {
  suggestion: EnrichmentSuggestion;
  currentValue: string | null;
  isAppliedToForm: boolean;
  applyLabel: string;
  testId: string;
  onApply: () => void;
  onDismiss: () => void;
  isBusy: boolean;
}

/**
 * One video-level suggestion (releasedOn/description/featuredArtist). Apply
 * writes into the mounted RHF form via the parent and NEVER calls the apply
 * action — the server rejects video-level applies because a `videos.detail`
 * refetch would wipe dirty edits. Applied state derives from the live form.
 */
export const VideoFieldSuggestion = ({
  suggestion,
  currentValue,
  isAppliedToForm,
  applyLabel,
  testId,
  onApply,
  onDismiss,
  isBusy,
}: VideoFieldSuggestionProps): React.ReactElement => {
  const displayed: EnrichmentSuggestion =
    isAppliedToForm && suggestion.status === 'pending'
      ? { ...suggestion, status: 'applied' }
      : suggestion;
  return (
    <div data-testid={testId} className="space-y-2">
      <ul>
        <SuggestionFieldRow
          suggestion={displayed}
          currentValue={currentValue}
          isBusy={isBusy}
          applyLabel={applyLabel}
          onApply={onApply}
          onDismiss={onDismiss}
        />
      </ul>
      {isAppliedToForm ? (
        <p role="status" className="text-sm text-zinc-700">
          Applied to the form — Save to persist.
        </p>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 3: Panel list** — replace `findReleaseDateSuggestion` + the single release block with a `VideoLevelSuggestionList` child component (own file section inside the panel file is fine) that `useWatch`es `releasedOn`, `description`, and `artist` once and maps `data.suggestions.filter((s) => s.artistId === null)` to `VideoFieldSuggestion` cards with per-field `applyLabel`/`testId`/applied checks:

```typescript
const isFeaturedApplied = (artistValue: string, name: string): boolean =>
  splitFeaturedArtists(artistValue).some(
    (part) => part.name.toLowerCase() === name.trim().toLowerCase()
  );
```

Thread `onApplyVideoSuggestion` through `EnrichmentResults`/`EnrichmentPanelBody` in place of `onApplyReleaseDate` (`onApply: () => onApplyVideoSuggestion(suggestion.field as VideoLevelSuggestionField, suggestion.value)` — narrow via the T11 const, not a cast: `toVideoLevelField(field): VideoLevelSuggestionField | null`).

- [ ] **Step 4: VideoForm handler** — replace `handleApplyReleaseDate`:

```typescript
const handleApplyVideoSuggestion = useCallback(
  (field: VideoLevelSuggestionField, value: string): void => {
    if (field === 'featuredArtist') {
      const parts = splitFeaturedArtists(form.getValues('artist'));
      const [primary, ...featured] = parts;
      const composed = primary
        ? composeArtistString(primary.name, [...featured.map((part) => part.name), value])
        : value;
      setValue('artist', composed, { shouldDirty: true, shouldValidate: true });
      return;
    }
    setValue(field, value, { shouldDirty: true, shouldValidate: true });
  },
  [form, setValue]
);
```

(An empty artist degrades to the featured name becoming primary — test it.) Update `EnrichmentPanelMount` prop plumbing accordingly.

- [ ] **Step 5: Update panel spec** (apply-description fills the form; featured apply rewrites the string; releasedOn behavior unchanged), delete the absorbed component + spec, run `pnpm exec vitest run src/app/components/forms` + gate.
- [ ] **Step 6: Commit** — `feat(videos): ✨ video-level suggestion cards`

---

### Task 13: Lambda wire schemas + MusicBrainz recording search

**Files:**

- Modify: `bio-generator/src/types.ts` (lines 309–341)
- Modify: `bio-generator/src/musicbrainz.ts`
- Tests: `bio-generator/src/musicbrainz.spec.ts` (exists — follow its fetch-mock pattern), `bio-generator/src/types.spec.ts` if present.

**Interfaces:**

- Produces: `types.ts` mirrors Task 11 EXACTLY — `videoSuggestionSchema.field` enum gains `'description'` and `'featuredArtist'`; `videoEnrichmentDataSchema.video` becomes `{ releasedOn?, description? (value ≤2000), featuredArtists?: max 5 }`. And:

```typescript
export interface MusicBrainzRecordingCredit { mbid: string | null; name: string }
export interface MusicBrainzRecordingCandidate {
  rid: string;
  title: string;
  score: number;
  firstReleaseDate: string | null;
  credits: MusicBrainzRecordingCredit[];
}
export const searchRecordingCandidates = async (
  artist: string, title: string, limit = 5, fetchFn: FetchFn = fetch, options: FetchRetryOptions = {}
): Promise<MusicBrainzRecordingCandidate[]>;
```

Sleeps `MB_RATE_LIMIT_MS` BEFORE requesting (it follows/precedes other MB calls); best-effort `[]` on failure.

- [ ] **Step 1: Failing tests** — mocked fetch returns a recordings payload; assert query URL contains `recording%3A%22Song%22` and `artist%3A%22Alpha%22`, credits map `artist.id`/`artist.name` with fallback to the credit `name`, `first-release-date` trims to null when empty, quote-escaping (`Al"pha` → `Al\"pha`), and a failed fetch resolves `[]`.

- [ ] **Step 2: Run to verify failure** — `pnpm --dir bio-generator exec vitest run src/musicbrainz.spec.ts`

- [ ] **Step 3: Implement**:

```typescript
interface MbRecordingSearchResponse {
  recordings?: Array<{
    id?: string;
    title?: string;
    score?: number;
    'first-release-date'?: string;
    'artist-credit'?: Array<{ name?: string; artist?: { id?: string; name?: string } }>;
  }>;
}

const toRecordingCredits = (
  credit: NonNullable<MbRecordingSearchResponse['recordings']>[number]['artist-credit']
): MusicBrainzRecordingCredit[] =>
  (credit ?? [])
    .map((entry) => ({
      mbid: entry.artist?.id ?? null,
      name: entry.artist?.name ?? entry.name ?? '',
    }))
    .filter((entry) => entry.name !== '');

/** Escape quotes/backslashes inside a quoted Lucene query term. */
const escapeQueryTerm = (value: string): string => value.replace(/(["\\])/g, '\\$1');

/**
 * Searches MusicBrainz recordings by artist + title together. A matched
 * recording's artist-credit yields the canonical credited (stage) names for
 * the primary and every featured artist, plus a first-release date. Sleeps
 * the rate limit BEFORE requesting. Best-effort: failures return [].
 */
export const searchRecordingCandidates = async (
  artist: string,
  title: string,
  limit = 5,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<MusicBrainzRecordingCandidate[]> => {
  await (options.sleep ?? sleep)(MB_RATE_LIMIT_MS);
  const query = `recording:"${escapeQueryTerm(title)}" AND artist:"${escapeQueryTerm(artist)}"`;
  const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
  try {
    const body = await request<MbRecordingSearchResponse>(url, { ...options, fetchFn });
    return (body.recordings ?? [])
      .filter((rec): rec is { id: string; title: string } & typeof rec =>
        Boolean(rec.id && rec.title)
      )
      .map((rec) => ({
        rid: rec.id,
        title: rec.title,
        score: rec.score ?? 0,
        firstReleaseDate: rec['first-release-date']?.trim() || null,
        credits: toRecordingCredits(rec['artist-credit']),
      }));
  } catch (err) {
    logEvent('warn', 'musicbrainz_recording_search_failed', { artist, title, error: String(err) });
    return [];
  }
};
```

Apply the `types.ts` schema growth (same shapes as Task 11, keeping the lockstep comments current).

- [ ] **Step 4: Run bio-generator suite** — `pnpm --dir bio-generator exec vitest run` — plus web gate (types didn't cross, but run it).
- [ ] **Step 5: Commit** — `feat(lambda): ✨ MB recording search + wire growth`

---

### Task 14: Recording-first enrichment in the Lambda

**Files:**

- Modify: `bio-generator/src/video-enrichment.ts`
- Test: `bio-generator/src/video-enrichment.spec.ts` (extend `buildDeps`/`baseInput` helpers)

**Interfaces:**

- Consumes: `searchRecordingCandidates` (T13; added to `VideoEnrichmentDeps` and `defaultDeps`).
- Produces, inside `runVideoEnrichment`:
  - `export const RECORDING_MIN_SCORE = 90` — the best recording is the first candidate with `score >= RECORDING_MIN_SCORE` and `namesEqual(candidate.title, input.title)`.
  - **Credit fast-path**: an input artist whose name (or `known.displayName`/`akaNames` entry) `namesEqual`-matches a credit skips the candidate search — `lookupArtistIdentity(credit.mbid)` runs directly with a synthetic candidate `{ mbid: credit.mbid, name: credit.name, score: 100, sortName: null, aliases: [] }` and `creditCorroborated: true`.
  - **Confidence rubric extension** — `ConfidenceSignals` gains `creditCorroborated: boolean` (default false at existing call sites):

```typescript
export const confidenceFor = ({
  score,
  corroborated,
  occupationOk,
  singleToken,
  creditCorroborated,
}: ConfidenceSignals): VideoSuggestion['confidence'] => {
  if (singleToken && !corroborated && !creditCorroborated) return 'medium';
  if (creditCorroborated && corroborated) return 'high';
  return score >= MB_HIGH_CONFIDENCE_SCORE && corroborated && occupationOk ? 'high' : 'medium';
};
```

- **Canonical displayName**: with a credit match, `displayNameSuggestion` uses the credited name (already the candidate name via the synthetic candidate — no extra code beyond the fast path).
- **Featured discovery**: credits matching NO input artist become `video.featuredArtists` entries — `{ value: credit.name, confidence: 'medium', sources: [{ url: `https://musicbrainz.org/recording/${recording.rid}`, label: 'MusicBrainz' }], note: 'Credited on the matched recording but not linked to this video.' }`.
- **Split validation**: (a) confirmed — split parts each matching a credit get the fast path above (that IS the confirmation); (b) unified — when `input.artists.length > 1` and the recording has EXACTLY ONE credit whose name differs from the primary's name, emit an artist-level `displayName` suggestion on the primary with `note: 'MusicBrainz credits this recording to a single artist — the split may be wrong.'`, confidence `'medium'` (this one bypasses the "only when the app has none" gate deliberately).
- **Release date**: a full-date `recording.firstReleaseDate` differing from `input.releasedOn` produces the structured `video.releasedOn` `{ value, confidence: 'medium', sources: [recording URL] }`; when the web adjudication returns the SAME date, merge to `confidence: 'high'` with combined sources; when web disagrees or is null, the MB row wins; no MB date → today's web-only behavior.

- [ ] **Step 1: Write failing tests** covering each bullet (extend the existing helper factories; add a `recording()` factory):

```typescript
const recording = (
  over: Partial<MusicBrainzRecordingCandidate> = {}
): MusicBrainzRecordingCandidate => ({
  rid: 'rec-1',
  title: 'Song',
  score: 97,
  firstReleaseDate: '2019-05-01',
  credits: [{ mbid: 'mb-1', name: 'Alpha Canonical' }],
  ...over,
});
```

Tests: credit fast-path skips `searchArtistCandidates`; `creditCorroborated && corroborated` → high; featured discovery emits `video.featuredArtists` for the unmatched credit; single-credit unified suggestion on the primary; MB release date beats web disagreement / merges to high on agreement; a low-score or title-mismatched recording is ignored (behavior identical to today); recording-search failure degrades to today's flow.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — key structure (keep each function under the complexity cap):

```typescript
const findMatchedRecording = async (
  input: VideoEnrichmentInput,
  deps: VideoEnrichmentDeps
): Promise<MusicBrainzRecordingCandidate | null> => {
  const candidates = await deps.searchRecordingCandidates(input.artistDisplay, input.title, 5);
  return (
    candidates.find((c) => c.score >= RECORDING_MIN_SCORE && namesEqual(c.title, input.title)) ??
    null
  );
};

const knownNamesFor = (artist: InputArtist): string[] => [
  artist.name,
  ...(artist.known?.displayName ? [artist.known.displayName] : []),
  ...(artist.known?.akaNames ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),
];

const creditFor = (
  artist: InputArtist,
  recording: MusicBrainzRecordingCandidate | null
): MusicBrainzRecordingCredit | null =>
  recording?.credits.find((credit) =>
    knownNamesFor(artist).some((name) => namesEqual(credit.name, name))
  ) ?? null;
```

`structuredSuggestions` gains a `credit` parameter: when `credit?.mbid`, build the gated list as `[syntheticCandidate]` instead of searching, and pass `creditCorroborated: true` into the signals. `runVideoEnrichment` calls `findMatchedRecording` right after the first `report('musicbrainz', …)`, threads `creditFor(artist, recording)` per artist, collects `discoveredFeatured` from unmatched credits, computes the unified-name suggestion, and merges the MB release date with the web adjudication result via a small `mergeReleaseDate(mbDate, recordingUrl, webSuggestion, adminReleasedOn)` helper. Return shape:

```typescript
return {
  artists,
  ...(video.releasedOn || video.description || video.featuredArtists ? { video } : {}),
  model,
};
```

(`video.description` arrives in Task 15 — leave the field plumbed but unset here.)

- [ ] **Step 4: Run** `pnpm --dir bio-generator exec vitest run` + web gate.
- [ ] **Step 5: Commit** — `feat(lambda): ✨ recording-first artist lookup`

---

### Task 15: Description synthesis in the Lambda

**Files:**

- Create: `bio-generator/src/video-description.ts`
- Modify: `bio-generator/src/release-date.ts` (export the private `adjudicate` + its `AdjudicationRun` type)
- Modify: `bio-generator/src/video-enrichment.ts` (integration)
- Tests: `bio-generator/src/video-description.spec.ts` + enrichment spec extension.

**Interfaces:**

- Consumes: `adjudicate` (newly exported), `enforceSourceSubset` pattern, `AdjudicationDeps`, `DEFAULT_GEMINI_MODEL`.
- Produces:

```typescript
export interface VideoDescriptionArgs {
  title: string;
  artistDisplay: string;
  releasedOn?: string;
  /** Structured facts gathered earlier this run, one plain line each. */
  facts: string[];
  serperKey: string;
  geminiKey: string;
  model?: string;
}
export const resolveDescriptionSuggestion = async (
  args: VideoDescriptionArgs,
  deps: AdjudicationDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null>;
```

2–4 sentence editorial description from web evidence + provided facts (song, artists, release context — NO invented visual claims), value ≤2000, confidence FIXED at `'medium'` (LLM-synthesized), sources = subset-enforced evidence URLs. Never throws. Integrated into `runVideoEnrichment` after the release-date adjudication (still under the `adjudicating` stage), only when the Serper key exists; `facts` lines = credited names, MB first-release date, and admin date when present. Emitted as `video.description`.

- [ ] **Step 1: Failing tests** — mock `searchWeb`/`requestJson`: returns the suggestion with subset-enforced sources; null when Gemini returns `description: null` or when no evidence; confidence always `'medium'` even when the schema answer says high; a throw degrades to null; the user prompt contains the provided facts lines and the no-visual-claims instruction.

- [ ] **Step 2: Implement** — export `adjudicate` (and the types it needs) from `release-date.ts`, then:

```typescript
export const descriptionAdjudicationSchema = z.object({
  description: z.string().max(1200).nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
});

const descriptionSystemPrompt = [
  'You write a short, factual editorial description (2-4 sentences) of a music',
  'video page from web search evidence and verified facts.',
  'Describe the song, its artists, and its release context only.',
  'NEVER describe visuals or events in the video itself.',
  'Use ONLY the evidence and facts provided; never invent facts, dates, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

const buildDescriptionPrompt =
  ({ title, artistDisplay, releasedOn, facts }: VideoDescriptionArgs) =>
  (evidence: string): string =>
    [
      `Video: "${title}" by ${artistDisplay}.`,
      releasedOn ? `Release date: ${releasedOn}.` : '',
      facts.length > 0 ? `VERIFIED FACTS:\n${facts.map((fact) => `- ${fact}`).join('\n')}` : '',
      'EVIDENCE:',
      evidence,
      '',
      'Return JSON: {"description": "2-4 sentences" or null,',
      '"sourceUrls": [evidence links used], "rationale": "<= 300 chars"}',
    ]
      .filter(Boolean)
      .join('\n');

/**
 * Synthesizes a short editorial description from gathered facts + two web
 * searches. Confidence is FIXED at medium (LLM-synthesized prose). Never
 * throws — failures degrade to null and the run continues.
 */
export const resolveDescriptionSuggestion = async (
  args: VideoDescriptionArgs,
  deps: AdjudicationDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null> => {
  try {
    const outcome = await adjudicate(
      {
        queries: [
          `"${args.artistDisplay}" "${args.title}"`,
          `${args.artistDisplay} ${args.title} song`,
        ],
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: descriptionAdjudicationSchema,
        systemPrompt: descriptionSystemPrompt,
        buildUserPrompt: buildDescriptionPrompt(args),
      },
      deps
    );
    if (!outcome) return null;
    const sourceUrls = enforceSourceSubset(outcome.parsed.sourceUrls, outcome.provided);
    const description = outcome.parsed.description?.trim();
    if (!description || sourceUrls.length === 0) return null;
    return {
      value: description,
      confidence: 'medium',
      sources: sourceUrls.map((url) => ({ url })),
      note: outcome.parsed.rationale,
    };
  } catch (err) {
    logEvent('warn', 'video_description_failed', { error: toErrorMessage(err) });
    return null;
  }
};
```

(`enforceSourceSubset` is private in release-date.ts — export it alongside `adjudicate`.) Add `resolveDescriptionSuggestion` to `VideoEnrichmentDeps` + `defaultDeps` and call it in `runVideoEnrichment` with facts built from the recording match (credits/date) and admin inputs; attach to `video.description`.

- [ ] **Step 3: Run bio-generator suite + web gate.**
- [ ] **Step 4: Commit** — `feat(lambda): ✨ synthesized description suggestion`

---

### Task 16: E2E — draft-upload keystone spec + suite reconciliation

**Files:**

- Create: `e2e/helpers/e2e-db.ts`
- Create: `e2e/tests/admin-video-draft-upload.spec.ts`
- Modify: `e2e/tests/admin-video-enrichment.spec.ts`
- Modify: `e2e/tests/admin-dashboard.spec.ts`, `e2e/tests/admin-videos-list.spec.ts` (toPass hardening)

**Interfaces:**

- Consumes: the whole feature; fixture values pinned in T11 (`'E2E Discovered Feature'`, the deterministic description); `adminPage` fixture; `scrollToLoad` if list interaction is needed.
- Produces: `deleteVideoCascade(videoId: string): Promise<void>` in `e2e/helpers/e2e-db.ts` — hardcoded to `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` per the isolation mandate (mirror the Prisma construction in `e2e/helpers/seed-test-db.ts`; delete suggestion/artist/producer join rows then the video).

**Known hazard (pinned resolution):** this spec creates a real Video row mid-run, and two specs pin seed-derived counts — `admin-dashboard.spec.ts` (`'13'`, `'11 published · 2 draft'`) and `admin-videos-list.spec.ts` (`toHaveCount(9)`, draft-filter `toHaveCount(1)`). Under parallel workers they can observe the transient row. Resolution: (a) the draft spec deletes its row in a `finally` via `deleteVideoCascade`, and (b) the pinned assertions get wrapped in `expect(async () => { await page.reload(); … }).toPass({ timeout: 60_000 })` so they converge once the transient row is gone. Do NOT weaken the pinned values themselves.

- [ ] **Step 1: `e2e-db.ts` helper**:

```typescript
import { PrismaClient } from '@prisma/client';

/** E2E isolation mandate: only ever the local Docker Mongo. */
const E2E_DATABASE_URL = 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

/** Hard-delete a spec-created video and its join/suggestion rows. */
export const deleteVideoCascade = async (videoId: string): Promise<void> => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.E2E_DATABASE_URL ?? E2E_DATABASE_URL } },
  });
  try {
    await prisma.videoEnrichmentSuggestion.deleteMany({ where: { videoId } });
    await prisma.videoArtist.deleteMany({ where: { videoId } });
    await prisma.videoProducer.deleteMany({ where: { videoId } });
    await prisma.video.deleteMany({ where: { id: videoId } });
  } finally {
    await prisma.$disconnect();
  }
};
```

- [ ] **Step 2: Keystone spec** (`admin-video-draft-upload.spec.ts`) — remember the repo lessons: drive comboboxes by `getByRole('combobox', { name })`, never `.fill()` them; codec-agnostic media assertions; no clicking transient buttons.

```typescript
import { expect, test } from '../fixtures/auth.fixture';
import { deleteVideoCascade } from '../helpers/e2e-db';

// Upload → draft auto-created → panel enriches PRE-SAVE → apply description +
// featured artist → Save → verify persistence. The E2E upload fake
// (NEXT_PUBLIC_E2E_MODE) makes the multipart step instant and offline.
test('upload auto-creates a draft that enriches before the first save', async ({ adminPage }) => {
  test.slow();
  let videoId: string | undefined;
  try {
    await adminPage.goto('/admin/videos/new');
    await adminPage
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'E2E Draft Artist - E2E Draft Song (feat. E2E Draft Guest) [Official Video].mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('e2e-not-a-real-video'),
      });

    // Filename parser prefill (container tags absent on garbage bytes).
    await expect(adminPage.getByLabel('Title')).toHaveValue('E2E Draft Song');

    // Draft created at upload-complete → URL swaps to the edit route in place.
    await adminPage.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/);
    videoId = adminPage.url().split('/').pop();

    // Enrichment panel mounts PRE-SAVE and completes from the fake fixture.
    const panel = adminPage.getByTestId('video-enrichment-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Enriched')).toBeVisible({ timeout: 30_000 });

    // Apply the description suggestion into the form.
    await panel
      .getByTestId('video-description-suggestion')
      .getByRole('button', { name: 'Use this description' })
      .click();
    await expect(adminPage.getByLabel('Description')).toHaveValue(/deterministic E2E description/);

    // Apply the discovered featured artist — the artist string gains a feat clause.
    await panel
      .getByTestId('video-featured-artist-suggestion')
      .getByRole('button', { name: 'Add featured artist' })
      .click();

    // Save persists through the update path and returns to the list.
    await adminPage.getByRole('button', { name: 'Save' }).click();
    await adminPage.waitForURL(/\/admin\/videos$/);

    // The applied featured artist became a linked FEATURED shell.
    await expect(async () => {
      const response = await adminPage.request.get(
        '/api/artists?search=E2E%20Discovered%20Feature'
      );
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(JSON.stringify(body)).toContain('E2E Discovered Feature');
    }).toPass({ timeout: 20_000 });
  } finally {
    if (videoId) await deleteVideoCascade(videoId);
  }
});
```

Adjust locators to the real DOM while implementing (e.g. the artist field is a combobox — assert its trigger text contains `feat. E2E Discovered Feature` via `getByRole('combobox', { name: 'Artist / Creator' })` or the featured-pills region, whichever the form renders; check `video-metadata-section.tsx` first). Verify the artists API route path/shape against `admin-video-artist-review.spec.ts` lines 97–116 and copy its polling pattern.

- [ ] **Step 3: Update `admin-video-enrichment.spec.ts`** — the fixture (T11) now also emits description + featuredArtist rows on the seeded archived video: extend the main test to assert both cards render after the run, apply the description (form field fills, card flips to applied), and dismiss the featured-artist card (dismiss is server-side and allowed). Mind `toHaveCount` counting hidden elements.

- [ ] **Step 4: Harden the count-pinning specs** — in `admin-dashboard.spec.ts` wrap the tile assertions:

```typescript
await expect(async () => {
  await adminPage.reload();
  const tile = adminPage
    .getByRole('list', { name: /section overview/i })
    .getByRole('listitem')
    .filter({ has: adminPage.getByRole('link', { name: 'Videos', exact: true }) });
  await expect(tile.getByText('13', { exact: true })).toBeVisible({ timeout: 2_000 });
  await expect(tile.getByText('11 published · 2 draft')).toBeVisible({ timeout: 2_000 });
}).toPass({ timeout: 60_000 });
```

and in `admin-videos-list.spec.ts` wrap the `toHaveCount(9)` (line 69) and the draft-filter `toHaveCount(1)` (line 99 region) the same way (reload + short inner timeout inside `toPass`). Add a one-line comment on each: `// toPass: converges past transient rows created by mutating specs (draft-upload).`

- [ ] **Step 5: Run E2E locally** — `pnpm run e2e:docker:up`, then:
  - `pnpm exec playwright test admin-video-draft-upload admin-video-enrichment --retries=0`
  - Regression + race stress per the repo lesson: `pnpm exec playwright test admin-video-draft-upload admin-dashboard admin-videos-list admin-video-form admin-video-artist-review --workers=8 --repeat-each=4 --retries=0`
  - Full suite once: `pnpm run test:e2e`
    Then `pnpm run e2e:docker:down`. If the stress run flakes on the count pins, widen the `toPass` timeout before weakening anything else, and re-diagnose the true root cause in the HANGING spec, not the collateral one.

- [ ] **Step 6: Full gate + commit** — `test(e2e): ✅ draft-upload flow + count hardening`

---

## Self-Review (performed while writing)

1. **Spec coverage**: §1 draft row → T6/T8/T9/T10 (+T7 double-run fix); §2 extraction → T2/T3/T4/T5 (client) + T13/T14 (Lambda: recording-first, split validation, featured discovery); §3 description → T11/T12 (web) + T15 (Lambda synthesis), whitelist growth in T11; §4 poster → T1; error handling and idempotency embedded in T8/T10; testing section → per-task TDD + T16.
2. **Pinned interpretation choices** (spec left these open — flag to the user in review if wrong): multi-primary separators are candidates-only (`splitNameCandidates` + explicit "Apply split" in the review UI) — the CANONICAL splitter never splits on `&`/`,`/`x`, so a legit band name ("Tyler, The Creator") can survive a save; the unified-name Lambda suggestion rides the primary artist's `displayName` field (the video-level whitelist stays exactly `releasedOn | description | featuredArtist` per §3); the URL flip uses `history.replaceState`, not `router.replace`, so the mounted form (and any keystrokes after upload-complete) survives — the spec's stated goal is refresh-resume, which this satisfies.
3. **Type consistency check**: `VideoLevelSuggestionField` defined in T11, consumed in T12; `splitNameCandidates` defined in T2, consumed in T3/T5; `parseDurationSeconds`/`parseFileSize` exported in T8 before use; `searchRecordingCandidates`/`MusicBrainzRecordingCandidate` defined in T13, consumed in T14; `adjudicate`/`enforceSourceSubset` exported in T15 where first needed; fixture value `'E2E Discovered Feature'` (T11) matches T16 assertions.
4. **Ordering**: T2 before T3/T5; T3 before T4/T8; T6 before T8; T8/T9 before T10; T11 before T12/T16; T13 before T14/T15. Unit suites stay green at every commit; E2E reconciliation is deliberately last (all tasks land in one PR).
