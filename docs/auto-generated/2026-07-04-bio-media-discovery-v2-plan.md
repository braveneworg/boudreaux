# Bio Media Discovery v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bigger, subject-verified media discovery (≤100 links, ≤100 images incl. album covers) for the bio generator, atom-node draggable links in the editor, global link underline, tighter figure wrap, and a sticky-rail palette redesign with click-to-insert.

**Architecture:** Evolve the existing lambda pipeline in place (new sources: Commons categories, Cover Art Archive; new Gemini-vision verification stage, fail-closed for scraped images) and mirror the optional-only wire changes in the app. The editor's Link mark is replaced by a `BioLink` inline atom node that serializes to plain `<a>`, so the sanitizer and public renderer are untouched. Spec: `docs/auto-generated/2026-07-03-bio-media-discovery-v2-design.md`.

**Tech Stack:** TypeScript 6 strict, Next.js 16 / React 19, TipTap v3 (ProseMirror), Zod 4, Prisma 6 + MongoDB, Vitest 4, Playwright, AWS Lambda (esbuild ESM, no AI SDKs — raw `fetch` to Gemini/Jina REST).

## Global Constraints

- Every commit passes ALL FOUR gates first: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` (run from the worktree root: `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat+bio-media-discovery-v2`).
- The `bio-generator/` workspace is a SEPARATE pnpm project: its tests run with `cd bio-generator && pnpm run test:run` (vitest 4, `describe/it/expect/vi` are globals — never import them) and its types with `cd bio-generator && pnpm exec tsc --noEmit`. Repo-root `pnpm run lint` covers it.
- TDD is non-negotiable: write the failing test, run it, watch it fail, implement, watch it pass, then commit.
- Arrow functions only (`const f = () => …`); named exports only; `interface` for object shapes; no `any`, no `!`, no lint/type suppressions of any kind.
- Every NEW source file starts with the MPL header (copy from `HEADER.txt`):
  ```
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  ```
- Import via aliases (`@/lib/*`, `@/components/*`, `@/ui/*`, `@/hooks/*`) — never `../../`. Inside `bio-generator/src` use relative `./x.js` imports (ESM, `.js` suffix) matching the existing files.
- `src/lib/validation/bio-generation-schema.ts` and `bio-generator/src/types.ts` are kept in LOCKSTEP by hand (they cannot share a module) — when one changes, the same change lands in the other in the same task.
- Sanitizer allowlists (`src/lib/utils/sanitize-bio-html.ts`) must NOT change in this feature. If a task seems to need a sanitizer change, the task is wrong — stop.
- Commits: Conventional Commits with gitmoji, subject ≤ 50 chars, body lines ≤ 72, NO AI-attribution lines. Branch `feat/bio-media-discovery-v2` (already created; never commit to main).
- New named constants over magic values. Wire-schema additions are optional fields only (backward compatible in both deploy orders).
- Numbers fixed by the approved design: `MAX_LINKS = 100`, `MAX_IMAGES = 100`, `MAX_SCRAPED_IMAGES = 60`, Jina `MAX_RESULTS = 10`, `MAX_COMMONS_CATEGORY_IMAGES = 30`, `MAX_COVER_ART = 40`, vision batch 10 / min confidence 0.5 / per-image fetch cap 1.5 MB / fetch timeout 8 s / fetch concurrency 8, app re-host concurrency 8.

---

## Part A — Lambda (`bio-generator/` workspace)

### Task A1: Wire types — image kind/alt, link `press`, input `releases`, facts chronology

**Files:**

- Modify: `bio-generator/src/types.ts`
- Test: `bio-generator/src/types.spec.ts`

**Interfaces:**

- Consumes: nothing (first task).
- Produces (used by every later task):
  - `bioImageSchema` gains `kind: z.enum(['photo', 'cover']).nullable().optional()` and `alt: z.string().nullable().optional()` → `BioImage.kind?: 'photo' | 'cover' | null`, `BioImage.alt?: string | null`.
  - `bioLinkSchema.kind` enum gains `'press'`.
  - `bioGenerationInputSchema` gains `releases: z.array(z.object({ title, releasedOn?, url })).max(100).optional()` → `BioGenerationInput['releases']`.
  - `ArtistFacts` gains `chronology?: string[]` and `internalReleaseUrls?: string[]`.

- [ ] **Step 1: Write the failing tests** — append to `bio-generator/src/types.spec.ts`:

```ts
describe('bio media discovery v2 wire types', () => {
  it('accepts image kind and alt', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      kind: 'cover',
      alt: 'Album cover for Example',
    };
    expect(bioImageSchema.parse(image).kind).toBe('cover');
    expect(bioImageSchema.parse(image).alt).toBe('Album cover for Example');
  });

  it('rejects an unknown image kind', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      kind: 'landscape',
    };
    expect(bioImageSchema.safeParse(image).success).toBe(false);
  });

  it('accepts the press link kind', () => {
    const link = { label: 'Interview', url: 'https://example.com/i', kind: 'press' };
    expect(bioLinkSchema.parse(link).kind).toBe('press');
  });

  it('accepts input releases with title, releasedOn, and url', () => {
    const input = {
      artistId: 'a1',
      displayName: 'Ceschi',
      releases: [{ title: 'Broken Bone Ballads', releasedOn: '2015-04-14', url: '/releases/abc' }],
    };
    expect(bioGenerationInputSchema.parse(input).releases?.[0]?.title).toBe('Broken Bone Ballads');
  });

  it('rejects a malformed releasedOn date', () => {
    const input = {
      artistId: 'a1',
      displayName: 'Ceschi',
      releases: [{ title: 'X', releasedOn: '2015/04/14', url: '/releases/abc' }],
    };
    expect(bioGenerationInputSchema.safeParse(input).success).toBe(false);
  });
});
```

Ensure the spec file imports `bioImageSchema`, `bioLinkSchema`, `bioGenerationInputSchema` from `./types.js` (extend the existing import line).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bio-generator && pnpm exec vitest run src/types.spec.ts`
Expected: FAIL — `kind`/`alt`/`press`/`releases` rejected by current schemas.

- [ ] **Step 3: Implement** in `bio-generator/src/types.ts`:

In `bioImageSchema`, after `isPrimary: z.boolean(),` add:

```ts
  /** Subject classification from provenance or the vision pass. */
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  /** Short accessible description, written by the vision pass when available. */
  alt: z.string().nullable().optional(),
```

Replace the `bioLinkSchema` kind line with:

```ts
  kind: z
    .enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'press', 'other'])
    .optional(),
```

In `bioGenerationInputSchema`, after `formedOn: isoDate.optional(),` add:

```ts
  /**
   * The label's own published releases for this artist — authoritative
   * chronology anchors AND allow-listed internal link targets
   * (`/releases/<id>` paths) the prose may cite.
   */
  releases: z
    .array(
      z.object({
        title: z.string().min(1),
        releasedOn: isoDate.optional(),
        url: z.string().min(1),
      })
    )
    .max(100)
    .optional(),
```

In `interface ArtistFacts`, after `sourceUrls?: string[];` add:

```ts
  /**
   * Structured timeline lines ("2015: released \"Broken Bone Ballads\"") built
   * from MusicBrainz release-group dates and the label's own releases. Dates
   * in prose must come from here or the labeled facts — not model recall.
   */
  chronology?: string[];
  /** Site-relative `/releases/<id>` paths the prose may link, labeled by title. */
  internalReleaseUrls?: string[];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bio-generator && pnpm exec vitest run src/types.spec.ts` — Expected: PASS.
Then: `cd bio-generator && pnpm exec tsc --noEmit` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/types.ts bio-generator/src/types.spec.ts
git commit -m "feat: ✨ extend bio wire types for media v2

Adds optional image kind/alt, the press link kind, label releases
on the generation input, and chronology/internal-release fields on
ArtistFacts. All additions optional — backward compatible."
```

---

### Task A2: MusicBrainz — richer url-relations + release-group listing

**Files:**

- Modify: `bio-generator/src/musicbrainz.ts`
- Test: `bio-generator/src/musicbrainz.spec.ts`

**Interfaces:**

- Consumes: `BioLink` from Task A1.
- Produces:
  - `relationToLink` now also maps `discogs`, `youtube`, `video channel`, `soundcloud`, `bandcamp`, `allmusic`, `last.fm` relations (previously dropped) with service labels.
  - `export interface ReleaseGroupSummary { rgMbid: string; title: string; firstReleaseDate: string | null; primaryType: string | null }`
  - `export const listReleaseGroups = async (mbid: string, fetchFn?: FetchFn, options?: FetchRetryOptions): Promise<ReleaseGroupSummary[]>` — browse endpoint, capped at 50, respects the 1100 ms rate-limit sleep BEFORE the request (callers invoke it after other MB calls).

- [ ] **Step 1: Write the failing tests** — append to `bio-generator/src/musicbrainz.spec.ts` (follow the file's existing mock-fetch pattern; it stubs `fetchFn` returning canned JSON):

```ts
describe('service relations', () => {
  const relationsResponse = {
    artists: undefined,
    type: 'Person',
    relations: [
      { type: 'discogs', url: { resource: 'https://www.discogs.com/artist/123' } },
      { type: 'youtube', url: { resource: 'https://www.youtube.com/@ceschi' } },
      { type: 'soundcloud', url: { resource: 'https://soundcloud.com/ceschi' } },
      { type: 'bandcamp', url: { resource: 'https://ceschi.bandcamp.com' } },
      { type: 'allmusic', url: { resource: 'https://www.allmusic.com/artist/x' } },
    ],
  };

  it('maps service relations to labeled links', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-1', name: 'Ceschi' }] }))
      .mockResolvedValueOnce(jsonResponse(relationsResponse));
    const match = await lookupArtist('Ceschi', fetchFn, { sleep: async () => {} });
    const byLabel = new Map(match?.links.map((link) => [link.label, link]));
    expect(byLabel.get('Discogs')?.kind).toBe('other');
    expect(byLabel.get('YouTube')?.kind).toBe('social');
    expect(byLabel.get('SoundCloud')?.kind).toBe('streaming');
    expect(byLabel.get('Bandcamp')?.kind).toBe('streaming');
    expect(byLabel.get('AllMusic')?.kind).toBe('press');
  });
});

describe('listReleaseGroups', () => {
  it('returns titled release groups with first-release dates', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        'release-groups': [
          {
            id: 'rg-1',
            title: 'Broken Bone Ballads',
            'first-release-date': '2015-04-14',
            'primary-type': 'Album',
          },
          { id: 'rg-2', title: 'Untitled', 'first-release-date': '', 'primary-type': null },
        ],
      })
    );
    const groups = await listReleaseGroups('mbid-1', fetchFn, { sleep: async () => {} });
    expect(groups).toEqual([
      {
        rgMbid: 'rg-1',
        title: 'Broken Bone Ballads',
        firstReleaseDate: '2015-04-14',
        primaryType: 'Album',
      },
      { rgMbid: 'rg-2', title: 'Untitled', firstReleaseDate: null, primaryType: null },
    ]);
    expect(String(fetchFn.mock.calls[0][0])).toContain('/release-group?artist=mbid-1');
  });

  it('returns an empty list when the request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await expect(
      listReleaseGroups('mbid-1', fetchFn, { sleep: async () => {}, retries: 0 })
    ).resolves.toEqual([]);
  });
});
```

If the spec file has no `jsonResponse` helper, add one at the top (matching its existing style):

```ts
const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bio-generator && pnpm exec vitest run src/musicbrainz.spec.ts`
Expected: FAIL — service links absent, `listReleaseGroups` not exported.

- [ ] **Step 3: Implement** in `bio-generator/src/musicbrainz.ts`:

After `STREAMING_RELATION_TYPES`, add the service map and rewrite `relationToLink`:

```ts
/**
 * MusicBrainz relation types that map to a named service. Previously dropped
 * entirely; surfaced now so the palette can offer Discogs/YouTube/etc. links
 * with descriptive labels instead of nothing.
 */
const SERVICE_RELATIONS = new Map<string, { label: string; kind: NonNullable<BioLink['kind']> }>([
  ['discogs', { label: 'Discogs', kind: 'other' }],
  ['youtube', { label: 'YouTube', kind: 'social' }],
  ['video channel', { label: 'YouTube', kind: 'social' }],
  ['soundcloud', { label: 'SoundCloud', kind: 'streaming' }],
  ['bandcamp', { label: 'Bandcamp', kind: 'streaming' }],
  ['allmusic', { label: 'AllMusic', kind: 'press' }],
  ['last.fm', { label: 'Last.fm', kind: 'other' }],
]);
```

In `relationToLink`, before the `classifyRelation` branches, add:

```ts
const service = SERVICE_RELATIONS.get(type);
if (service) {
  return { label: service.label, url: resource, kind: service.kind };
}
```

At the end of the file add:

```ts
/** One release group from the browse endpoint — chronology + cover-art seed. */
export interface ReleaseGroupSummary {
  rgMbid: string;
  title: string;
  firstReleaseDate: string | null;
  primaryType: string | null;
}

/** Subset of the release-group browse response we rely on. */
interface MbReleaseGroupResponse {
  'release-groups'?: Array<{
    id?: string;
    title?: string;
    'first-release-date'?: string;
    'primary-type'?: string | null;
  }>;
}

const MAX_RELEASE_GROUPS = 50;

/**
 * Browses the artist's release groups (albums, EPs, singles) — the titles and
 * first-release dates anchor the chronology table, and the MBIDs seed Cover
 * Art Archive lookups. Sleeps the MusicBrainz rate limit BEFORE requesting so
 * it can safely follow other MB calls. Best-effort: failures return [].
 */
export const listReleaseGroups = async (
  mbid: string,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<ReleaseGroupSummary[]> => {
  await (options.sleep ?? sleep)(MB_RATE_LIMIT_MS);
  const url = `${MB_BASE}/release-group?artist=${encodeURIComponent(mbid)}&limit=${MAX_RELEASE_GROUPS}&fmt=json`;
  try {
    const body = await request<MbReleaseGroupResponse>(url, { ...options, fetchFn });
    return (body['release-groups'] ?? [])
      .filter((group): group is { id: string; title: string } & typeof group =>
        Boolean(group.id && group.title)
      )
      .map((group) => ({
        rgMbid: group.id,
        title: group.title,
        firstReleaseDate: group['first-release-date']?.trim() || null,
        primaryType: group['primary-type'] ?? null,
      }));
  } catch (err) {
    logEvent('warn', 'musicbrainz_release_groups_failed', { mbid, error: String(err) });
    return [];
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bio-generator && pnpm exec vitest run src/musicbrainz.spec.ts` — Expected: PASS (existing tests too — the new map must not change wikipedia/official/social/streaming behavior).

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/musicbrainz.ts bio-generator/src/musicbrainz.spec.ts
git commit -m "feat: ✨ surface MB service links + release groups

relationToLink now labels Discogs/YouTube/SoundCloud/Bandcamp/
AllMusic/Last.fm relations instead of dropping them, and
listReleaseGroups browses the artist's release groups for the
chronology table and Cover Art Archive lookups."
```

---

### Task A3: Descriptive link labels + press classification; Jina caps and listening un-skip

**Files:**

- Create: `bio-generator/src/link-labels.ts`
- Test: `bio-generator/src/link-labels.spec.ts`
- Modify: `bio-generator/src/jina.ts`
- Test: `bio-generator/src/jina.spec.ts`

**Interfaces:**

- Consumes: `BioLink` from Task A1.
- Produces (used by Task A7):
  - `export const deriveLinkLabel = ({ title, url, artistName }: { title: string | null; url: string; artistName: string }): string`
  - `export const classifyReferenceKind = (title: string | null): 'press' | 'other'`
  - `jina.ts` constants become `MAX_RESULTS = 10`, `MAX_SCRAPED_IMAGES = 60`; `searchArtistSources` no longer skips listening-service pages when collecting images.

- [ ] **Step 1: Write the failing tests** — create `bio-generator/src/link-labels.spec.ts` (MPL header first):

```ts
import { classifyReferenceKind, deriveLinkLabel } from './link-labels.js';

describe('deriveLinkLabel', () => {
  it('prefers the page title, trimmed and capped at 80 chars', () => {
    expect(
      deriveLinkLabel({
        title: '  Ceschi: the interview  ',
        url: 'https://x.com/a',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi: the interview');
    const long = 'a'.repeat(120);
    expect(
      deriveLinkLabel({ title: long, url: 'https://x.com/a', artistName: 'Ceschi' }).length
    ).toBe(80);
  });

  it('falls back to "<artist> on <Service>" for known hosts', () => {
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://ceschi.bandcamp.com/album/x',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi on Bandcamp');
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://open.spotify.com/artist/x',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi on Spotify');
  });

  it('falls back to "<artist> — <hostname>" for unknown hosts', () => {
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://www.somezine.net/article',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi — somezine.net');
  });

  it('never returns a bare hostname or empty label on unparseable urls', () => {
    expect(deriveLinkLabel({ title: null, url: 'not a url', artistName: 'Ceschi' })).toBe('Ceschi');
  });
});

describe('classifyReferenceKind', () => {
  it('classifies interview/review/feature/profile/press titles as press', () => {
    for (const title of [
      'An interview with Ceschi',
      'Album review: Broken Bone Ballads',
      'Feature: the rise of Fake Four',
      'Artist profile',
      'Press kit 2024',
    ]) {
      expect(classifyReferenceKind(title)).toBe('press');
    }
  });

  it('classifies everything else (and null) as other', () => {
    expect(classifyReferenceKind('Discography')).toBe('other');
    expect(classifyReferenceKind(null)).toBe('other');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd bio-generator && pnpm exec vitest run src/link-labels.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `bio-generator/src/link-labels.ts` (MPL header first):

```ts
/** Longest label the palette renders comfortably on one tile line. */
const MAX_LABEL_LENGTH = 80;

/** Registrable domains → human service names for label fallbacks. */
const SERVICE_HOST_NAMES = new Map<string, string>([
  ['bandcamp.com', 'Bandcamp'],
  ['spotify.com', 'Spotify'],
  ['music.apple.com', 'Apple Music'],
  ['itunes.apple.com', 'Apple Music'],
  ['soundcloud.com', 'SoundCloud'],
  ['youtube.com', 'YouTube'],
  ['music.youtube.com', 'YouTube Music'],
  ['tidal.com', 'Tidal'],
  ['deezer.com', 'Deezer'],
  ['discogs.com', 'Discogs'],
  ['instagram.com', 'Instagram'],
  ['facebook.com', 'Facebook'],
  ['x.com', 'X'],
  ['twitter.com', 'X'],
]);

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const serviceNameFor = (host: string): string | null => {
  for (const [domain, name] of SERVICE_HOST_NAMES) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return null;
};

/**
 * Derives a descriptive palette label for a discovered link: the page title
 * when the source provided one, else "<artist> on <Service>" for known
 * services, else "<artist> — <hostname>". Never a bare hostname or empty.
 */
export const deriveLinkLabel = ({
  title,
  url,
  artistName,
}: {
  title: string | null;
  url: string;
  artistName: string;
}): string => {
  const trimmed = title?.trim();
  if (trimmed) return trimmed.slice(0, MAX_LABEL_LENGTH);
  const host = hostnameOf(url);
  if (!host) return artistName;
  const service = serviceNameFor(host);
  return service ? `${artistName} on ${service}` : `${artistName} — ${host}`;
};

/** Titles that mark editorial coverage rather than a reference page. */
const PRESS_TITLE_PATTERN = /\b(interview|review|feature|profile|press)\b/i;

/** Classifies a search-result reference as press coverage or a plain reference. */
export const classifyReferenceKind = (title: string | null): 'press' | 'other' =>
  title && PRESS_TITLE_PATTERN.test(title) ? 'press' : 'other';
```

- [ ] **Step 4: Jina failing test** — append to `bio-generator/src/jina.spec.ts` (reuse its existing fake-response helpers; the search response builder in that file constructs `{ data: [...] }` bodies):

```ts
it('collects images from listening-service result pages (album covers wanted)', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: [
          {
            url: 'https://ceschi.bandcamp.com/album/x',
            title: 'Ceschi on Bandcamp',
            content: 'album page',
            images: { 'Image 1: Broken Bone Ballads cover': 'https://f4.bcbits.com/img/a1.jpg' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  const sources = await searchArtistSources('Ceschi', null, fetchFn);
  expect(sources?.images.map((image) => image.url)).toContain('https://f4.bcbits.com/img/a1.jpg');
});
```

Run: `cd bio-generator && pnpm exec vitest run src/jina.spec.ts` — Expected: the new test FAILS (listening pages currently filtered out).

- [ ] **Step 5: Implement Jina changes** in `bio-generator/src/jina.ts`:

1. `const MAX_RESULTS = 5;` → `const MAX_RESULTS = 10;`
2. `const MAX_SCRAPED_IMAGES = 20;` → `const MAX_SCRAPED_IMAGES = 60;`
3. In `searchArtistSources`, replace the images assembly:

```ts
// Streaming pages flood the summary with album art, never artist photos.
const images = dedupeScrapedImages(
  results
    .filter((result) => !isListeningServiceUrl(result.url))
    .flatMap((result) => collectPageImages(result.images, result.url))
);
```

with:

```ts
// Listening-service pages are album art — wanted since media v2. Every
// scraped candidate is subject-verified by the vision pass downstream.
const images = dedupeScrapedImages(
  results.flatMap((result) => collectPageImages(result.images, result.url))
);
```

Remove the now-unused `isListeningServiceUrl` import if nothing else in the file uses it (check first — `listening-services.js` may still be imported elsewhere in the file).

- [ ] **Step 6: Run the lambda suite**

Run: `cd bio-generator && pnpm run test:run`
Expected: PASS. If an existing jina spec asserted the listening-page skip, UPDATE that test to the new behavior (the skip is intentionally removed) — do not delete unrelated assertions.

- [ ] **Step 7: Commit**

```bash
git add bio-generator/src/link-labels.ts bio-generator/src/link-labels.spec.ts bio-generator/src/jina.ts bio-generator/src/jina.spec.ts
git commit -m "feat: ✨ descriptive link labels + wider jina sweep

Adds deriveLinkLabel/classifyReferenceKind, doubles search results
to 10 per query, raises scraped-image cap to 60, and stops skipping
listening-service pages for images — album covers are now wanted
and the vision pass verifies every scraped candidate."
```

---

### Task A4: Wikidata P373 + Commons category images

**Files:**

- Modify: `bio-generator/src/wikidata.ts`
- Modify: `bio-generator/src/wikimedia.ts`
- Test: `bio-generator/src/wikidata.spec.ts`, `bio-generator/src/wikimedia.spec.ts`

**Interfaces:**

- Consumes: `BioImage` (Task A1), existing `toBioImage` helper in wikimedia.ts.
- Produces (used by Task A7):
  - `WikidataData` gains `commonsCategory?: string` (P373).
  - `export const getCommonsCategoryImages = async (category: string, limit: number, fetchFn?: FetchFn): Promise<BioImage[]>` — category members of type file, each with url/size/extmetadata, mapped through `toBioImage`, `kind: 'photo'`.

- [ ] **Step 1: Failing tests.** Append to `bio-generator/src/wikidata.spec.ts`:

```ts
it('extracts the commons category (P373)', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        entities: {
          Q1: {
            claims: { P373: [{ mainsnak: { datavalue: { value: 'Ceschi' } } }] },
            sitelinks: {},
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  const data = await getWikidataData('Q1', fetchFn);
  expect(data.commonsCategory).toBe('Ceschi');
});
```

Append to `bio-generator/src/wikimedia.spec.ts`:

```ts
describe('getCommonsCategoryImages', () => {
  it('maps category file members to bio images with kind photo', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          query: {
            pages: {
              '1': {
                title: 'File:Ceschi live 2018.jpg',
                imageinfo: [
                  {
                    url: 'https://upload.wikimedia.org/ceschi-live.jpg',
                    thumburl: 'https://upload.wikimedia.org/thumb/ceschi-live.jpg',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Ceschi_live_2018.jpg',
                    width: 2000,
                    height: 1500,
                    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } },
                  },
                ],
              },
              '2': { title: 'File:No info.jpg' },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const images = await getCommonsCategoryImages('Ceschi', 30, fetchFn);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://upload.wikimedia.org/ceschi-live.jpg');
    expect(images[0].kind).toBe('photo');
    expect(String(fetchFn.mock.calls[0][0])).toContain('generator=categorymembers');
    expect(String(fetchFn.mock.calls[0][0])).toContain(encodeURIComponent('Category:Ceschi'));
  });

  it('returns [] when the category request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(getCommonsCategoryImages('Ceschi', 30, fetchFn)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd bio-generator && pnpm exec vitest run src/wikidata.spec.ts src/wikimedia.spec.ts`
Expected: FAIL — `commonsCategory` undefined; `getCommonsCategoryImages` not exported.

- [ ] **Step 3: Implement.**

`wikidata.ts` — add to `WikidataData`:

```ts
  /** Commons category name from P373, e.g. "Ceschi" (no `Category:` prefix). */
  commonsCategory?: string;
```

and in `extractWikidataData`'s returned object add:

```ts
    commonsCategory: stringValues(entity?.claims?.P373)[0],
```

`wikimedia.ts` — add at the end (reusing the module's `CommonsResponse`, `toBioImage`, `COMMONS_API`, `THUMB_WIDTH`, `USER_AGENT`):

```ts
/**
 * Lists file members of a Commons category (P373) and resolves each to a
 * displayable image. Categories often hold dozens of real photos of the
 * artist beyond the single P18 portrait. Best-effort: failures return [].
 */
export const getCommonsCategoryImages = async (
  category: string,
  limit: number,
  fetchFn: FetchFn = fetch
): Promise<BioImage[]> => {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: `Category:${category}`,
    gcmtype: 'file',
    gcmlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    formatversion: '1',
  });

  try {
    const response = await fetchFn(`${COMMONS_API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as CommonsResponse;
    return Object.values(body.query?.pages ?? {})
      .map((page) => {
        const info = page.imageinfo?.[0];
        if (!info?.url || !page.title) return null;
        return { ...toBioImage(info, page.title), kind: 'photo' as const };
      })
      .filter((image): image is BioImage => image !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
};
```

- [ ] **Step 4: Run tests** — `cd bio-generator && pnpm exec vitest run src/wikidata.spec.ts src/wikimedia.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/wikidata.ts bio-generator/src/wikimedia.ts bio-generator/src/wikidata.spec.ts bio-generator/src/wikimedia.spec.ts
git commit -m "feat: ✨ commons category images via wikidata P373

getWikidataData extracts the P373 category and
getCommonsCategoryImages lists its file members — often dozens of
verified artist photos beyond the single P18 portrait. Subject is
guaranteed by Wikidata semantics, so no vision pass needed."
```

---

### Task A5: Cover Art Archive client

**Files:**

- Create: `bio-generator/src/caa.ts`
- Test: `bio-generator/src/caa.spec.ts`

**Interfaces:**

- Consumes: `ReleaseGroupSummary` (Task A2), `BioImage` (Task A1).
- Produces (used by Task A7):
  - `export const getCoverArtImages = async (groups: ReleaseGroupSummary[], maxCovers: number, fetchFn?: FetchFn): Promise<BioImage[]>` — front cover per release group from `https://coverartarchive.org/release-group/{rgMbid}` (JSON; 404 ⇒ skip), `kind: 'cover'`, `alt` = `"<title> album cover"`, attribution `'Cover Art Archive'`, sourceUrl = the MusicBrainz release-group page. Sequential small batches (concurrency 4).

- [ ] **Step 1: Failing test** — create `bio-generator/src/caa.spec.ts` (MPL header first):

```ts
import { getCoverArtImages } from './caa.js';

const group = (rgMbid: string, title: string) => ({
  rgMbid,
  title,
  firstReleaseDate: '2015-04-14',
  primaryType: 'Album',
});

const caaBody = {
  images: [
    {
      front: true,
      image: 'https://archive.org/full.jpg',
      thumbnails: { '250': 'https://archive.org/250.jpg', '500': 'https://archive.org/500.jpg' },
    },
  ],
};

describe('getCoverArtImages', () => {
  it('maps front covers to bio images with kind cover and alt text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(caaBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const images = await getCoverArtImages([group('rg-1', 'Broken Bone Ballads')], 40, fetchFn);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: 'https://archive.org/500.jpg',
      thumbnailUrl: 'https://archive.org/250.jpg',
      title: 'Broken Bone Ballads',
      attribution: 'Cover Art Archive',
      sourceUrl: 'https://musicbrainz.org/release-group/rg-1',
      kind: 'cover',
      alt: 'Broken Bone Ballads album cover',
      isPrimary: false,
    });
  });

  it('skips groups without cover art (404) and respects maxCovers', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValue(
        new Response(JSON.stringify(caaBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    const images = await getCoverArtImages(
      [group('rg-1', 'A'), group('rg-2', 'B'), group('rg-3', 'C')],
      1,
      fetchFn
    );
    expect(images).toHaveLength(1);
    expect(images[0].title).toBe('B');
  });

  it('returns [] when every lookup throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));
    await expect(getCoverArtImages([group('rg-1', 'A')], 40, fetchFn)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd bio-generator && pnpm exec vitest run src/caa.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `bio-generator/src/caa.ts` (MPL header first):

```ts
import { logEvent, toErrorMessage } from './lib/log.js';
import { USER_AGENT } from './types.js';

import type { ReleaseGroupSummary } from './musicbrainz.js';
import type { BioImage } from './types.js';

type FetchFn = typeof fetch;

const CAA_BASE = 'https://coverartarchive.org/release-group';
/** Simultaneous CAA lookups — the archive is slow but tolerant. */
const CAA_CONCURRENCY = 4;

/** Subset of the CAA release-group response we rely on. */
interface CaaResponse {
  images?: Array<{
    front?: boolean;
    image?: string;
    thumbnails?: Record<string, string>;
  }>;
}

const toCoverImage = (body: CaaResponse, group: ReleaseGroupSummary): BioImage | null => {
  const front = (body.images ?? []).find((image) => image.front) ?? body.images?.[0];
  const url = front?.thumbnails?.['500'] ?? front?.image;
  if (!url) return null;
  return {
    url,
    thumbnailUrl: front?.thumbnails?.['250'] ?? null,
    title: group.title,
    attribution: 'Cover Art Archive',
    license: null,
    sourceUrl: `https://musicbrainz.org/release-group/${group.rgMbid}`,
    width: null,
    height: null,
    isPrimary: false,
    kind: 'cover',
    alt: `${group.title} album cover`,
  };
};

const fetchCover = async (
  group: ReleaseGroupSummary,
  fetchFn: FetchFn
): Promise<BioImage | null> => {
  try {
    const response = await fetchFn(`${CAA_BASE}/${group.rgMbid}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return toCoverImage((await response.json()) as CaaResponse, group);
  } catch (err) {
    logEvent('warn', 'caa_lookup_failed', { rgMbid: group.rgMbid, error: toErrorMessage(err) });
    return null;
  }
};

/**
 * Resolves front cover art for the artist's release groups via the Cover Art
 * Archive — album art with clean provenance (the release group IS the
 * artist's), so no vision verification is needed. Best-effort per group;
 * stops once `maxCovers` covers are collected.
 */
export const getCoverArtImages = async (
  groups: ReleaseGroupSummary[],
  maxCovers: number,
  fetchFn: FetchFn = fetch
): Promise<BioImage[]> => {
  const covers: BioImage[] = [];
  for (let i = 0; i < groups.length && covers.length < maxCovers; i += CAA_CONCURRENCY) {
    const batch = groups.slice(i, i + CAA_CONCURRENCY);
    const resolved = await Promise.all(batch.map((group) => fetchCover(group, fetchFn)));
    for (const image of resolved) {
      if (image && covers.length < maxCovers) covers.push(image);
    }
  }
  return covers;
};
```

- [ ] **Step 4: Run tests** — `cd bio-generator && pnpm exec vitest run src/caa.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/caa.ts bio-generator/src/caa.spec.ts
git commit -m "feat: ✨ cover art archive client for album covers

Front covers for the artist's release groups, kind=cover with alt
text and MusicBrainz provenance — no scraping of JS-heavy
streaming pages and no vision pass needed."
```

### Task A6: Gemini vision verification (`vision.ts`)

**Files:**

- Create: `bio-generator/src/vision.ts`
- Test: `bio-generator/src/vision.spec.ts`

**Interfaces:**

- Consumes: `BioImage` (Task A1), `fetchWithRetry`/`FetchRetryOptions` from `./lib/http.js`, `logEvent`/`toErrorMessage` from `./lib/log.js`.
- Produces (used by Task A7):
  - `export interface VisionContext { artistNames: string[]; releaseTitles: string[] }`
  - `export const verifyScrapedImages = async (candidates: BioImage[], context: VisionContext, apiKey: string, model: string, options?: FetchRetryOptions): Promise<BioImage[]>` — returns ONLY accepted candidates, each with `kind` (`'photo' | 'cover'`) and `alt` filled in. FAIL-CLOSED: unfetchable/oversized/non-image candidates and failed batches are dropped, never passed through.
  - Exported constants for tests: `VISION_BATCH_SIZE = 10`, `VISION_MIN_CONFIDENCE = 0.5`, `VISION_FETCH_MAX_BYTES = 1_500_000`, `VISION_FETCH_TIMEOUT_MS = 8_000`, `VISION_FETCH_CONCURRENCY = 8`.

- [ ] **Step 1: Failing tests** — create `bio-generator/src/vision.spec.ts` (MPL header first):

```ts
import { verifyScrapedImages, VISION_MIN_CONFIDENCE } from './vision.js';

import type { BioImage } from './types.js';

const candidate = (url: string): BioImage => ({
  url,
  thumbnailUrl: null,
  title: null,
  attribution: 'somezine.net',
  license: null,
  sourceUrl: 'https://somezine.net/a',
  width: null,
  height: null,
  isPrimary: false,
});

const context = { artistNames: ['Ceschi', 'Ceschi Ramos'], releaseTitles: ['Broken Bone Ballads'] };

const imageResponse = (): Response =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Content-Length': '4' },
  });

const geminiVerdicts = (verdicts: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts }) }] } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

describe('verifyScrapedImages', () => {
  it('keeps accepted images with kind and alt from the verdict', async () => {
    const fetchFn = vi
      .fn()
      // two candidate image fetches
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      // one batched Gemini call
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'artist_photo', confidence: 0.9, alt: 'Ceschi performing live' },
          { index: 1, verdict: 'reject', confidence: 0.95 },
        ])
      );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png'), candidate('https://a.com/2.png')],
      context,
      'key',
      'gemini-2.5-flash',
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      url: 'https://a.com/1.png',
      kind: 'photo',
      alt: 'Ceschi performing live',
    });
  });

  it('drops verdicts below the confidence floor', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'album_cover', confidence: VISION_MIN_CONFIDENCE - 0.1 },
        ])
      );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png')],
      context,
      'key',
      'gemini-2.5-flash',
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toEqual([]);
  });

  it('fails closed: a failed Gemini batch drops that batch', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValue(new Response('quota', { status: 429 }));
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png')],
      context,
      'key',
      'gemini-2.5-flash',
      { fetchFn, sleep: async () => {}, retries: 0 }
    );
    expect(kept).toEqual([]);
  });

  it('fails closed: unfetchable and non-image candidates are dropped', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('html', { status: 200, headers: { 'Content-Type': 'text/html' } })
      )
      .mockRejectedValueOnce(new Error('network'));
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png'), candidate('https://a.com/2.png')],
      context,
      'key',
      'gemini-2.5-flash',
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toEqual([]);
    // No Gemini call when nothing survived fetching.
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps album covers as kind cover with a title-derived alt fallback', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([{ index: 0, verdict: 'album_cover', confidence: 0.8 }])
      );
    const withTitle = { ...candidate('https://a.com/1.png'), title: 'BBB cover' };
    const kept = await verifyScrapedImages([withTitle], context, 'key', 'gemini-2.5-flash', {
      fetchFn,
      sleep: async () => {},
    });
    expect(kept[0]).toMatchObject({ kind: 'cover', alt: 'BBB cover' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd bio-generator && pnpm exec vitest run src/vision.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `bio-generator/src/vision.ts` (MPL header first):

```ts
import { z } from 'zod';

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';

import type { FetchRetryOptions } from './lib/http.js';
import type { BioImage } from './types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const VISION_BATCH_SIZE = 10;
export const VISION_MIN_CONFIDENCE = 0.5;
export const VISION_FETCH_MAX_BYTES = 1_500_000;
export const VISION_FETCH_TIMEOUT_MS = 8_000;
export const VISION_FETCH_CONCURRENCY = 8;
/** One retry only — vision shares the Lambda budget with the prose ensemble. */
const VISION_RETRIES = 1;
const VISION_TEMPERATURE = 0.1;
const VISION_MAX_OUTPUT_TOKENS = 4096;

export interface VisionContext {
  artistNames: string[];
  releaseTitles: string[];
}

const visionVerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      verdict: z.enum(['artist_photo', 'album_cover', 'reject']),
      confidence: z.number().min(0).max(1),
      alt: z.string().optional(),
    })
  ),
});

interface FetchedCandidate {
  image: BioImage;
  mimeType: string;
  base64: string;
}

/** Fetches one candidate's bytes; null (drop) on any failure — fail closed. */
const fetchCandidate = async (
  image: BioImage,
  fetchFn: typeof fetch
): Promise<FetchedCandidate | null> => {
  try {
    const response = await fetchFn(image.url, {
      signal: AbortSignal.timeout(VISION_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!mimeType.startsWith('image/')) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > VISION_FETCH_MAX_BYTES) return null;
    return { image, mimeType, base64: Buffer.from(bytes).toString('base64') };
  } catch {
    return null;
  }
};

/** Pool-limited candidate fetching, preserving input order of survivors. */
const fetchCandidates = async (
  candidates: BioImage[],
  fetchFn: typeof fetch
): Promise<FetchedCandidate[]> => {
  const fetched: Array<FetchedCandidate | null> = [];
  for (let i = 0; i < candidates.length; i += VISION_FETCH_CONCURRENCY) {
    const batch = candidates.slice(i, i + VISION_FETCH_CONCURRENCY);
    fetched.push(...(await Promise.all(batch.map((image) => fetchCandidate(image, fetchFn)))));
  }
  return fetched.filter((entry): entry is FetchedCandidate => entry !== null);
};

const buildVisionSystemPrompt = ({ artistNames, releaseTitles }: VisionContext): string =>
  [
    'You verify candidate images for a musician biography.',
    `The artist: ${artistNames.join(' / ')}.`,
    releaseTitles.length ? `Known releases: ${releaseTitles.join('; ')}.` : '',
    'For EACH numbered image decide exactly one verdict:',
    '"artist_photo" — a photograph featuring this artist (alone or alongside other people);',
    '"album_cover" — cover art for one of this artist\'s releases or collaborations;',
    '"reject" — anything else: other people without the artist, logos, unrelated artwork,',
    'venues or crowds without the artist, merchandise, text graphics.',
    'Also write a short alt description (max 120 characters) for accepted images.',
    'When unsure, reject. Respond with a single JSON object and nothing else.',
  ]
    .filter(Boolean)
    .join(' ');

/** Assembles the interleaved text/image parts for one batched request. */
const buildVisionParts = (
  batch: FetchedCandidate[]
): Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> => [
  ...batch.flatMap((entry, index) => [
    { text: `Image ${index}:` },
    { inline_data: { mime_type: entry.mimeType, data: entry.base64 } },
  ]),
  {
    text:
      'Return JSON: {"verdicts": [{"index": <image number>, "verdict": ' +
      '"artist_photo"|"album_cover"|"reject", "confidence": 0..1, "alt": "short description"}]}',
  },
];

const verifyBatch = async (
  batch: FetchedCandidate[],
  context: VisionContext,
  apiKey: string,
  model: string,
  options: FetchRetryOptions
): Promise<BioImage[]> => {
  const response = await fetchWithRetry(
    `${GEMINI_API_BASE}/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildVisionSystemPrompt(context) }] },
        contents: [{ role: 'user', parts: buildVisionParts(batch) }],
        generationConfig: {
          temperature: VISION_TEMPERATURE,
          maxOutputTokens: VISION_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
    },
    { retries: VISION_RETRIES, ...options }
  );
  if (!response.ok) {
    throw new Error(`Gemini vision request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini vision returned an empty completion');
  const { verdicts } = visionVerdictSchema.parse(JSON.parse(text));

  return verdicts
    .filter(
      (verdict) => verdict.verdict !== 'reject' && verdict.confidence >= VISION_MIN_CONFIDENCE
    )
    .flatMap((verdict) => {
      const entry = batch.at(verdict.index);
      if (!entry) return [];
      return [
        {
          ...entry.image,
          kind: verdict.verdict === 'album_cover' ? ('cover' as const) : ('photo' as const),
          alt: verdict.alt?.trim() || entry.image.title || null,
        },
      ];
    });
};

/**
 * Subject-verifies scraped image candidates with Gemini vision, in batches of
 * {@link VISION_BATCH_SIZE}. Only candidates positively identified as a photo
 * featuring the artist or as cover art for the artist's releases survive.
 * FAIL-CLOSED at every stage: unfetchable/oversized/non-image candidates and
 * failed batches are dropped — provenance-guaranteed sources (Commons, CAA)
 * never route through here, so an outage degrades to those alone.
 */
export const verifyScrapedImages = async (
  candidates: BioImage[],
  context: VisionContext,
  apiKey: string,
  model: string,
  options: FetchRetryOptions = {}
): Promise<BioImage[]> => {
  if (!candidates.length) return [];
  const fetchFn = options.fetchFn ?? fetch;
  const fetched = await fetchCandidates(candidates, fetchFn);
  logEvent('info', 'vision_candidates', { total: candidates.length, fetched: fetched.length });
  if (!fetched.length) return [];

  const kept: BioImage[] = [];
  for (let i = 0; i < fetched.length; i += VISION_BATCH_SIZE) {
    const batch = fetched.slice(i, i + VISION_BATCH_SIZE);
    try {
      kept.push(...(await verifyBatch(batch, context, apiKey, model, options)));
    } catch (err) {
      // Fail closed: an unverifiable batch ships nothing from that batch.
      logEvent('warn', 'vision_batch_failed', { size: batch.length, error: toErrorMessage(err) });
    }
  }
  logEvent('info', 'vision_verified', { kept: kept.length });
  return kept;
};
```

- [ ] **Step 4: Run tests** — `cd bio-generator && pnpm exec vitest run src/vision.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/vision.ts bio-generator/src/vision.spec.ts
git commit -m "feat: ✨ gemini vision subject verification

Batch-classifies scraped image candidates as artist photo, album
cover, or reject (with alt text) against the artist's names and
release titles. Fail-closed at every stage so an outage degrades
to provenance-guaranteed sources only."
```

---

### Task A7: Handler orchestration — caps, tiers, vision wiring, chronology, labels

**Files:**

- Modify: `bio-generator/src/handler.ts`
- Test: `bio-generator/src/handler.spec.ts`

**Interfaces:**

- Consumes: everything from A1–A6: `listReleaseGroups`, `getCoverArtImages`, `getCommonsCategoryImages`, `verifyScrapedImages`, `deriveLinkLabel`, `classifyReferenceKind`, plus new `WikidataData.commonsCategory` and `BioGenerationInput.releases`.
- Produces:
  - `BioGeneratorDeps` gains `listReleaseGroups`, `getCoverArtImages`, `getCommonsCategoryImages`, `verifyScrapedImages` (all `typeof` the real fns) — unit tests stub them.
  - Constants become `MAX_IMAGES = 100`, `MAX_LINKS = 100`; new `MAX_COMMONS_CATEGORY_IMAGES = 30`, `MAX_COVER_ART = 40`.
  - `facts.chronology` / `facts.internalReleaseUrls` populated for Task A8's prompts.

**Key structural changes (implement exactly):**

1. `MetadataAccumulator` gains `releaseGroups: ReleaseGroupSummary[]`.
2. `gatherMetadata` gains `apiKey: string` and `model: string` params (vision runs inside gathering); `runBioGeneration` resolves `apiKey` BEFORE calling `gatherMetadata`.
3. `applyMatch` additionally calls `deps.listReleaseGroups(match.mbid)` → `acc.releaseGroups`, then `deps.getCoverArtImages(acc.releaseGroups, MAX_COVER_ART)` → append to `acc.images` (covers rank after Commons portraits/category, before scraped).
4. `applyWikidataFacts` additionally: when `wd.commonsCategory`, `deps.getCommonsCategoryImages(wd.commonsCategory, MAX_COMMONS_CATEGORY_IMAGES)` → append (deduped later).
5. `applyWebSearch` runs THREE queries: `undefined` (default biography), `` `${artist} musician interview review press` ``, `` `${artist} music press feature profile` ``; references now use `deriveLinkLabel({ title: ref.title, url: ref.url, artistName: artist })` and `kind: classifyReferenceKind(ref.title)`.
6. `finalizeMetadata` becomes `async` and takes `{ verify }`: it converts scraped candidates via `toScrapedBioImage`, calls `verify` (the vision dep) with `VisionContext` = `{ artistNames: [displayName, realName, akaNames-split].filter(Boolean)`, `releaseTitles: [...acc.releaseGroups titles, ...input.releases titles] }`, then merges verified scraped images after provenance tiers, URL-deduped, capped at `MAX_IMAGES`. It also builds `facts.chronology` and `facts.internalReleaseUrls` (see code) and derives `imageTitles` from `alt ?? title` fallback.
7. Attribution-free ranking stays WITHIN the Commons tier (existing `resolveImages` sort untouched).

- [ ] **Step 1: Failing tests** — append to `bio-generator/src/handler.spec.ts`. That spec already builds a full `BioGeneratorDeps` stub object; EXTEND the stub factory with the four new deps (default `vi.fn().mockResolvedValue([])` for the list-returning ones) or the existing tests will fail on missing properties. Then add:

```ts
describe('media discovery v2 orchestration', () => {
  it('merges commons, covers, and vision-verified scraped images with covers before scraped', async () => {
    const deps = makeDeps(); // the spec's existing stub factory
    deps.getWikidataData = vi.fn().mockResolvedValue({
      imageFileNames: ['A.jpg'],
      commonsCategory: 'Ceschi',
      wikipediaUrl: undefined,
      officialUrl: undefined,
    });
    deps.getCommonsImage = vi.fn().mockResolvedValue(commonsImage('https://commons/a.jpg'));
    deps.getCommonsCategoryImages = vi
      .fn()
      .mockResolvedValue([commonsImage('https://commons/cat.jpg')]);
    deps.listReleaseGroups = vi
      .fn()
      .mockResolvedValue([
        { rgMbid: 'rg-1', title: 'BBB', firstReleaseDate: '2015-04-14', primaryType: 'Album' },
      ]);
    deps.getCoverArtImages = vi
      .fn()
      .mockResolvedValue([
        { ...commonsImage('https://caa/500.jpg'), kind: 'cover', alt: 'BBB album cover' },
      ]);
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: ['https://zine.net/a'],
      references: [{ url: 'https://zine.net/a', title: 'An interview with Ceschi' }],
      images: [
        { url: 'https://zine.net/live.jpg', alt: 'Ceschi live', sourceUrl: 'https://zine.net/a' },
      ],
    });
    deps.verifyScrapedImages = vi.fn().mockResolvedValue([
      {
        ...commonsImage('https://zine.net/live.jpg'),
        kind: 'photo',
        alt: 'Ceschi live on stage',
      },
    ]);

    const data = await runBioGeneration(baseInput(), deps);

    const urls = data.images.map((image) => image.url);
    expect(urls.indexOf('https://caa/500.jpg')).toBeGreaterThan(
      urls.indexOf('https://commons/cat.jpg')
    );
    expect(urls.indexOf('https://zine.net/live.jpg')).toBeGreaterThan(
      urls.indexOf('https://caa/500.jpg')
    );
    expect(deps.verifyScrapedImages).toHaveBeenCalledTimes(1);
  });

  it('labels search references descriptively and classifies press', async () => {
    const deps = makeDeps();
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: ['https://zine.net/a'],
      references: [{ url: 'https://zine.net/a', title: 'Album review: BBB' }],
      images: [],
    });
    const data = await runBioGeneration(baseInput(), deps);
    const ref = data.links.find((link) => link.url === 'https://zine.net/a');
    expect(ref?.label).toBe('Album review: BBB');
    expect(ref?.kind).toBe('press');
  });

  it('builds chronology and internal release urls from label releases + release groups', async () => {
    const deps = makeDeps();
    deps.listReleaseGroups = vi
      .fn()
      .mockResolvedValue([
        { rgMbid: 'rg-1', title: 'Old EP', firstReleaseDate: '2009-06-01', primaryType: 'EP' },
      ]);
    const input = {
      ...baseInput(),
      releases: [{ title: 'Label Album', releasedOn: '2020-02-02', url: '/releases/abc' }],
    };
    let capturedFacts: ArtistFacts | undefined;
    deps.generateProse = vi.fn().mockImplementation(async (facts: ArtistFacts) => {
      capturedFacts = facts;
      return { shortBio: 's', longBio: 'l', altBio: 'a' };
    });
    await runBioGeneration(input, deps);
    expect(capturedFacts?.chronology).toEqual(
      expect.arrayContaining([
        '2020: released "Label Album" (label catalog — authoritative)',
        '2009: released "Old EP" (MusicBrainz)',
      ])
    );
    expect(capturedFacts?.internalReleaseUrls).toEqual(['/releases/abc']);
  });

  it('caps links at 100', async () => {
    const deps = makeDeps();
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: [],
      references: Array.from({ length: 130 }, (_, i) => ({
        url: `https://zine.net/${i}`,
        title: `Ref ${i}`,
      })),
      images: [],
    });
    const data = await runBioGeneration(baseInput(), deps);
    expect(data.links.length).toBeLessThanOrEqual(100);
    expect(data.links.length).toBeGreaterThan(50);
  });
});
```

Reuse/define local helpers consistent with the spec's existing style: `baseInput()` returns a minimal valid `BioGenerationInput`; `commonsImage(url)` returns a full `BioImage` with `attribution: 'Wikimedia Commons'`, `isPrimary: false`, nulls elsewhere. `ArtistFacts` import comes from `./types.js`.

- [ ] **Step 2: Run to verify failure** — `cd bio-generator && pnpm exec vitest run src/handler.spec.ts` — Expected: FAIL (missing deps on the stub type, ordering, labels, chronology).

- [ ] **Step 3: Implement** in `bio-generator/src/handler.ts` — the complete set of edits:

Imports:

```ts
import { getCoverArtImages } from './caa.js';
import { classifyReferenceKind, deriveLinkLabel } from './link-labels.js';
import { listReleaseGroups, lookupArtist } from './musicbrainz.js';
import { verifyScrapedImages } from './vision.js';
import { getCommonsCategoryImages, getCommonsImage } from './wikimedia.js';

import type { ReleaseGroupSummary } from './musicbrainz.js';
import type { VisionContext } from './vision.js';
```

`BioGeneratorDeps` — add:

```ts
listReleaseGroups: typeof listReleaseGroups;
getCoverArtImages: typeof getCoverArtImages;
getCommonsCategoryImages: typeof getCommonsCategoryImages;
verifyScrapedImages: typeof verifyScrapedImages;
```

and mirror them in `defaultDeps`.

Constants:

```ts
const MAX_IMAGES = 100;
const MAX_PRIMARY = 3;
const MAX_LINKS = 100;
/** Commons category members resolved per artist (P373). */
const MAX_COMMONS_CATEGORY_IMAGES = 30;
/** Cover Art Archive front covers resolved per artist. */
const MAX_COVER_ART = 40;
```

`MetadataAccumulator` — add `releaseGroups: ReleaseGroupSummary[];` and initialize `releaseGroups: []` in `gatherMetadata`.

`applyWikidataFacts` — after the existing `resolveImages` block, add:

```ts
if (wd.commonsCategory) {
  const categoryImages = await deps.getCommonsCategoryImages(
    wd.commonsCategory,
    MAX_COMMONS_CATEGORY_IMAGES
  );
  acc.images.push(...categoryImages);
  logEvent('info', 'commons_category_images', {
    category: wd.commonsCategory,
    resolved: categoryImages.length,
  });
}
```

`applyMatch` — after the wikidata block, add:

```ts
acc.releaseGroups = await deps.listReleaseGroups(match.mbid);
if (acc.releaseGroups.length) {
  const covers = await deps.getCoverArtImages(acc.releaseGroups, MAX_COVER_ART);
  acc.images.push(...covers);
  logEvent('info', 'cover_art_images', {
    releaseGroups: acc.releaseGroups.length,
    covers: covers.length,
  });
}
```

`applyWebSearch` — replace the two-query array with three and use the labeler:

```ts
const queries: Array<string | undefined> = [
  undefined,
  `${artist} musician interview review press`,
  `${artist} music press feature profile`,
];
```

and replace the reference push loop with:

```ts
for (const ref of found.references) {
  acc.links.push({
    label: deriveLinkLabel({ title: ref.title, url: ref.url, artistName: artist }),
    url: ref.url,
    kind: classifyReferenceKind(ref.title),
  });
}
```

Chronology builder — add above `finalizeMetadata`:

```ts
/** Year prefix of an ISO date, or null when absent/malformed. */
const yearOf = (isoDate: string | null | undefined): string | null => {
  const year = isoDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : null;
};

/**
 * Structured timeline: label-catalog releases first (authoritative), then
 * MusicBrainz release groups, deduped by title, newest last. Prose dates must
 * come from these lines or the labeled facts — not model recall.
 */
const buildChronology = (
  releases: BioGenerationInput['releases'],
  releaseGroups: ReleaseGroupSummary[]
): string[] => {
  const seen = new Set<string>();
  const lines: Array<{ year: number; line: string }> = [];
  for (const release of releases ?? []) {
    const year = yearOf(release.releasedOn);
    if (!year || seen.has(release.title.toLowerCase())) continue;
    seen.add(release.title.toLowerCase());
    lines.push({
      year: Number(year),
      line: `${year}: released "${release.title}" (label catalog — authoritative)`,
    });
  }
  for (const group of releaseGroups) {
    const year = yearOf(group.firstReleaseDate);
    if (!year || seen.has(group.title.toLowerCase())) continue;
    seen.add(group.title.toLowerCase());
    lines.push({ year: Number(year), line: `${year}: released "${group.title}" (MusicBrainz)` });
  }
  return lines.sort((a, b) => a.year - b.year).map((entry) => entry.line);
};
```

Rework `applyScrapedImages` → async verified merge (replace the whole function):

```ts
/**
 * Vision-verifies the scraped candidates, then merges survivors AFTER the
 * provenance-guaranteed tiers (Commons portrait/category, Cover Art Archive),
 * deduped by URL, up to MAX_IMAGES. Fail-closed: an unverifiable candidate
 * never ships.
 */
const applyVerifiedScrapedImages = async (
  acc: MetadataAccumulator,
  input: BioGenerationInput,
  verify: (candidates: BioImage[], context: VisionContext) => Promise<BioImage[]>
): Promise<void> => {
  if (!acc.scrapedImages.length) return;
  const seen = new Set(acc.images.map((image) => image.url.toLowerCase()));
  const ranked = [...acc.scrapedImages].sort(
    (a, b) => Number(Boolean(b.alt)) - Number(Boolean(a.alt))
  );
  const candidates: BioImage[] = [];
  for (const candidate of ranked) {
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(toScrapedBioImage(candidate));
  }

  const context: VisionContext = {
    artistNames: [
      input.displayName,
      input.realName,
      ...(input.akaNames?.split(',').map((name) => name.trim()) ?? []),
    ].filter((name): name is string => Boolean(name)),
    releaseTitles: [
      ...(input.releases?.map((release) => release.title) ?? []),
      ...acc.releaseGroups.map((group) => group.title),
    ],
  };
  const verified = await verify(candidates, context);
  for (const image of verified) {
    if (acc.images.length >= MAX_IMAGES) break;
    acc.images.push(image);
  }
  logEvent('info', 'scraped_images_merged', {
    candidates: candidates.length,
    verified: verified.length,
    total: acc.images.length,
  });
};
```

`finalizeMetadata` — becomes async, takes the verify callback, adds chronology/internal urls, caps images:

```ts
const finalizeMetadata = async (
  acc: MetadataAccumulator,
  input: BioGenerationInput,
  verify: (candidates: BioImage[], context: VisionContext) => Promise<BioImage[]>
): Promise<void> => {
  for (const url of input.links ?? []) {
    acc.links.push({ label: 'Reference', url, kind: 'other' });
  }

  acc.links = dedupeLinks(acc.links)
    .filter((link) => !isJunkLinkUrl(link.url))
    .map((link) =>
      isListeningServiceUrl(link.url) ? { ...link, kind: 'streaming' as const } : link
    )
    .slice(0, MAX_LINKS);

  await applyVerifiedScrapedImages(acc, input, verify);
  acc.images = acc.images.slice(0, MAX_IMAGES);

  acc.facts.chronology = buildChronology(input.releases, acc.releaseGroups);
  acc.facts.internalReleaseUrls = input.releases?.map((release) => release.url);
  acc.facts.imageTitles = acc.images.map(
    (image) => image.alt?.trim() || image.title?.trim() || `Photo of ${input.displayName}`
  );
};
```

`gatherMetadata` — new signature and call:

```ts
const gatherMetadata = async (
  input: BioGenerationInput,
  apiKey: string,
  model: string,
  deps: BioGeneratorDeps
): Promise<{ images: BioImage[]; links: BioLink[]; facts: ArtistFacts }> => {
```

(accumulator init gains `releaseGroups: []`), and the tail becomes:

```ts
await applyWebSearch(acc, input, scrapeKey, deps);
await finalizeMetadata(acc, input, (candidates, context) =>
  deps.verifyScrapedImages(candidates, context, apiKey, model)
);
```

`runBioGeneration` — resolve the key first:

```ts
const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const apiKey = await deps.getGeminiApiKey();
const { images, links, facts } = await gatherMetadata(input, apiKey, model, deps);

const prose = await deps.generateProse(facts, apiKey, model);
```

(delete the later duplicate `const apiKey = …` line).

- [ ] **Step 4: Run the whole lambda suite** — `cd bio-generator && pnpm run test:run` — Expected: PASS (update the existing handler spec stub factory as noted; existing ordering tests still hold because Commons stays first).

- [ ] **Step 5: Commit**

```bash
git add bio-generator/src/handler.ts bio-generator/src/handler.spec.ts
git commit -m "feat: ✨ orchestrate tiered media discovery to 100

Caps to 100 links/images; wires Commons categories, Cover Art
Archive, a third press query, descriptive reference labels, the
vision verify stage for scraped candidates (fail-closed), and the
chronology + internal-release facts for grounded prose."
```

---

### Task A8: Prompt upgrades — chronology grounding, emphasis policy, chunking, critic claim-grounding

**Files:**

- Modify: `bio-generator/src/gemini.ts`
- Test: `bio-generator/src/gemini.spec.ts`

**Interfaces:**

- Consumes: `ArtistFacts.chronology` / `internalReleaseUrls` (Task A1, populated by A7).
- Produces: prompts only — no signature changes. `referenceUrls()` now appends `facts.internalReleaseUrls`.

- [ ] **Step 1: Failing tests** — append to `bio-generator/src/gemini.spec.ts`. The spec already asserts prompt contents by inspecting `fetchFn` call bodies; follow that pattern:

```ts
describe('media v2 prompt upgrades', () => {
  const factsWithChronology: ArtistFacts = {
    displayName: 'Ceschi',
    imageTitles: [],
    chronology: ['2015: released "Broken Bone Ballads" (label catalog — authoritative)'],
    internalReleaseUrls: ['/releases/abc'],
    sourceUrls: ['https://zine.net/a'],
  };

  const captureBody = async (run: (fetchFn: typeof fetch) => Promise<unknown>) => {
    const fetchFn = vi.fn().mockResolvedValue(proseResponse()); // spec's existing helper
    await run(fetchFn);
    return JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
  };

  it('injects the chronology block and internal release urls into the draft prompt', async () => {
    const body = await captureBody((fetchFn) =>
      generateProse(factsWithChronology, 'key', 'gemini-2.5-flash', {
        fetchFn,
        sleep: async () => {},
      })
    );
    const userPrompt: string = body.contents[0].parts[0].text;
    expect(userPrompt).toContain('CHRONOLOGY (authoritative');
    expect(userPrompt).toContain('2015: released "Broken Bone Ballads"');
    expect(userPrompt).toContain('/releases/abc');
  });

  it('states the links-first emphasis policy and short-bio chunking', async () => {
    const body = await captureBody((fetchFn) =>
      generateProse(factsWithChronology, 'key', 'gemini-2.5-flash', {
        fetchFn,
        sleep: async () => {},
      })
    );
    const userPrompt: string = body.contents[0].parts[0].text;
    expect(userPrompt).toContain('Never stack <strong>, <em>, and <a>');
    expect(userPrompt).toContain('2–3 short <p> paragraphs');
  });

  it('gives the critic the chronology and unsupported-claim instruction', async () => {
    const fetchFn = vi.fn().mockResolvedValue(critiqueResponse()); // spec's existing helper
    await critiqueProse(
      {
        facts: factsWithChronology,
        prose: { shortBio: 's', longBio: 'l' },
        suspectYears: [],
        apiKey: 'key',
      },
      { fetchFn, sleep: async () => {} }
    );
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(body.systemInstruction.parts[0].text).toContain('no support in the source material');
    expect(body.systemInstruction.parts[0].text).toContain('chronology');
    expect(body.contents[0].parts[0].text).toContain('CHRONOLOGY (authoritative');
  });
});
```

(If the spec lacks `proseResponse`/`critiqueResponse` helpers, add minimal ones returning a 200 Response whose `candidates[0].content.parts[0].text` is valid JSON for `bioProseSchema` / `bioCritiqueSchema`.)

- [ ] **Step 2: Run to verify failure** — `cd bio-generator && pnpm exec vitest run src/gemini.spec.ts` — Expected: new tests FAIL.

- [ ] **Step 3: Implement** in `bio-generator/src/gemini.ts`:

1. `referenceUrls` — append internal paths:

```ts
const referenceUrls = (facts: ArtistFacts): string[] => {
  const external = facts.sourceUrls?.length
    ? facts.sourceUrls
    : [facts.wikipediaUrl, facts.officialUrl].filter((url): url is string => Boolean(url));
  return [...external, ...(facts.internalReleaseUrls ?? [])];
};
```

2. New chronology block (near `sourceMaterialLine`):

```ts
/** The authoritative-timeline block, or empty when no chronology exists. */
const chronologyLine = (facts: ArtistFacts): string =>
  facts.chronology?.length
    ? [
        'CHRONOLOGY (authoritative — every date and release year in the prose MUST come from',
        'these lines or the labeled facts above, never from memory):',
        ...facts.chronology,
      ].join('\n')
    : '';
```

3. `buildUserPrompt` — insert `chronologyLine(facts)` (own paragraph) between `factLines` and `sourceMaterialLine`; also add it to `buildSynthesisUserPrompt` after `factLines`, to `reviseProse`'s userPrompt after `factLines`, and to `critiqueProse`'s userPrompt after `factLines`.

4. `OUTPUT_SPEC_LINES` — exact replacements:
   - In the shortBio block, after the `- Do NOT embed any <img>` line, add:
     `'- Chunk into 2–3 short <p> paragraphs for web readability — never one long block.',`
   - Replace the longBio "Prefer links over bold" bullet (the two lines starting `'- Prefer links over bold:'`) with:

```ts
  '- Emphasis policy — links first: when a key name or term is covered by a reference URL, make',
  '  it an inline link. Use <em> for album/song/work titles that are NOT linked, and <strong>',
  '  sparingly for pivotal unlinked facts — key dates, collaborators, turning points. One',
  '  treatment per phrase: Never stack <strong>, <em>, and <a> on the same phrase.',
```

- After the reference-URL bullet in the longBio block, add:
  `'- Reference URLs beginning with /releases/ are THIS label\'s own release pages — link each',`
  `'  relevant release title to its /releases/ path at first mention.',`

5. `critiqueProse` systemPrompt — replace the array with:

```ts
      systemPrompt: [
        'You are a meticulous fact-checker for artist biographies. Compare the bios against the',
        'verified facts, the chronology, and the source material. Report ONLY concrete violations:',
        'claims contradicted by the facts or chronology, dates preceding the authoritative',
        'birth/formation dates, and specific checkable claims (dates, chart positions, label names,',
        'collaborations, awards) with no support in the source material, facts, or chronology.',
        'An empty violations array is the correct answer for clean bios.',
        'Respond with a single JSON object and nothing else.',
      ].join(' '),
```

- [ ] **Step 4: Run tests** — `cd bio-generator && pnpm run test:run` — Expected: PASS (existing prompt assertions may reference the replaced "Prefer links over bold" text — update those assertions to the new policy text; the policy is a deliberate spec change).

- [ ] **Step 5: Full lambda gate + repo gates**

```bash
cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run && cd ..
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
```

Expected: all green (repo-side untouched so far, but the gate is cheap insurance).

- [ ] **Step 6: Commit**

```bash
git add bio-generator/src/gemini.ts bio-generator/src/gemini.spec.ts
git commit -m "feat: ✨ chronology-grounded prompts + claim critic

Injects the authoritative chronology into draft/synthesis/revise/
critic prompts, allow-lists internal /releases/ paths for inline
links, chunks the short bio, states the links-first emphasis
policy, and has the critic flag unsupported checkable claims."
```

---

## Part B — Web app

### Task B1: App wire mirror — zod schemas, Prisma fields, fixture, repository carry-through

**Files:**

- Modify: `src/lib/validation/bio-generation-schema.ts`
- Modify: `prisma/schema.prisma` (ArtistBioImage: `kind String?`, `alt String?`)
- Modify: `src/lib/services/bio-generation-fixture.ts`
- Modify: `src/lib/repositories/artist-repository.ts` (carry `kind`/`alt` through `replaceBioContent` create data and the `getBioGenerationState` select — read the file first and extend the existing image field lists exactly where `title`/`attribution` appear)
- Modify: `src/lib/services/bio-generation-service.ts` (types `RehostedImage`/`buildRehostedRecord` carry `kind`/`alt`)
- Test: `src/lib/validation/bio-generation-schema.spec.ts`, `src/lib/services/bio-generation-fixture.spec.ts` (extend existing specs adjacent to each source file; create the spec file only if it does not exist)

**Interfaces:**

- Consumes: the lambda wire shape from Task A1 (lockstep).
- Produces (used by B2–B10):
  - `bioGenerationImageSchema` + `kind: z.enum(['photo', 'cover']).nullable().optional()`, `alt: z.string().nullable().optional()`.
  - `bioGenerationLinkSchema.kind` + `'press'`; `bioStatusLinkSchema.kind` + `'press'`.
  - `bioStatusImageSchema` inherits `kind`/`alt` (it extends the image schema).
  - `GeneratedBioContent['images'][number]` + `kind?: string | null; alt?: string | null`.
  - `BioGenerationLambdaInput` + `releases?: Array<{ title: string; releasedOn?: string; url: string }>`.

- [ ] **Step 1: Failing tests.** In `src/lib/validation/bio-generation-schema.spec.ts` add (server-only is not imported by this schema module; no mock needed — mirror the file's existing setup):

```ts
describe('media v2 wire additions', () => {
  it('accepts image kind and alt', () => {
    const image = {
      url: 'https://cdn.example.com/a.jpg',
      attribution: 'CAA',
      isPrimary: false,
      kind: 'cover',
      alt: 'Album cover',
    };
    const parsed = bioGenerationImageSchema.parse(image);
    expect(parsed.kind).toBe('cover');
    expect(parsed.alt).toBe('Album cover');
  });

  it('rejects unknown image kinds', () => {
    expect(
      bioGenerationImageSchema.safeParse({
        url: 'https://cdn.example.com/a.jpg',
        attribution: 'CAA',
        isPrimary: false,
        kind: 'gif',
      }).success
    ).toBe(false);
  });

  it('accepts press links on both wire and status schemas', () => {
    expect(
      bioGenerationLinkSchema.parse({ label: 'Review', url: 'https://z.net/r', kind: 'press' }).kind
    ).toBe('press');
    expect(
      bioStatusLinkSchema.parse({ id: 'x', label: 'Review', url: 'https://z.net/r', kind: 'press' })
        .kind
    ).toBe('press');
  });
});
```

In the fixture spec, assert the fixture now returns a press link, a cover image with `kind`/`alt`, and ≥2 images:

```ts
it('returns media v2 fields for palette e2e coverage', () => {
  const result = fakeBioGeneration({ artistId: 'a', displayName: 'Test Artist' });
  if (!result.ok) throw new Error('fixture must succeed');
  expect(result.data.images.length).toBeGreaterThanOrEqual(2);
  expect(result.data.images.some((image) => image.kind === 'cover')).toBe(true);
  expect(result.data.images.every((image) => (image.alt ?? '').length > 0)).toBe(true);
  expect(result.data.links.some((link) => link.kind === 'press')).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/validation/bio-generation-schema.spec.ts src/lib/services/bio-generation-fixture.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`bio-generation-schema.ts`:

- `bioGenerationImageSchema`: after `isPrimary: z.boolean(),` add the same two lines as the lambda (Task A1 Step 3, kind/alt).
- `bioGenerationLinkSchema` and `bioStatusLinkSchema`: add `'press'` to the kind enums (keep `'release'` in the status enum).
- `GeneratedBioContent.images` entry type: add `kind?: string | null;` and `alt?: string | null;`.

`bio-generation-fixture.ts`:

- `BioGenerationLambdaInput`: add `releases?: Array<{ title: string; releasedOn?: string; url: string }>;`
- `fakeBioGeneration` data: give the existing image `kind: 'photo'` and `alt: `${input.displayName} portrait photo``; append a second image:

```ts
      {
        url: 'https://picsum.photos/seed/e2e-cover/1000/1000',
        thumbnailUrl: 'https://picsum.photos/seed/e2e-cover/400/400',
        title: 'Fixture Album',
        attribution: 'Cover Art Archive',
        license: null,
        sourceUrl: null,
        width: 1000,
        height: 1000,
        isPrimary: false,
        kind: 'cover',
        alt: 'Fixture Album cover art',
      },
```

and append a press link: `{ label: 'An interview with the artist', url: 'https://example.com/interview', kind: 'press' as const },`

`prisma/schema.prisma` — in `model ArtistBioImage`, after `isPrimary`:

```prisma
  kind         String? // photo | cover — subject classification from discovery
  alt          String? // Accessible description written by the vision pass
```

Run `pnpm exec prisma generate` (client types only; MongoDB needs no migration — `pnpm exec prisma db push` happens on deploy as usual).

`artist-repository.ts` — extend the bio-image field lists: wherever `replaceBioContent` maps/creates image rows and wherever `getBioGenerationState` selects them (the lists containing `title`, `attribution`, `license`, `sourceUrl`), add `kind` and `alt` identically. Update the repository's image input type if it declares fields explicitly.

`bio-generation-service.ts` — `RehostedImage` type: add `kind: string | null;` and `alt: string | null;`; `buildRehostedRecord`: add `kind: image.kind ?? null,` and `alt: image.alt ? sanitizeBioText(image.alt) : null,`.

- [ ] **Step 4: Run tests + typecheck** — `pnpm exec vitest run src/lib` then `pnpm run typecheck` — Expected: PASS/clean (typecheck will surface every missed carry-through — fix them all here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/bio-generation-schema.ts src/lib/services/bio-generation-fixture.ts src/lib/services/bio-generation-service.ts src/lib/repositories/artist-repository.ts prisma/schema.prisma src/lib/validation/bio-generation-schema.spec.ts src/lib/services/bio-generation-fixture.spec.ts
git commit -m "feat: ✨ mirror media v2 wire fields in the app

kind/alt on bio images and the press link kind flow lambda →
zod boundary → repository → status endpoint. Fixture exercises
the new fields deterministically for E2E."
```

---

### Task B2: `pooledMap` util + bounded-concurrency thumbnail re-host

**Files:**

- Create: `src/lib/utils/pooled-map.ts`
- Test: `src/lib/utils/pooled-map.spec.ts`
- Modify: `src/lib/services/bio-image-service.ts`
- Test: `src/lib/services/bio-image-service.spec.ts` (extend)

**Interfaces:**

- Produces:
  - `export const pooledMap = async <T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<Array<PromiseSettledResult<R>>>` — order-preserving, at most `limit` in flight.
  - `BioImageService.rehostImages` phase 1 uses `pooledMap(images, REHOST_CONCURRENCY, ({ url }) => fetchImageBuffer(url))` with `const REHOST_CONCURRENCY = 8;` — behavior otherwise identical (settled results in input order).

- [ ] **Step 1: Failing tests** — create `src/lib/utils/pooled-map.spec.ts` (MPL header first):

```ts
import { pooledMap } from './pooled-map';

describe('pooledMap', () => {
  it('preserves input order in the settled results', async () => {
    const results = await pooledMap([30, 10, 20], 2, async (delayMs) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return delayMs;
    });
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 10, 20]);
  });

  it('never runs more than limit tasks concurrently', async () => {
    let inFlight = 0;
    let peak = 0;
    await pooledMap(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      }
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('captures rejections as settled results without aborting the batch', async () => {
    const results = await pooledMap([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('handles an empty input and a limit larger than the input', async () => {
    await expect(pooledMap([], 4, async () => 1)).resolves.toEqual([]);
    const results = await pooledMap([1], 8, async (n) => n);
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/utils/pooled-map.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/lib/utils/pooled-map.ts` (MPL header first):

```ts
/**
 * Maps `items` through an async `fn` with at most `limit` calls in flight,
 * returning order-preserving settled results (rejections captured, never
 * thrown). Use for fan-out I/O where unbounded `Promise.all` concurrency
 * would swamp the network or the remote host.
 */
export const pooledMap = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> => {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items.at(index);
      if (item === undefined && index >= items.length) break;
      try {
        results[index] = { status: 'fulfilled', value: await fn(item as T, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
};
```

- [ ] **Step 4: Wire into the service.** In `src/lib/services/bio-image-service.ts`: add `import { pooledMap } from '@/lib/utils/pooled-map';` and `const REHOST_CONCURRENCY = 8;` near `MAX_BYTES`. Replace phase 1:

```ts
const settled = await Promise.allSettled(images.map(({ url }) => fetchImageBuffer(url)));
```

with:

```ts
// Bounded fan-out: 100 candidates would otherwise open 100 simultaneous
// fetches from the web server. pooledMap preserves input order.
const settled = await pooledMap(images, REHOST_CONCURRENCY, ({ url }) => fetchImageBuffer(url));
```

Add a service spec asserting bounded concurrency (extend `bio-image-service.spec.ts`, following its existing mocking of `fetch`/S3): stub `fetch` to count in-flight calls the same way as the util spec and assert peak ≤ 8 across 20 image URLs.

- [ ] **Step 5: Run** — `pnpm exec vitest run src/lib/utils/pooled-map.spec.ts src/lib/services/bio-image-service.spec.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/pooled-map.ts src/lib/utils/pooled-map.spec.ts src/lib/services/bio-image-service.ts src/lib/services/bio-image-service.spec.ts
git commit -m "feat: ✨ pool bio image re-host concurrency at 8

Adds pooledMap (order-preserving settled results, bounded
in-flight) and uses it for the generation-time thumbnail pass —
100 candidates no longer open 100 simultaneous fetches."
```

---

### Task B3: Label releases → lambda input; internal cover art in the palette

**Files:**

- Modify: `src/lib/repositories/release-repository.ts` (new `findPublishedByArtistWithCovers`)
- Modify: `src/lib/types/domain/release.ts` (new `ReleaseCoverSource`)
- Modify: `src/lib/services/bio-generation-service.ts`
- Test: `src/lib/repositories/release-repository.spec.ts`, `src/lib/services/bio-generation-service.spec.ts` (extend both)

**Interfaces:**

- Consumes: `BioGenerationLambdaInput.releases` (B1), `buildCdnImageVariantUrl` from `@/lib/utils/build-cdn-image-variant-url`, existing `appendReleaseLinks` pattern.
- Produces:
  - `ReleaseCoverSource { id: string; title: string; releasedOn: Date | null; coverUrl: string | null }` in `src/lib/types/domain/release.ts`.
  - `ReleaseRepository.findPublishedByArtistWithCovers(artistId: string): Promise<ReleaseCoverSource[]>` — same filters as `findPublishedByArtist` (published, non-deleted, `releasedOn desc`), selecting id/title/releasedOn plus the release's cover image URL exactly the way `findPublishedByArtistExcluding` (release-repository.ts ~line 540) selects its cover — mirror that select/mapping.
  - In `generateForArtist`: releases are fetched ONCE via the new method, then (a) mapped into the lambda input as `releases: [{ title, releasedOn: toIsoDate(...), url: `/releases/${id}` }]`, (b) reused by `appendReleaseLinks` (refactor it to accept the prefetched list instead of querying again), and (c) appended as palette cover images via new `appendInternalCoverImages`.

- [ ] **Step 1: Failing service test** — extend `src/lib/services/bio-generation-service.spec.ts` (it already mocks `ArtistRepository`, `ReleaseRepository`, `BioImageService`; follow its patterns and `vi.mock('server-only', () => ({}))`):

```ts
describe('internal release grounding and covers', () => {
  it('passes label releases to the lambda input', async () => {
    mockFindPublishedByArtistWithCovers.mockResolvedValue([
      {
        id: 'rel1',
        title: 'Label Album',
        releasedOn: new Date('2020-02-02T00:00:00Z'),
        coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
      },
    ]);
    await BioGenerationService.generateForArtist('a'.repeat(24));
    const input = generateSpy.mock.calls[0][0]; // spy on BioGenerationService.generate
    expect(input.releases).toEqual([
      { title: 'Label Album', releasedOn: '2020-02-02', url: '/releases/rel1' },
    ]);
  });

  it('appends internal cover images with kind cover and CDN thumbnail', async () => {
    mockFindPublishedByArtistWithCovers.mockResolvedValue([
      {
        id: 'rel1',
        title: 'Label Album',
        releasedOn: new Date('2020-02-02T00:00:00Z'),
        coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
      },
    ]);
    const result = await BioGenerationService.generateForArtist('a'.repeat(24));
    if (!result.success) throw new Error(result.error);
    const cover = result.data.images.find((image) => image.kind === 'cover');
    expect(cover).toMatchObject({
      url: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
      title: 'Label Album',
      alt: 'Label Album album cover',
    });
    // Persisted through the repository with sortOrder after discovered images.
    const persisted = replaceBioContentSpy.mock.calls[0][1].images;
    expect(persisted.at(-1)).toMatchObject({ kind: 'cover', title: 'Label Album' });
  });

  it('skips cover rows whose url already exists among discovered images', async () => {
    // discovered image with the same CDN url ⇒ no duplicate appended
    // (arrange the lambda/fixture result to include that url, then assert
    // images contains exactly one row with it)
  });
});
```

Fill the third test concretely using the spec file's existing fixture-result plumbing (it stubs `BioGenerationService.generate` — set its resolved images to include the cover URL).

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/services/bio-generation-service.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/lib/types/domain/release.ts` — next to `ReleaseLinkSource` (~line 214):

```ts
/** Source row for injecting internal release links AND cover art after generation. */
export interface ReleaseCoverSource {
  id: string;
  title: string;
  releasedOn: Date | null;
  coverUrl: string | null;
}
```

`release-repository.ts` — add `findPublishedByArtistWithCovers(artistId)` below `findPublishedByArtist` (same where-clause; copy the cover-image select/mapping from `findPublishedByArtistExcluding`, first image's URL or null; return `ReleaseCoverSource[]`). Extend the repository spec with a mocked-prisma test asserting filters and mapping (mirror the existing `findPublishedByArtist` tests).

`bio-generation-service.ts`:

```ts
/** Builds the lambda-input releases payload from the label's own catalog. */
const toLambdaReleases = (
  releases: ReleaseCoverSource[]
): NonNullable<BioGenerationLambdaInput['releases']> =>
  releases.map((release) => ({
    title: release.title,
    releasedOn: toIsoDate(release.releasedOn),
    url: `/releases/${release.id}`,
  }));

/**
 * Appends the label's own release covers as palette images — rights-cleared,
 * already CDN-hosted (no fetch, no re-host), deduped against discovered rows.
 */
const appendInternalCoverImages = (
  persistedImages: PersistedImage[],
  releases: ReleaseCoverSource[]
): PersistedImage[] => {
  const seen = new Set(persistedImages.map((image) => image.url));
  const result = [...persistedImages];
  for (const release of releases) {
    if (!release.coverUrl || seen.has(release.coverUrl)) continue;
    seen.add(release.coverUrl);
    result.push({
      url: release.coverUrl,
      thumbnailUrl: buildCdnImageVariantUrl(release.coverUrl, 384),
      title: release.title,
      attribution: `${release.title} — label release`,
      license: null,
      sourceUrl: null,
      originalUrl: null,
      width: null,
      height: null,
      isPrimary: false,
      kind: 'cover',
      alt: `${release.title} album cover`,
      sortOrder: result.length,
    });
  }
  return result;
};
```

In `generateForArtist`: fetch `const releases = await ReleaseRepository.findPublishedByArtistWithCovers(artist.id).catch(() => [])` before invoking; pass `releases: releases.length ? toLambdaReleases(releases) : undefined` in the `generate` input; change `appendReleaseLinks(artistId, links)` to `appendReleaseLinks(links, releases)` (same URL/dedupe logic, iterating the prefetched list — keep the try/catch removal since no query remains); replace the `persistedImages` assignment flow so `appendInternalCoverImages(persistedImages, releases)` runs before `assembleContent`/`replaceBioContent`. Imports: `buildCdnImageVariantUrl`, `ReleaseCoverSource` type.

- [ ] **Step 4: Run** — `pnpm exec vitest run src/lib/services src/lib/repositories && pnpm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/domain/release.ts src/lib/repositories/release-repository.ts src/lib/repositories/release-repository.spec.ts src/lib/services/bio-generation-service.ts src/lib/services/bio-generation-service.spec.ts
git commit -m "feat: ✨ label releases ground prose + seed covers

One query feeds three consumers: lambda-input releases (chronology
+ internal link allowlist), release palette links, and
rights-cleared CDN cover images appended to the image palette."
```

---

### Task B4: `BioLink` inline atom node + NodeView

**Files:**

- Create: `src/app/components/ui/bio-link-extension.ts`
- Create: `src/app/components/ui/bio-link-node-view.tsx`
- Test: `src/app/components/ui/bio-link-extension.spec.ts`, `src/app/components/ui/bio-link-node-view.spec.tsx`

**Interfaces:**

- Consumes: `isInternalBioUrl` from `@/lib/utils/is-internal-url`, TipTap `Node`/`ReactNodeViewRenderer` (mirror `bio-figure-extension.ts` / `bio-figure-node-view.tsx` patterns exactly).
- Produces (used by B5/B8):
  - `export interface BioLinkAttributes { href: string; text: string; external: boolean }`
  - `export interface BioLinkOptions { onEditRequest: (pos: number) => void }`
  - `export const BioLink = Node.create<BioLinkOptions>(…)` — name `'bioLink'`, `inline: true`, `group: 'inline'`, `atom: true`, `draggable: true`, `selectable: true`. `parseHTML` from `a[href]` (external derived from `target="_blank"` presence, falling back to `!isInternalBioUrl(href)`); `renderHTML` emits `['a', { href }, text]` for internal and `['a', { href, rel: 'nofollow noopener noreferrer', target: '_blank' }, text]` for external — EXACTLY the sanitizer's `transformAnchor` contract, no `class` attr.
  - NodeView: underlined text span, `ExternalLink` icon suffix when `external`, hover/selected controls: pencil (calls `options.onEditRequest(getPos())`) and X (calls `deleteNode`).

- [ ] **Step 1: Failing extension tests** — create `src/app/components/ui/bio-link-extension.spec.ts` (MPL header; jsdom project). Follow `bio-figure-extension.spec.ts`'s established pattern for headless TipTap testing (it creates an Editor with the extension and asserts `getHTML()` / parsed doc JSON — reuse its helper structure):

```ts
import { Editor } from '@tiptap/core';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Document } from '@tiptap/extension-document';

import { BioLink } from './bio-link-extension';

const makeEditor = (content: string): Editor =>
  new Editor({
    extensions: [Document, Paragraph, Text, BioLink.configure({ onEditRequest: () => {} })],
    content,
  });

describe('BioLink extension', () => {
  it('parses an external anchor into a bioLink node and round-trips the html', () => {
    const html =
      '<p>See <a href="https://zine.net/a" rel="nofollow noopener noreferrer" target="_blank">the interview</a>.</p>';
    const editor = makeEditor(html);
    const node = editor.state.doc.content.firstChild?.content.child(1);
    expect(node?.type.name).toBe('bioLink');
    expect(node?.attrs).toMatchObject({
      href: 'https://zine.net/a',
      text: 'the interview',
      external: true,
    });
    expect(editor.getHTML()).toContain(
      '<a href="https://zine.net/a" rel="nofollow noopener noreferrer" target="_blank">the interview</a>'
    );
  });

  it('parses an internal anchor and serializes without rel/target', () => {
    const editor = makeEditor('<p><a href="/releases/abc">Label Album</a></p>');
    expect(editor.getHTML()).toContain('<a href="/releases/abc">Label Album</a>');
    expect(editor.getHTML()).not.toContain('target=');
  });

  it('derives external=true from href when legacy anchors lack target', () => {
    const editor = makeEditor('<p><a href="https://zine.net/a">old link</a></p>');
    const node = editor.state.doc.content.firstChild?.content.child(0);
    expect(node?.attrs.external).toBe(true);
  });

  it('ignores anchors without an href', () => {
    const editor = makeEditor('<p><a>bare</a></p>');
    expect(editor.getHTML()).not.toContain('bioLink');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/ui/bio-link-extension.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement the extension** — create `src/app/components/ui/bio-link-extension.ts` (MPL header first):

```ts
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

import { BioLinkNodeView } from './bio-link-node-view';

import type { DOMOutputSpec } from '@tiptap/pm/model';

export interface BioLinkAttributes {
  href: string;
  text: string;
  external: boolean;
}

export interface BioLinkOptions {
  /** Invoked by the NodeView's edit control with the node's document position. */
  onEditRequest: (pos: number) => void;
}

const parseAnchor = (element: HTMLElement): BioLinkAttributes | false => {
  const href = element.getAttribute('href');
  const text = element.textContent?.trim() ?? '';
  if (!href || !text) return false;
  const external = element.getAttribute('target') === '_blank' || !isInternalBioUrl(href);
  return { href, text, external };
};

/**
 * Inline atom link node — a bio link behaves as one draggable unit with an
 * X-remove control, matching the figure interaction model. Serializes to the
 * exact `<a>` contract the sanitizer enforces (external: hardened rel/target;
 * internal: bare href), so persisted HTML and the public renderer are
 * unchanged, and legacy `<a>` content parses straight into it.
 */
export const BioLink = Node.create<BioLinkOptions>({
  name: 'bioLink',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onEditRequest: () => {} };
  },

  addAttributes() {
    return {
      href: { default: null },
      text: { default: '' },
      external: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]', getAttrs: parseAnchor }];
  },

  renderHTML({ node }): DOMOutputSpec {
    const { href, text, external } = node.attrs as BioLinkAttributes;
    return external
      ? ['a', { href, rel: 'nofollow noopener noreferrer', target: '_blank' }, text]
      : ['a', { href }, text];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BioLinkNodeView);
  },
});
```

- [ ] **Step 4: Failing NodeView tests** — create `src/app/components/ui/bio-link-node-view.spec.tsx` following `bio-figure-node-view.spec.tsx`'s pattern for rendering a NodeView component with stub `NodeViewProps` (it builds a minimal `node`, `updateAttributes`, `deleteNode`, `selected`, `getPos`, `editor` — mirror that; `extension: { options: { onEditRequest } }` rides on the props):

```ts
describe('BioLinkNodeView', () => {
  it('renders underlined anchor text with the external icon when external', () => {
    render(<BioLinkNodeView {...makeProps({ href: 'https://z.net', text: 'zine', external: true })} />);
    expect(screen.getByText('zine')).toBeInTheDocument();
    expect(document.querySelector('[data-external-icon]')).toBeInTheDocument();
  });

  it('omits the icon for internal links', () => {
    render(<BioLinkNodeView {...makeProps({ href: '/releases/abc', text: 'Album', external: false })} />);
    expect(document.querySelector('[data-external-icon]')).not.toBeInTheDocument();
  });

  it('delete control removes the node', async () => {
    const props = makeProps({ href: 'https://z.net', text: 'zine', external: true });
    render(<BioLinkNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove link zine' }));
    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('edit control requests editing at the node position', async () => {
    const props = makeProps({ href: 'https://z.net', text: 'zine', external: true });
    render(<BioLinkNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit link zine' }));
    expect(props.extension.options.onEditRequest).toHaveBeenCalledWith(7);
  });
});
```

(`makeProps` builds the stub with `getPos: () => 7`.)

- [ ] **Step 5: Implement the NodeView** — create `src/app/components/ui/bio-link-node-view.tsx` (MPL header, `'use client'`):

```tsx
'use client';

import type { JSX } from 'react';

import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Pencil, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { BioLinkAttributes, BioLinkOptions } from './bio-link-extension';
import type { NodeViewProps } from '@tiptap/react';

/**
 * Inline NodeView for {@link BioLink}: the anchor text rendered as an
 * underlined link-colored unit, with an external-tab icon when applicable and
 * hover/selection controls to edit (via the link dialog) or remove the node.
 * The whole unit drags with ProseMirror's native atom drag.
 */
export const BioLinkNodeView = ({
  node,
  selected,
  deleteNode,
  getPos,
  extension,
}: NodeViewProps): JSX.Element => {
  const { href, text, external } = node.attrs as BioLinkAttributes;
  const { onEditRequest } = extension.options as BioLinkOptions;

  return (
    <NodeViewWrapper
      as="span"
      data-drag-handle
      data-selected={selected ? true : undefined}
      className={cn(
        'group/biolink relative inline-flex cursor-grab items-baseline gap-0.5',
        'text-primary underline underline-offset-2 active:cursor-grabbing',
        selected && 'ring-ring bg-accent/40 ring-2'
      )}
      title={href}
    >
      <span>{text}</span>
      {external && <ExternalLink data-external-icon className="size-3 self-center" aria-hidden />}
      <span
        className={cn(
          'bg-popover absolute -top-6 left-0 z-10 hidden items-center gap-0.5 border p-0.5 shadow-sm',
          'group-hover/biolink:inline-flex group-data-selected/biolink:inline-flex'
        )}
        contentEditable={false}
      >
        <button
          type="button"
          aria-label={`Edit link ${text}`}
          className="hover:text-primary p-0.5"
          onClick={() => {
            const pos = getPos();
            if (typeof pos === 'number') onEditRequest(pos);
          }}
        >
          <Pencil className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove link ${text}`}
          className="hover:text-destructive p-0.5"
          onClick={() => deleteNode()}
        >
          <X className="size-3" aria-hidden />
        </button>
      </span>
    </NodeViewWrapper>
  );
};
```

Note: `group-data-selected/biolink:` requires the `data-selected` attribute set on the group element (it is). If the Tailwind variant name differs in this codebase, match how `bio-figure-node-view.tsx` shows controls on selection (`group-data-selected:opacity-100`) and reuse that exact mechanism.

- [ ] **Step 6: Run** — `pnpm exec vitest run src/app/components/ui/bio-link-extension.spec.ts src/app/components/ui/bio-link-node-view.spec.tsx` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ui/bio-link-extension.ts src/app/components/ui/bio-link-node-view.tsx src/app/components/ui/bio-link-extension.spec.ts src/app/components/ui/bio-link-node-view.spec.tsx
git commit -m "feat: ✨ BioLink inline atom node with edit/remove

Links become one draggable unit with hover/select edit + X
controls, matching figures. Serializes to the sanitizer's exact
anchor contract so persisted HTML and public rendering are
unchanged; legacy anchors parse straight into the node."
```

---

### Task B5: Editor integration — replace the Link mark, dialog edits nodes, drop inserts nodes

**Files:**

- Create: `src/app/components/ui/bio-editor-insert.ts` (shared payload→content builders)
- Modify: `src/app/components/ui/rich-text-editor.tsx`
- Modify: `src/app/components/ui/bio-editor-drop.ts`
- Modify: `src/app/components/ui/rich-text-editor-toolbar.tsx` (only if it references the `link` mark name — update `isLink` wiring)
- Test: `src/app/components/ui/bio-editor-insert.spec.ts`, plus updates to `bio-editor-drop.spec.ts` and `rich-text-editor.spec.tsx`

**Interfaces:**

- Consumes: `BioLink`/`BioLinkOptions` (B4), `BioLinkDragPayload`/`BioImageDragPayload` (existing `bio-dnd-schema.ts`).
- Produces (used by B8's click-to-insert):
  - `export const buildBioLinkContent = (payload: BioLinkDragPayload): { type: 'bioLink'; attrs: { href: string; text: string; external: boolean } }`
  - `export const buildBioFigureContent = (payload: BioImageDragPayload): { type: 'bioFigure'; attrs: { src: string; alt: string; title: string | null; attribution: string | null } }`
- Editor behavior contract:
  - `StarterKit.configure({ …, link: false })`; `BioLink.configure({ onEditRequest })` registered.
  - `handleBioEditorDrop` inserts `buildBioLinkContent(...)` instead of a link-marked text run.
  - Link dialog: inserting creates a `bioLink` node at the caret; editing (via NodeView pencil or toolbar button while a `bioLink` is selected) updates that node's attrs (`text`, `href`, `external`); Remove deletes the node. The `linkTextLocked` state and `LinkBubbleMenu` are deleted.
  - Toolbar `isLink` becomes `editor.isActive('bioLink')`.

- [ ] **Step 1: Failing builder tests** — create `src/app/components/ui/bio-editor-insert.spec.ts`:

```ts
import { buildBioFigureContent, buildBioLinkContent } from './bio-editor-insert';

describe('buildBioLinkContent', () => {
  it('maps a palette link payload onto bioLink attrs', () => {
    expect(
      buildBioLinkContent({
        label: 'Ceschi on Bandcamp',
        url: 'https://c.bandcamp.com',
        kind: 'streaming',
        isExternal: true,
      })
    ).toEqual({
      type: 'bioLink',
      attrs: { href: 'https://c.bandcamp.com', text: 'Ceschi on Bandcamp', external: true },
    });
  });
});

describe('buildBioFigureContent', () => {
  it('maps a palette image payload onto bioFigure attrs', () => {
    expect(
      buildBioFigureContent({
        url: 'https://cdn/x.jpg',
        thumbnailUrl: null,
        title: 'Live 2018',
        attribution: 'somezine.net',
        alt: 'Ceschi live',
        width: null,
        height: null,
      })
    ).toEqual({
      type: 'bioFigure',
      attrs: {
        src: 'https://cdn/x.jpg',
        alt: 'Ceschi live',
        title: 'Live 2018',
        attribution: 'somezine.net',
      },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement `src/app/components/ui/bio-editor-insert.ts` (MPL header first):

```ts
import type { BioImageDragPayload, BioLinkDragPayload } from '@/lib/validation/bio-dnd-schema';

/** Palette link payload → insertable bioLink node content. */
export const buildBioLinkContent = (
  payload: BioLinkDragPayload
): { type: 'bioLink'; attrs: { href: string; text: string; external: boolean } } => ({
  type: 'bioLink',
  attrs: { href: payload.url, text: payload.label, external: payload.isExternal },
});

/** Palette image payload → insertable bioFigure node content. */
export const buildBioFigureContent = (
  payload: BioImageDragPayload
): {
  type: 'bioFigure';
  attrs: { src: string; alt: string; title: string | null; attribution: string | null };
} => ({
  type: 'bioFigure',
  attrs: {
    src: payload.url,
    alt: payload.alt,
    title: payload.title,
    attribution: payload.attribution,
  },
});
```

- [ ] **Step 3: Update the drop handler.** In `bio-editor-drop.ts`: delete `linkMarkAttrs` and `insertLinkAt`; import the builders; the link branch becomes:

```ts
if (linkParsed.success) {
  event.preventDefault();
  editor.chain().focus().insertContentAt(coords.pos, buildBioLinkContent(linkParsed.data)).run();
  return true;
}
```

and the image branch becomes `insertContentAt(coords.pos, buildBioFigureContent(imageParsed.data))`. Update `bio-editor-drop.spec.ts` expectations accordingly (it asserts the insertContent payload shapes).

- [ ] **Step 4: Rework `rich-text-editor.tsx`** (the biggest edit — keep the file's existing structure):

1. Imports: drop `BubbleMenu`, `Link2Off` stays (dialog Remove), add `BioLink` from `./bio-link-extension`.
2. State: delete `linkTextLocked`; add `editLinkPos: number | null` (null = inserting new).
3. Extensions:

```ts
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: false,
      }),
      BioLink.configure({
        onEditRequest: (pos) => openLinkDialogForNode(pos),
      }),
```

`onEditRequest` fires from the NodeView; define `openLinkDialogForNode` with `useRef`-safe access (the callback closes over component scope via a ref, same pattern the file already uses for `editorRef` in `handleDrop`): store it in a ref `onEditRequestRef` and configure the extension with `(pos) => onEditRequestRef.current?.(pos)`. 4. Dialog openers:

```ts
const openLinkDialogForNode = (pos: number): void => {
  const instance = editorRef.current;
  if (!instance) return;
  const node = instance.state.doc.nodeAt(pos);
  if (node?.type.name !== 'bioLink') return;
  const attrs = node.attrs as BioLinkAttributes;
  setEditLinkPos(pos);
  setLinkUrl(attrs.href);
  setLinkText(attrs.text);
  setLinkExternal(attrs.external);
  setLinkOpen(true);
};

const openLinkDialog = (): void => {
  const { selection } = editor.state;
  const selectedNode =
    'node' in selection ? (selection as { node?: { type: { name: string } } }).node : undefined;
  if (selectedNode?.type.name === 'bioLink') {
    openLinkDialogForNode(selection.from);
    return;
  }
  const { empty, from, to } = editor.state.selection;
  setEditLinkPos(null);
  setLinkUrl('');
  setLinkText(empty ? '' : editor.state.doc.textBetween(from, to, ' '));
  setLinkExternal(true);
  setLinkOpen(true);
};
```

5. `applyLink` — node-based:

```ts
const applyLink = (): void => {
  const href = linkUrl.trim();
  const text = linkText.trim();
  if (!isValidBioLinkUrl(href) || !text) return;
  const attrs = { href, text, external: linkExternal };
  if (editLinkPos !== null) {
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(editLinkPos);
        if (node?.type.name !== 'bioLink') return false;
        tr.setNodeMarkup(editLinkPos, undefined, attrs);
        return true;
      })
      .run();
  } else {
    editor.chain().focus().insertContent({ type: 'bioLink', attrs }).run();
  }
  setLinkOpen(false);
};
```

6. `removeLink` — deletes the node being edited (`editLinkPos !== null`: `tr.delete(editLinkPos, editLinkPos + 1)`), else closes.
7. Delete the `LinkBubbleMenu` component and its render; delete `targetRelAttrs` (now encoded in the extension) and the `linkTextLocked` hint props on the anchor-text field (field is always editable; Apply is disabled when `!linkText.trim()` too).
8. `selectToolbarState`: `isLink: isActive(instance, 'bioLink')`.
9. URL-change handler keeps re-deriving `setLinkExternal(!isInternalBioUrl(nextUrl))`.
10. Add `import type { BioLinkAttributes } from './bio-link-extension';`.

- [ ] **Step 5: Update `rich-text-editor.spec.tsx`.** Its link-dialog tests exercise the mark flow (locked anchor text, extendMarkRange). Rewrite those cases: inserting via dialog produces `<a href=…>text</a>` in `onChange` HTML; editing a selected bioLink updates text/href; Remove deletes the anchor; legacy `<a>` content round-trips. Keep every non-link test untouched.

- [ ] **Step 6: Run the app suite** — `pnpm run test:run` — Expected: PASS. Serialized HTML is unchanged contract-wide, so no sanitizer/BioHtml spec should move; if one fails, the extension's renderHTML violates the contract — fix the extension, not the spec.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ui/bio-editor-insert.ts src/app/components/ui/bio-editor-insert.spec.ts src/app/components/ui/bio-editor-drop.ts src/app/components/ui/bio-editor-drop.spec.ts src/app/components/ui/rich-text-editor.tsx src/app/components/ui/rich-text-editor.spec.tsx src/app/components/ui/rich-text-editor-toolbar.tsx
git commit -m "feat: ✨ editor links are draggable atom nodes

StarterKit's link mark is off; the dialog inserts/edits bioLink
nodes, palette drops insert them at the cursor, and the bubble
menu is replaced by the node's own edit/remove controls. Shared
payload→content builders back both drop and click-to-insert."
```

---

### Task B6: Global link underline with button/nav carve-outs

**Files:**

- Modify: `src/app/globals.css` (the `a { … }` rule at ~line 227)
- Modify: `src/app/components/ui/button.tsx`
- Modify: `src/app/components/desktop-menu.tsx`, `src/app/components/header/logo.tsx` (add `no-underline` to their anchor classNames — nav tiles/wordmark are chrome, not prose links)
- Test: `src/app/components/ui/button.spec.tsx` (extend), `src/app/globals.css` has no spec — the css change is covered by the button/nav specs plus E2E

**Interfaces:** none new — a site-wide CSS default: every `<a>` underlines; anchors rendered as buttons or zine nav tiles opt out via `no-underline`.

- [ ] **Step 1: Failing button test** — extend `src/app/components/ui/button.spec.tsx`:

```ts
it('opts anchors-as-buttons out of the global link underline', () => {
  render(
    <Button asChild>
      <a href="/releases">Browse</a>
    </Button>
  );
  expect(screen.getByRole('link', { name: 'Browse' })).toHaveClass('no-underline');
});

it('link variant keeps a persistent underline', () => {
  render(<Button variant="link">Go</Button>);
  expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('underline');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/ui/button.spec.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`globals.css` — the anchor rule becomes (underline always; hover rule removed as redundant):

```css
a {
  color: var(--color-zinc-950);
  text-decoration-line: underline;
  text-underline-offset: 0.25rem;
  &:visited {
    color: var(--color-zinc-950);
  }
}
```

`button.tsx`:

- Append `no-underline` to the cva base string (after `aria-invalid:border-destructive`).
- `link` variant: `'text-primary underline-offset-4 hover:underline'` → `'text-primary underline underline-offset-4'`.
- `'link:narrow'` variant: same replacement of `hover:underline` → `underline`.

`desktop-menu.tsx` / `header/logo.tsx`: append `no-underline` to the `Link` className strings (the menu-tile and wordmark anchors). Grep for other anchors that are visually chrome-tiles (`rg -l "menu-item-" src/app/components`) and add `no-underline` ONLY where an underline visibly corrupts a tile/button treatment — footers, breadcrumbs, and prose links keep the underline by design.

- [ ] **Step 4: Visual sanity + suite.** Run `pnpm run test:run` (expect PASS; fix any spec asserting the old button class strings). Then start `pnpm run dev` and eyeball `/`, the header nav, a release page, and an artist bio for underline correctness (bio links now underline persistently; nav tiles do not).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/components/ui/button.tsx src/app/components/ui/button.spec.tsx src/app/components/desktop-menu.tsx src/app/components/header/logo.tsx
git commit -m "feat: ✨ underline all links site-wide

Anchors underline by default (hover-only rule removed). Anchors
rendered as buttons or zine nav tiles opt out with no-underline —
an underline inside a button treatment reads as a bug, not a link."
```

---

### Task B7: Tighter figure text wrap (`shape-outside`) in renderer and editor

**Files:**

- Modify: `src/app/components/bio-html.tsx` (`FIGURE_FLOAT_CLASSES`)
- Modify: `src/app/components/ui/bio-figure-node-view.tsx` (float preview classes)
- Test: `src/app/components/bio-html.spec.tsx`, `src/app/components/ui/bio-figure-node-view.spec.tsx` (extend)

**Interfaces:** none new — class-string changes only. The serialized `bio-figure--left/right/center` contract and the sanitizer are untouched.

- [ ] **Step 1: Failing tests.** In `bio-html.spec.tsx` (it already renders figures and asserts float classes — extend those cases):

```ts
it('floated figures hug text with shape-outside and tightened gutters', () => {
  render(<BioHtml html='<figure class="bio-figure bio-figure--left" style="width: 40%"><img src="https://cdn/x.jpg" alt="a" /></figure><p>text</p>' />);
  const figure = document.querySelector('figure');
  expect(figure?.className).toContain('[shape-outside:margin-box]');
  expect(figure?.className).toContain('mr-3');
  expect(figure?.className).not.toContain('mr-4');
});

it('caption stays fixed at 11px regardless of figure width', () => {
  render(
    <BioHtml html='<figure class="bio-figure bio-figure--left" style="width: 20%"><img src="https://cdn/x.jpg" alt="a" /><figcaption class="bio-figure-caption"><span class="bio-figure-attribution">via zine</span></figcaption></figure>' />
  );
  expect(document.querySelector('figcaption')?.className).toContain('text-[11px]');
});
```

In `bio-figure-node-view.spec.tsx`, assert the NodeView wrapper now carries the same float utilities when `float: 'left'` (`float-left`, `[shape-outside:margin-box]`, `mr-3`).

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/bio-html.spec.tsx src/app/components/ui/bio-figure-node-view.spec.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`bio-html.tsx`:

```ts
/** Static float-class map — Tailwind-visible literals only (never dynamic).
 *  shape-outside:margin-box + 0.75rem gutters keep prose hugging the figure
 *  without touching it — deliberately not zero-gap (unreadable). */
const FIGURE_FLOAT_CLASSES = new Map<string, string>([
  ['bio-figure--left', 'float-left [shape-outside:margin-box] mr-3 mb-2'],
  ['bio-figure--right', 'float-right [shape-outside:margin-box] ml-3 mb-2'],
  ['bio-figure--center', 'mx-auto mb-4'],
]);
```

`bio-figure-node-view.tsx` — the editor currently applies only the semantic `bio-figure--*` class (no visual float in the editing surface). Add a preview map and apply it alongside `classForFloat(float)` in the `NodeViewWrapper` `cn(...)`:

```ts
/** Editor-surface float preview — mirrors BioHtml's FIGURE_FLOAT_CLASSES so
 *  admins see the real wrap while editing. */
const FLOAT_PREVIEW_CLASSES: Record<BioFigureFloat, string> = {
  left: 'float-left [shape-outside:margin-box] mr-3 mb-2',
  right: 'float-right [shape-outside:margin-box] ml-3 mb-2',
  none: 'mx-auto mb-4',
};

const previewClassForFloat = (float: BioFigureFloat): string => {
  if (float === 'left') return FLOAT_PREVIEW_CLASSES.left;
  if (float === 'right') return FLOAT_PREVIEW_CLASSES.right;
  return FLOAT_PREVIEW_CLASSES.none;
};
```

and in the wrapper: `classForFloat(float), previewClassForFloat(float),`.

- [ ] **Step 4: Run** — `pnpm exec vitest run src/app/components/bio-html.spec.tsx src/app/components/ui/bio-figure-node-view.spec.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/bio-html.tsx src/app/components/bio-html.spec.tsx src/app/components/ui/bio-figure-node-view.tsx src/app/components/ui/bio-figure-node-view.spec.tsx
git commit -m "feat: ✨ shape-outside wrap + live float in editor

Floated figures get shape-outside:margin-box with 0.75rem gutters
in the public renderer, and the editor NodeView now applies the
same float classes so admins see the real text wrap while
dragging. Caption stays a fixed 11px at every width."
```

---

### Task B8: Palette upgrades — focus registry, click-to-insert, filter, counts, kind badges

**Files:**

- Create: `src/app/components/forms/bio-editor-registry.tsx` (context)
- Modify: `src/app/components/ui/rich-text-editor.tsx` (two optional props: `onEditorReady`, `onEditorFocus`)
- Modify: `src/app/components/forms/sections/artist-bio-section.tsx` (provider + wiring)
- Modify: `src/app/components/forms/bio-media-palettes.tsx`, `bio-link-palette.tsx`, `bio-image-palette.tsx`
- Test: `src/app/components/forms/bio-editor-registry.spec.tsx`, palette spec extensions

**Interfaces:**

- Produces:
  - `BioEditorRegistryProvider` + `useBioEditorRegistry(): { register: (name: string, editor: Editor) => void; unregister: (name: string) => void; setActive: (name: string) => void; getTarget: () => Editor | null }` — `getTarget` returns the active editor, else the first registered (registration order), else null. Context default: a no-op registry whose `getTarget` returns null (palettes outside the provider degrade to drag-only).
  - `RichTextEditor` new optional props: `onEditorReady?: (editor: Editor) => void` (called once from `onCreate`) and `onEditorFocus?: () => void` (called from the TipTap `onFocus` option).
  - `BioLinkPalette` gains `onInsert: (link: BioStatusLink) => void`; `BioImagePalette` gains `onInsert: (image: BioStatusImage) => void`; both render an Insert button per tile (`Plus` icon, `aria-label` \\`Insert link ${label}\\` / \\`Insert image ${label}\\`).
  - Both palettes gain: header count (`Discovered links (12)`), a filter `Input` (`aria-label` "Filter links" / "Filter images", matches label/kind or title/attribution/kind, case-insensitive), image kind `Badge` (photo/cover), and `max-h-80` scroll areas.
- Consumes: `buildBioLinkContent` / `buildBioFigureContent` (B5) — `BioMediaPalettes` converts a status row to the drag-payload shape and inserts via `getTarget()?.chain().focus().insertContent(...)`.

- [ ] **Step 1: Failing registry tests** — create `src/app/components/forms/bio-editor-registry.spec.tsx`:

```tsx
describe('BioEditorRegistry', () => {
  const Probe = (): JSX.Element => {
    const registry = useBioEditorRegistry();
    return (
      <button type="button" onClick={() => registry.setActive('short')}>
        activate-short
      </button>
    );
  };

  it('getTarget returns the active editor, else the first registered', () => {
    const editors = { bio: fakeEditor('bio'), short: fakeEditor('short') }; // fakeEditor: minimal {name} stub cast via unknown
    let captured: ReturnType<typeof useBioEditorRegistry> | null = null;
    const Capture = (): null => {
      captured = useBioEditorRegistry();
      return null;
    };
    render(
      <BioEditorRegistryProvider>
        <Capture />
        <Probe />
      </BioEditorRegistryProvider>
    );
    act(() => {
      captured?.register('bio', editors.bio);
      captured?.register('short', editors.short);
    });
    expect(captured?.getTarget()).toBe(editors.bio);
    act(() => captured?.setActive('short'));
    expect(captured?.getTarget()).toBe(editors.short);
    act(() => captured?.unregister('short'));
    expect(captured?.getTarget()).toBe(editors.bio);
  });

  it('defaults to a null target outside the provider', () => {
    let captured: ReturnType<typeof useBioEditorRegistry> | null = null;
    const Capture = (): null => {
      captured = useBioEditorRegistry();
      return null;
    };
    render(<Capture />);
    expect(captured?.getTarget()).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the registry** — create `src/app/components/forms/bio-editor-registry.tsx` (MPL header, `'use client'`):

```tsx
'use client';

import { createContext, useContext, useMemo, useRef } from 'react';
import type { JSX, ReactNode } from 'react';

import type { Editor } from '@tiptap/react';

interface BioEditorRegistryValue {
  register: (name: string, editor: Editor) => void;
  unregister: (name: string) => void;
  setActive: (name: string) => void;
  /** The focused editor, else the first registered, else null. */
  getTarget: () => Editor | null;
}

const NULL_REGISTRY: BioEditorRegistryValue = {
  register: () => {},
  unregister: () => {},
  setActive: () => {},
  getTarget: () => null,
};

const BioEditorRegistryContext = createContext<BioEditorRegistryValue>(NULL_REGISTRY);

/** Access the bio editor registry (a no-op registry outside the provider). */
export const useBioEditorRegistry = (): BioEditorRegistryValue =>
  useContext(BioEditorRegistryContext);

/**
 * Tracks the bio editors on the artist form so the media palettes can insert
 * at the focused editor's cursor (click-to-insert — the touch and keyboard
 * path; HTML5 drag does not exist on touchscreens). Refs, not state: focus
 * changes must not re-render the whole form.
 */
export const BioEditorRegistryProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const editorsRef = useRef(new Map<string, Editor>());
  const activeRef = useRef<string | null>(null);

  const value = useMemo<BioEditorRegistryValue>(
    () => ({
      register: (name, editor) => {
        editorsRef.current.set(name, editor);
      },
      unregister: (name) => {
        editorsRef.current.delete(name);
        if (activeRef.current === name) activeRef.current = null;
      },
      setActive: (name) => {
        activeRef.current = name;
      },
      getTarget: () => {
        const active = activeRef.current ? editorsRef.current.get(activeRef.current) : undefined;
        return active ?? editorsRef.current.values().next().value ?? null;
      },
    }),
    []
  );

  return (
    <BioEditorRegistryContext.Provider value={value}>{children}</BioEditorRegistryContext.Provider>
  );
};
```

- [ ] **Step 3: RichTextEditor hooks.** Add the two optional props; in `useEditor` options add `onCreate: ({ editor: instance }) => onEditorReady?.(instance)` and `onFocus: () => onEditorFocus?.()`. In `artist-bio-section.tsx`, wrap the section content in `BioEditorRegistryProvider`; inside `BioEditorField` (move it INSIDE the provider tree) call `useBioEditorRegistry()` and wire `onEditorReady={(instance) => registry.register(name, instance)}` + `onEditorFocus={() => registry.setActive(name)}` (unregister in a `useEffect` cleanup).

- [ ] **Step 4: Failing palette tests** — extend `bio-link-palette` and `bio-image-palette` specs (they render with fake rows):

```ts
it('renders the count, filters by text, and inserts on click', async () => {
  const onInsert = vi.fn();
  render(<BioLinkPalette links={links} onDelete={vi.fn()} onInsert={onInsert} />);
  expect(screen.getByText(/Discovered links \(2\)/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Filter links'), 'bandcamp');
  expect(screen.queryByText('Wikipedia')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Insert link Ceschi on Bandcamp' }));
  expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ label: 'Ceschi on Bandcamp' }));
});
```

and for images: count in "Discovered images (n)", `Filter images` filtering by attribution, a `cover`/`photo` Badge when `kind` present, and an `Insert image …` button calling `onInsert`.

- [ ] **Step 5: Implement palette changes.**
- Both palettes: header `<h3>` shows `Discovered links ({links.length})` / `Discovered images ({images.length})`; add `const [filter, setFilter] = useState('')` + an `Input` (from `@/app/components/ui/input`) with the aria-label; filter rows case-insensitively (`link.label`/`link.kind ?? ''` vs `image.title ?? ''`/`image.attribution ?? ''`/`image.kind ?? ''`); `max-h-64` → `max-h-80`; add the Insert button beside the delete X (`Plus` from lucide-react), `disabled={disabled}`.
- Image tile: when `image.kind`, render `<Badge variant="outline" className="absolute top-1 left-1 bg-background/80 text-[10px]">{image.kind}</Badge>`; use `image.alt ?? title ?? 'Artist photo'` for the thumbnail alt (alt now flows from discovery).
- Image drag payload + insert payload: pass `alt: image.alt ?? alt` so vision alt text rides along.
- `bio-media-palettes.tsx`: pull `useBioEditorRegistry`; build insert handlers:

```ts
const registry = useBioEditorRegistry();

const insertLink = (link: BioStatusLink): void => {
  const target = registry.getTarget();
  if (!target) return;
  target
    .chain()
    .focus()
    .insertContent(
      buildBioLinkContent({
        label: link.label,
        url: link.url,
        kind: link.kind ?? null,
        isExternal: !isInternalBioUrl(link.url),
      })
    )
    .run();
};

const insertImage = (image: BioStatusImage): void => {
  const target = registry.getTarget();
  if (!target) return;
  target
    .chain()
    .focus()
    .insertContent(
      buildBioFigureContent({
        url: image.url,
        thumbnailUrl: image.thumbnailUrl ?? null,
        title: image.title ?? null,
        attribution: image.attribution ?? null,
        alt: image.alt ?? image.title ?? 'Artist photo',
        width: image.width ?? null,
        height: image.height ?? null,
      })
    )
    .run();
};
```

and pass `onInsert={insertLink}` / `onInsert={insertImage}` down.

- [ ] **Step 6: Run** — `pnpm exec vitest run src/app/components/forms` — Expected: PASS (update any existing palette specs whose render lacks the new required `onInsert` prop).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/forms/bio-editor-registry.tsx src/app/components/forms/bio-editor-registry.spec.tsx src/app/components/forms/bio-media-palettes.tsx src/app/components/forms/bio-link-palette.tsx src/app/components/forms/bio-image-palette.tsx src/app/components/ui/rich-text-editor.tsx src/app/components/forms/sections/artist-bio-section.tsx
git commit -m "feat: ✨ palette click-to-insert, filter, counts

An editor registry tracks the focused bio editor so tiles insert
at its cursor — the touch/keyboard path beside drag. Palettes gain
counts, a filter input for 100-item lists, photo/cover badges, and
vision alt text rides into inserted figures."
```

---

### Task B9: Sticky right-rail layout

**Files:**

- Modify: `src/app/components/forms/sections/artist-bio-section.tsx`
- Test: `src/app/components/forms/sections/artist-bio-section.spec.tsx` (extend)

**Interfaces:** layout only. DOM order: palettes BEFORE editors (mobile shows palettes above, matching today); on `xl+` a grid places editors left (~2/3, `xl:order-1`) and palettes in a sticky right rail (`xl:order-2`).

- [ ] **Step 1: Failing test** — assert the wrapper classes:

```ts
it('lays palettes in a sticky right rail on xl', () => {
  render(<ArtistBioSection {...editModeProps} />);
  const rail = screen.getByTestId('bio-media-rail');
  expect(rail.className).toContain('xl:sticky');
  expect(rail.className).toContain('xl:order-2');
  const editors = screen.getByTestId('bio-editors-column');
  expect(editors.className).toContain('xl:order-1');
});
```

- [ ] **Step 2: Implement** — in `artist-bio-section.tsx` the edit-mode body becomes:

```tsx
<section className="space-y-4">
  <h2 className="font-semibold">Biography</h2>

  {isEditMode && artistId && (
    <ArtistBioGenerationSection artistId={artistId} onGenerated={onBioGenerated} />
  )}

  <BioEditorRegistryProvider>
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
      {isEditMode && artistId && (
        <div
          data-testid="bio-media-rail"
          className="xl:sticky xl:top-24 xl:order-2 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
        >
          <BioMediaPalettes artistId={artistId} />
        </div>
      )}
      <div data-testid="bio-editors-column" className="space-y-4 xl:order-1">
        {/* the three BioEditorField instances, unchanged */}
      </div>
    </div>
  </BioEditorRegistryProvider>
</section>
```

`BioMediaPalettes`'s internal grid becomes a single column (`grid gap-4` without `md:grid-cols-2`) when inside the rail — change it to `grid gap-4 md:grid-cols-2 xl:grid-cols-1` so mobile/md keep side-by-side and the rail stacks.

- [ ] **Step 3: Run** — `pnpm exec vitest run src/app/components/forms/sections` then `pnpm run dev` and verify at ≥1280px: palettes stay in view while scrolling all three editors; below 1280px palettes sit above the editors; drag AND click-to-insert both work into all three editors.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/forms/sections/artist-bio-section.tsx src/app/components/forms/sections/artist-bio-section.spec.tsx src/app/components/forms/bio-media-palettes.tsx
git commit -m "feat: ✨ sticky palette rail beside the bio editors

Palettes ride a sticky right rail on xl so the drop targets stay
adjacent while scrolling all three editors; smaller screens keep
the palettes-above layout."
```

---

### Task B10: E2E coverage, full gates, PR

**Files:**

- Create: `e2e/tests/admin/bio-media-palettes.spec.ts`
- Modify: existing admin bio e2e if fixture-shape assertions break (search `e2e/tests` for `Discovered links` / `bio` specs first)

**Interfaces:** consumes the deterministic fixture (`BIO_GENERATOR_FAKE=true`, already the E2E default) which after B1 returns 2 images (photo+cover, with alt) and links incl. `press`.

- [ ] **Step 1: Write the E2E spec** (fixtures from `e2e/fixtures/`, role-based locators, parallel-safe — follow `e2e/tests/` conventions; use the admin fixture user and an artist created via the existing helpers):

```ts
test('palettes support filter, click-to-insert, and persistence', async ({ adminPage }) => {
  // 1. open the artist edit page, trigger Generate bios, await status success
  // 2. expect headings: 'Discovered links (' and 'Discovered images ('
  // 3. filter links by 'interview' → press link visible, others filtered out
  // 4. click 'Insert link An interview with the artist' → the Bio editor
  //    contains an <a> with the anchor text (role link inside the textbox)
  // 5. click 'Insert image Fixture Album…' → the Bio editor contains a figure
  //    with the alt 'Fixture Album cover art'
  // 6. save the artist; reload; the persisted bio renders the link + figure
  // 7. cover badge visible on the cover tile; eye preview still opens
});
```

Write it as real steps with the project's page helpers (`await adminPage.getByRole('button', { name: /generate/i }).click()` etc.), keeping each assertion role-based. Add a drag-based insertion case ONLY if the existing suite already has a working HTML5 drag helper; otherwise click-to-insert is the E2E-stable path (drag stays covered by unit tests on `handleBioEditorDrop`).

- [ ] **Step 2: Run E2E locally (Docker isolation — MANDATORY)**

```bash
pnpm run e2e:docker:up
pnpm run test:e2e
pnpm run e2e:docker:down
```

Expected: all green, including the new spec. Never point E2E at any DB other than `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`.

- [ ] **Step 3: Full gates + coverage**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
pnpm run test:coverage:check
cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run && cd ..
```

Expected: all green; coverage not below the `COVERAGE_METRICS.md` baseline.

- [ ] **Step 4: Commit E2E, push, open the PR**

```bash
git add e2e/
git commit -m "test: ✅ e2e palette filter, insert, persistence"
git push -u origin feat/bio-media-discovery-v2
gh pr create --title "feat: bio media discovery v2 — verified 100-item palettes, atom links, sticky rail" --body "$(cat <<'EOF'
## Summary
- Lambda: links→100 (descriptive labels, press kind, MB service rels), images→100 best-effort via Commons categories + Cover Art Archive + Gemini-vision-verified scraping (fail-closed, alt text), chronology-grounded prompts, claim-checking critic, links-first emphasis, internal /releases links in prose
- App: kind/alt through the whole pipeline, label releases ground generation and seed rights-cleared cover art, pooled re-host concurrency
- Editor: BioLink inline atom nodes (drag as a unit, X-remove, dialog editing) serializing to the unchanged sanitizer contract; shape-outside figure wrap incl. live editor preview
- Admin UI: sticky palette rail, click-to-insert (touch/keyboard path), filters, counts, photo/cover badges
- Site: links underline globally; button/nav-tile anchors opt out

Spec: docs/auto-generated/2026-07-03-bio-media-discovery-v2-design.md
Plan: docs/auto-generated/2026-07-04-bio-media-discovery-v2-plan.md

## Test plan
- [ ] unit: 4 gates green, coverage ≥ baseline, bio-generator workspace suite green
- [ ] e2e: docker-isolated suite green incl. new palette spec
- [ ] manual: regenerate a real artist (e.g. Ceschi) after lambda deploy; verify image subjects, labels, chronology-clean dates
EOF
)"
```

(The PR body contains no AI-attribution lines, per repo policy.)

---

## Plan self-review notes (already applied)

- **Spec coverage:** every spec section maps to tasks — links (A2/A3/A7), images+vision (A3–A7), prose/fact-check (A8), app services (B1–B3), editor atom links (B4/B5), underline (B6), wrap (B7), palette UX (B8), rail (B9), testing/rollout (B10). Deliberately out of scope per spec: AI image generation, sanitizer changes, zero-gap wrap, virtualization.
- **Type consistency:** `kind: 'photo' | 'cover'` and `alt` are identical in lambda types (A1), app zod (B1), Prisma (B1), drag payload consumers (B8). `BioLinkAttributes { href, text, external }` is shared by B4 (definition), B5 (dialog/drop), B8 (insert builders → attrs). `ReleaseCoverSource` feeds `toLambdaReleases`/`appendReleaseLinks`/`appendInternalCoverImages` (B3). `VisionContext` is defined in A6 and built in A7.
- **Known judgment points for the implementer:** exact stub-factory names in `handler.spec.ts`/`bio-generation-service.spec.ts` (`makeDeps`, spies) must be adapted to those files' real helper names; the toolbar file needs the `isLink` rename only if it references the mark name directly; `desktop-menu`/`logo` class edits are additive `no-underline` appends.

## Execution

Work through tasks in order (A1→A8 are ordered; B1 depends on A1's shapes; B4→B5→B8 are ordered; B6/B7 are independent of B2–B5). One commit per task minimum, gates before every commit.
