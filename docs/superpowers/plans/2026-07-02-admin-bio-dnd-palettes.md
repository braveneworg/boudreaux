# Admin Bio DnD Palettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only discovered links/images into curated, draggable palettes feeding the three TipTap bio editors, add a resizable/floatable `bioFigure` node with captions, branch link handling by origin, and fully re-host embedded images (with an SSRF guard) at save time.

**Architecture:** Palettes read the persisted `ArtistBioLink`/`ArtistBioImage` rows through the existing bio-generation status query (widened with row ids) and delete rows via admin server actions + TanStack invalidation. The editor gains a `bioFigure` atom node (React NodeView: pointer-event resize, float toggles, delete overlay) and a `handleDrop` for two custom drag MIME types. The sanitizer and `BioHtml` branch `<a>` handling by origin and allow `figure`/`figcaption`. On artist save, embedded images that are thumbnails or external URLs are re-hosted with full variants (private-IP-guarded) and srcs rewritten before persistence.

**Tech Stack:** Next.js 16 App Router, React 19, TipTap 3.27 (`@tiptap/react/menus` BubbleMenu), sanitize-html, Prisma 6 + MongoDB, TanStack Query 5, Vitest 4, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-bio-palettes-editor-dnd-design.md` (PR 2 section). Binding decisions: image discovery is scraping-only (LLM never produces image URLs); streaming links allowed everywhere; links-first richer emphasis; **native HTML5 drag + ProseMirror — no dnd-kit for palette→editor**; links stay TipTap marks with a bubble menu (NOT atomic chips); caption text never renders below **11px** and does not scale with the image; palettes are curated by deletion only (no reordering); no AI-generated imagery; no editing of link labels/URLs in the palette.
- Internal links branch by origin: external `<a>` gets `rel="nofollow noopener noreferrer"` + `target="_blank"` + external icon; internal (`/releases/…`, `/artists/…`, own host) renders as a plain same-tab link, no rel trio, no icon.
- Save-time re-host failures are caught, logged, and non-blocking: the save succeeds with the thumbnail URL still in place, and the next save retries.
- Palette delete actions return the standard `{ success, error }` envelope; TanStack invalidation restores consistency.
- Float classes are a static Tailwind-visible map — never dynamic class names.
- Repo rules (AGENTS.md) bind every task: TDD RED→GREEN; arrow functions; named exports; no `any`/`!`/suppressions; complexity ≤10, max-depth ≤3, max-params ≤4; `describe`/`it`/`expect`/`vi` are globals (never import from `vitest`); `vi.mock('server-only', () => ({}))` in server-only specs; one condition per test; MPL header from `HEADER.txt` on every new file; commit subjects ≤50 chars `type(scope): <gitmoji> subject`; no AI attribution; toggles/radios, never checkboxes; shadcn/ui primitives only; icons from lucide-react.
- Gates after each task: covering specs green. Before the branch ships: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` + `pnpm run test:coverage:check`.
- E2E only against `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (see AGENTS.md E2E isolation — hard constraint).

## File Structure

| File                                                                                                     | Responsibility                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/lib/repositories/artist-repository.ts`                                                              | +`id` in bio selects; `deleteBioLink`, `deleteBioImage`, `findBioImagesForRehost`, `updateBioImageUrl` |
| `src/lib/repositories/release-repository.ts`                                                             | +`findPublishedByArtist`                                                                               |
| `src/lib/validation/bio-generation-schema.ts`                                                            | status content rows gain `id`; link `kind` += `'release'`; status link URL accepts relative paths      |
| `src/lib/validation/bio-dnd-schema.ts` (new)                                                             | drag MIME constants + zod payload schemas                                                              |
| `src/lib/actions/delete-artist-bio-link-action.ts`, `delete-artist-bio-image-action.ts` (new)            | admin X-delete server actions                                                                          |
| `src/lib/services/bio-generation-service.ts`                                                             | release-link injection before persist                                                                  |
| `src/lib/services/artist-service.ts`                                                                     | `deleteBioLink`/`deleteBioImage` service wrappers + save-time `finalizeBioImages`                      |
| `src/lib/services/bio-image-service.ts`                                                                  | (consumed) `rehostWithVariants` for save-time re-host                                                  |
| `src/lib/utils/is-internal-url.ts` (new)                                                                 | origin classification shared by sanitizer/renderer/editor                                              |
| `src/lib/utils/ip-guard.ts` (new)                                                                        | private-IP/SSRF predicates extracted from proxy-image route                                            |
| `src/lib/utils/sanitize-bio-html.ts`                                                                     | shared base allowlist, `figure`/`figcaption`, origin-branched `transformTags.a`                        |
| `src/app/components/bio-html.tsx`                                                                        | figure rendering (float map, ≥11px captions), internal-link branch                                     |
| `src/app/components/ui/bio-figure-extension.ts` (new)                                                    | TipTap `bioFigure` node (parse/render)                                                                 |
| `src/app/components/ui/bio-figure-node-view.tsx` (new)                                                   | React NodeView (resize/float/delete)                                                                   |
| `src/app/components/ui/bio-editor-drop.ts` (new)                                                         | `handleDrop` logic as a testable unit                                                                  |
| `src/app/components/ui/rich-text-editor.tsx`                                                             | register bioFigure, drop handler, link bubble menu, upgraded dialogs                                   |
| `src/app/components/forms/bio-link-palette.tsx`, `bio-image-palette.tsx`, `bio-media-palettes.tsx` (new) | palette tiles + data wiring                                                                            |
| `src/app/components/forms/artist-bio-generation-section.tsx`                                             | remove `DiscoveredLinks`/`DiscoveredImages`                                                            |
| `src/app/components/forms/sections/artist-bio-section.tsx`                                               | mount palettes above editors                                                                           |
| `src/app/hooks/mutations/use-bio-media-mutations.ts` (new)                                               | delete mutations + invalidation                                                                        |
| `e2e/`                                                                                                   | palette visibility/delete, figure persistence                                                          |

---

### Task 1: Widen the bio contract — row ids, `release` kind, relative link URLs

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts` (getBioGenerationState select + inline return type, ~lines 477-532)
- Modify: `src/lib/validation/bio-generation-schema.ts`
- Test: `src/lib/validation/bio-generation-schema.spec.ts`, `src/lib/repositories/artist-repository.spec.ts` (existing files — extend)

**Interfaces:**

- Consumes: `ArtistRepository.getBioGenerationState(artistId)`, `bioGenerationStatusResponseSchema`, `GeneratedBioContent`.
- Produces: status content `images[i].id: string`, `links[i].id: string`; link `kind` enum includes `'release'`; status link `url` accepts site-relative paths (`/releases/…`). **The lambda contract schemas (`bioGenerationResponseSchema` etc.) must NOT gain `id`** — only the persisted/status side.

Background: `getGenerationStatus` (bio-generation-service.ts:420) passes `state.bioImages`/`state.bioLinks` straight into the status content. The repo select currently omits `id`. Palettes (Task 5) need row ids for deletion, and injected release links (Task 2) use relative URLs which `z.string().url()` rejects.

- [ ] **Step 1: Write the failing tests**

In `src/lib/validation/bio-generation-schema.spec.ts` add:

```ts
describe('bioGenerationStatusResponseSchema content rows', () => {
  const baseContent = {
    shortBio: '<p>s</p>',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: null,
    model: 'gemini-2.5-flash',
  };

  it('accepts images carrying a row id', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [
          {
            id: '665f1f77bcf86cd799439011',
            url: 'https://cdn.example/a.webp',
            attribution: 'Wikimedia Commons',
            isPrimary: false,
          },
        ],
        links: [],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts links carrying a row id', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [
          {
            id: '665f1f77bcf86cd799439012',
            label: 'Wikipedia',
            url: 'https://en.wikipedia.org/wiki/X',
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a site-relative release link url', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [
          {
            id: '665f1f77bcf86cd799439013',
            label: 'Album',
            url: '/releases/665f1f77bcf86cd799439014',
            kind: 'release',
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a status link url that is neither http(s) nor site-relative', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [{ id: '665f1f77bcf86cd799439015', label: 'Bad', url: 'javascript:alert(1)' }],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/validation/bio-generation-schema.spec.ts`
Expected: FAIL — `id` unrecognized/required mismatch and relative URL rejected.

- [ ] **Step 3: Implement the schema changes**

In `src/lib/validation/bio-generation-schema.ts`:

```ts
/** A link URL as persisted: absolute http(s) or a site-relative path (injected release links). */
const bioStatusLinkUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => /^https?:\/\//.test(value) || (value.startsWith('/') && !value.startsWith('//')),
    { message: 'Must be an http(s) URL or a site-relative path' }
  );

/** Persisted bio image row as returned by the status endpoint (DB row id included). */
export const bioStatusImageSchema = bioGenerationImageSchema.extend({ id: z.string() });

/** Persisted bio link row as returned by the status endpoint (DB row id included). */
export const bioStatusLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: bioStatusLinkUrlSchema,
  kind: z
    .enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'release', 'other'])
    .nullable()
    .optional(),
});
```

Point the status content at these: inside `bioGenerationStatusResponseSchema`'s `content` object replace the images/links entries with `images: z.array(bioStatusImageSchema)` and `links: z.array(bioStatusLinkSchema)`. If `GeneratedBioContent` is inferred from the content schema, the type picks the ids up automatically; if it aliases the lambda-side schemas, redefine it from the status content schema. Also add `'release'` to the existing lambda-side link `kind` enum at line 48 ONLY if the same enum object is shared with the status schema — otherwise leave the lambda enum untouched (the lambda never emits `release`).

- [ ] **Step 4: Extend the repo select**

In `artist-repository.ts` `getBioGenerationState`: add `id: true` to both the `bioImages` select and the `bioLinks` select, and add `id: string` to the matching fields in the inline return type. Extend the existing repo spec's mocked return + assertion to include `id`.

- [ ] **Step 5: Chase the type ripple**

Run: `pnpm run typecheck`
Fix every consumer that now sees `id` (e.g. `bio-generation-fixture.ts` if it fabricates status content, `artist-form.tsx` `handleBioGenerated` mapping — `content.images.map(...)` keeps working since it only reads `url`/`title`). Do not add `id` to anything feeding the lambda contract.

- [ ] **Step 6: Verify green + commit**

Run: `pnpm exec vitest run src/lib/validation/bio-generation-schema.spec.ts src/lib/repositories/artist-repository.spec.ts && pnpm run typecheck`
Commit: `feat(bio): ✨ expose bio row ids in status`

---

### Task 2: Inject internal release links after generation

**Files:**

- Modify: `src/lib/repositories/release-repository.ts` (near `findPublishedByArtistExcluding`, line 538)
- Modify: `src/lib/types/domain/release.ts`
- Modify: `src/lib/services/bio-generation-service.ts` (the step that assembles `links` for `ArtistRepository.replaceBioContent`)
- Test: `src/lib/repositories/release-repository.spec.ts`, `src/lib/services/bio-generation-service.spec.ts`

**Interfaces:**

- Consumes: `ArtistRepository.replaceBioContent(artistId, content)` link shape `{ label, url, kind?, sortOrder }` (verify exact shape in the repo before writing).
- Produces: `ReleaseRepository.findPublishedByArtist(artistId: string): Promise<ReleaseLinkSource[]>` where `interface ReleaseLinkSource { id: string; title: string }` (add to `src/lib/types/domain/release.ts`).

- [ ] **Step 1: Failing repo test**

```ts
describe('findPublishedByArtist', () => {
  it('returns id and title of published releases for the artist, newest first', async () => {
    prismaMock.release.findMany.mockResolvedValue([
      { id: 'r2', title: 'Second' },
      { id: 'r1', title: 'First' },
    ]);
    const result = await ReleaseRepository.findPublishedByArtist('artist-1');
    expect(result).toEqual([
      { id: 'r2', title: 'Second' },
      { id: 'r1', title: 'First' },
    ]);
  });
});
```

Match the spec file's existing prisma-mock idiom (see the `findPublishedByArtistExcluding` tests in the same file) rather than the `prismaMock` name above if it differs.

- [ ] **Step 2: Verify fail, implement**

`findPublishedByArtist` mirrors `findPublishedByArtistExcluding`'s `where` (published filter + artist membership — copy it exactly, minus the id exclusion) with `select: { id: true, title: true }`, `orderBy: { releasedOn: 'desc' }`, returning the rows directly.

- [ ] **Step 3: Failing service test**

In `bio-generation-service.spec.ts` (find the tests covering the persist step / `replaceBioContent` call):

```ts
it('appends kind:release links for the artist published releases', async () => {
  vi.mocked(ReleaseRepository.findPublishedByArtist).mockResolvedValue([
    { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck' },
  ]);
  // ...run the generation success path with one discovered link...
  const persisted = vi.mocked(ArtistRepository.replaceBioContent).mock.calls[0][1];
  expect(persisted.links).toContainEqual(
    expect.objectContaining({
      label: 'Sad, Fat Luck',
      url: '/releases/665f1f77bcf86cd799439021',
      kind: 'release',
    })
  );
});

it('does not duplicate a release link already present', async () => {
  vi.mocked(ReleaseRepository.findPublishedByArtist).mockResolvedValue([
    { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck' },
  ]);
  // ...run with a discovered link whose url is already '/releases/665f1f77bcf86cd799439021'...
  const persisted = vi.mocked(ArtistRepository.replaceBioContent).mock.calls[0][1];
  const matches = persisted.links.filter(
    (link: { url: string }) => link.url === '/releases/665f1f77bcf86cd799439021'
  );
  expect(matches).toHaveLength(1);
});

it('persists the discovered links unchanged when the release lookup fails', async () => {
  vi.mocked(ReleaseRepository.findPublishedByArtist).mockRejectedValue(new Error('db down'));
  // ...run the success path...
  expect(vi.mocked(ArtistRepository.replaceBioContent)).toHaveBeenCalled();
});
```

- [ ] **Step 4: Implement injection**

In `bio-generation-service.ts`, immediately before `replaceBioContent` is invoked on the success path:

```ts
/** Appends internal release links (label = release title) after the discovered links.
 *  Failure is non-fatal: generation content persists without release links. */
const appendReleaseLinks = async (
  artistId: string,
  links: BioContentLink[]
): Promise<BioContentLink[]> => {
  try {
    const releases = await ReleaseRepository.findPublishedByArtist(artistId);
    const seen = new Set(links.map((link) => link.url));
    const releaseLinks = releases
      .filter((release) => !seen.has(`/releases/${release.id}`))
      .map((release, index) => ({
        label: release.title,
        url: `/releases/${release.id}`,
        kind: 'release',
        sortOrder: links.length + index,
      }));
    return [...links, ...releaseLinks];
  } catch (error) {
    loggers.bio.warn('bio_release_links_failed', { artistId, error: String(error) });
    return links;
  }
};
```

Use the module's actual link type name and logger instance (read the file first). Wire it into the persist path.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec vitest run src/lib/repositories/release-repository.spec.ts src/lib/services/bio-generation-service.spec.ts && pnpm run typecheck`
Commit: `feat(bio): ✨ inject internal release links`

---

### Task 3: Row-delete repository methods + admin server actions

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts`
- Modify: `src/lib/services/artist-service.ts`
- Create: `src/lib/actions/delete-artist-bio-link-action.ts`, `src/lib/actions/delete-artist-bio-image-action.ts`
- Test: `src/lib/repositories/artist-repository.spec.ts`, `src/lib/services/artist-service.spec.ts`, `src/lib/actions/delete-artist-bio-link-action.spec.ts`, `src/lib/actions/delete-artist-bio-image-action.spec.ts`

**Interfaces:**

- Consumes: `runAdminEntityAction` (`src/lib/actions/run-admin-entity-action.ts:50`), `deleteS3Object(s3Key)` (`src/lib/utils/s3-client.ts:191`), `extractS3KeyFromUrl` (`src/lib/utils/s3-key-utils.ts:14`).
- Produces: `ArtistRepository.deleteBioLink(linkId: string): Promise<void>`; `ArtistRepository.deleteBioImage(imageId: string): Promise<{ url: string; thumbnailUrl: string | null }>`; `ArtistService.deleteBioLink(linkId: string): Promise<void>`; `ArtistService.deleteBioImage(imageId: string): Promise<void>` (row delete + best-effort thumb cleanup); `deleteArtistBioLinkAction(linkId): Promise<AdminActionResult>`; `deleteArtistBioImageAction(imageId): Promise<AdminActionResult>`.

- [ ] **Step 1: Failing repo tests**

```ts
describe('deleteBioLink', () => {
  it('deletes the link row by id', async () => {
    await ArtistRepository.deleteBioLink('link-1');
    expect(prismaMock.artistBioLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
  });
});

describe('deleteBioImage', () => {
  it('deletes the image row and returns its urls for cleanup', async () => {
    prismaMock.artistBioImage.delete.mockResolvedValue({
      url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      thumbnailUrl: null,
    });
    const removed = await ArtistRepository.deleteBioImage('img-1');
    expect(removed.url).toBe('https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp');
  });
});
```

- [ ] **Step 2: Implement repo methods**

```ts
/** Deletes a single discovered bio link row (palette X). */
static async deleteBioLink(linkId: string): Promise<void> {
  await prisma.artistBioLink.delete({ where: { id: linkId } });
}

/** Deletes a single discovered bio image row (palette X) and returns its
 *  stored URLs so the caller can clean up the CDN thumbnail. */
static async deleteBioImage(imageId: string): Promise<{ url: string; thumbnailUrl: string | null }> {
  const removed = await prisma.artistBioImage.delete({
    where: { id: imageId },
    select: { url: true, thumbnailUrl: true },
  });
  return removed;
}
```

- [ ] **Step 3: Failing service tests**

In `artist-service.spec.ts`:

```ts
describe('deleteBioImage', () => {
  it('removes the CDN bio thumbnail after deleting the row', async () => {
    vi.mocked(ArtistRepository.deleteBioImage).mockResolvedValue({
      url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      thumbnailUrl: null,
    });
    await ArtistService.deleteBioImage('img-1');
    expect(vi.mocked(deleteS3Object)).toHaveBeenCalledWith(
      'media/artists/a1/bio/thumbs/0-abc.webp'
    );
  });

  it('does not touch S3 for a non-bio url', async () => {
    vi.mocked(ArtistRepository.deleteBioImage).mockResolvedValue({
      url: 'https://upload.wikimedia.org/photo.jpg',
      thumbnailUrl: null,
    });
    await ArtistService.deleteBioImage('img-1');
    expect(vi.mocked(deleteS3Object)).not.toHaveBeenCalled();
  });

  it('still succeeds when thumbnail cleanup fails', async () => {
    vi.mocked(ArtistRepository.deleteBioImage).mockResolvedValue({
      url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      thumbnailUrl: null,
    });
    vi.mocked(deleteS3Object).mockResolvedValue(false);
    await expect(ArtistService.deleteBioImage('img-1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Implement service wrappers**

```ts
/** Path marker for generation-time bio media on the CDN — the only keys the
 *  palette delete is allowed to clean up. */
const BIO_MEDIA_PATH_MARKER = '/bio/';

const cleanupBioMediaObject = async (url: string | null): Promise<void> => {
  if (!url || !url.includes(BIO_MEDIA_PATH_MARKER)) return;
  const s3Key = extractS3KeyFromUrl(url);
  if (s3Key) await deleteS3Object(s3Key);
};

static async deleteBioLink(linkId: string): Promise<void> {
  await ArtistRepository.deleteBioLink(linkId);
}

static async deleteBioImage(imageId: string): Promise<void> {
  const removed = await ArtistRepository.deleteBioImage(imageId);
  await cleanupBioMediaObject(removed.url);
  await cleanupBioMediaObject(removed.thumbnailUrl);
}
```

`deleteS3Object` already never throws (returns `false` on error), so cleanup is inherently best-effort.

- [ ] **Step 5: Failing action tests + implement actions**

Copy the structure of `src/lib/actions/delete-featured-artist-action.ts` and its spec verbatim as the template:

```ts
'use server';
// MPL header

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction } from './run-admin-entity-action';

import type { AdminActionResult } from './run-admin-entity-action';

/** Deletes one discovered bio link (admin palette X). */
export const deleteArtistBioLinkAction = async (linkId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: linkId,
    entityLabel: 'artist bio link',
    perform: (id) => ArtistService.deleteBioLink(id),
    event: 'media.artist_bio_link.deleted',
    metadataKey: 'artistBioLinkId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to delete bio link',
  });
```

`deleteArtistBioImageAction` is identical with `ArtistService.deleteBioImage`, `event: 'media.artist_bio_image.deleted'`, `metadataKey: 'artistBioImageId'`, `failureError: 'Failed to delete bio image'`. Note in a comment: the public `/artists/[slug]/bio` page reflects deletions on its next revalidation/regeneration — the admin palette is kept live via TanStack invalidation (Task 5).

- [ ] **Step 6: Verify + commit**

Run: `pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts src/lib/services/artist-service.spec.ts src/lib/actions/delete-artist-bio-link-action.spec.ts src/lib/actions/delete-artist-bio-image-action.spec.ts && pnpm run typecheck`
Commit: `feat(bio): ✨ admin delete for bio rows`

---

### Task 4: Drag payload schemas + palette tile components

**Files:**

- Create: `src/lib/validation/bio-dnd-schema.ts`
- Create: `src/app/components/forms/bio-link-palette.tsx`, `src/app/components/forms/bio-image-palette.tsx`
- Test: `src/lib/validation/bio-dnd-schema.spec.ts`, `src/app/components/forms/bio-link-palette.spec.tsx`, `src/app/components/forms/bio-image-palette.spec.tsx`

**Interfaces:**

- Produces:
  - `BIO_LINK_DRAG_MIME = 'application/x-bio-link'`, `BIO_IMAGE_DRAG_MIME = 'application/x-bio-image'`
  - `bioLinkDragPayloadSchema` → `{ label: string, url: string, kind: string | null, isExternal: boolean }` (`BioLinkDragPayload`)
  - `bioImageDragPayloadSchema` → `{ url: string, thumbnailUrl: string | null, title: string | null, attribution: string | null, alt: string, width: number | null, height: number | null }` (`BioImageDragPayload`)
  - `BioLinkPalette({ links, onDelete, disabled })` where `links: BioStatusLink[]` (from Task 1's `bioStatusLinkSchema` inference)
  - `BioImagePalette({ images, onDelete, disabled })` where `images: BioStatusImage[]`

- [ ] **Step 1: Failing schema tests**

```ts
describe('bioLinkDragPayloadSchema', () => {
  it('parses a valid link payload', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Ceschi',
      kind: 'wikipedia',
      isExternal: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing the url', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({ label: 'x', kind: null, isExternal: true });
    expect(parsed.success).toBe(false);
  });
});
```

Mirror for the image schema (valid payload parses; missing `url` rejects).

- [ ] **Step 2: Implement `bio-dnd-schema.ts`**

```ts
// MPL header
import { z } from 'zod';

/** Drag MIME type for palette link tiles → the bio editors. */
export const BIO_LINK_DRAG_MIME = 'application/x-bio-link';
/** Drag MIME type for palette image tiles → the bio editors. */
export const BIO_IMAGE_DRAG_MIME = 'application/x-bio-image';

export const bioLinkDragPayloadSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
  kind: z.string().nullable(),
  isExternal: z.boolean(),
});
export type BioLinkDragPayload = z.infer<typeof bioLinkDragPayloadSchema>;

export const bioImageDragPayloadSchema = z.object({
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable(),
  title: z.string().nullable(),
  attribution: z.string().nullable(),
  alt: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type BioImageDragPayload = z.infer<typeof bioImageDragPayloadSchema>;
```

- [ ] **Step 3: Failing palette component tests**

`bio-link-palette.spec.tsx` (client component test — no server-only mock needed):

```tsx
const LINKS = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X', kind: 'wikipedia' },
  { id: 'l2', label: 'Sad, Fat Luck', url: '/releases/r1', kind: 'release' },
];

it('renders one tile per link with its kind badge', () => {
  render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
  expect(screen.getByText('Wikipedia')).toBeInTheDocument();
});

it('shows the external icon only for external links', () => {
  render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
  const internalTile = screen.getByText('Sad, Fat Luck').closest('li');
  expect(internalTile?.querySelector('[data-external-icon]')).toBeNull();
});

it('calls onDelete with the row id when X is pressed', async () => {
  const onDelete = vi.fn();
  render(<BioLinkPalette links={LINKS} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole('button', { name: 'Delete link Wikipedia' }));
  expect(onDelete).toHaveBeenCalledWith('l1');
});

it('sets the link drag payload on dragstart', () => {
  render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
  const setData = vi.fn();
  fireEvent.dragStart(screen.getByText('Wikipedia').closest('li') as HTMLElement, {
    dataTransfer: { setData, effectAllowed: '' },
  });
  expect(setData).toHaveBeenCalledWith(
    BIO_LINK_DRAG_MIME,
    JSON.stringify({
      label: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/X',
      kind: 'wikipedia',
      isExternal: true,
    })
  );
});
```

`bio-image-palette.spec.tsx`: analogous — renders a tile with attribution text, `onDelete` fires with the row id, dragstart sets `BIO_IMAGE_DRAG_MIME` payload, and the eye button opens a dialog (`screen.getByRole('dialog')` visible after click). Mock `next/image` the same way `rich-text-editor.spec.tsx` does.

- [ ] **Step 4: Implement the palettes**

`bio-link-palette.tsx` (`'use client'`, MPL header):

```tsx
'use client';

import type { DragEvent, JSX } from 'react';

import { ExternalLink, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';

import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

interface BioLinkPaletteProps {
  links: BioStatusLink[];
  onDelete: (linkId: string) => void;
  disabled?: boolean;
}

/** Curated, draggable list of discovered links. Tiles drag into the bio
 *  editors as `application/x-bio-link` payloads; X deletes the row. */
export const BioLinkPalette = ({
  links,
  onDelete,
  disabled = false,
}: BioLinkPaletteProps): JSX.Element => (
  <div role="group" aria-label="Discovered links" className="space-y-2">
    <h3 className="text-sm font-semibold">Discovered links</h3>
    <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
      {links.map((link) => {
        const isExternal = !isInternalBioUrl(link.url);
        const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
          event.dataTransfer.setData(
            BIO_LINK_DRAG_MIME,
            JSON.stringify({
              label: link.label,
              url: link.url,
              kind: link.kind ?? null,
              isExternal,
            })
          );
          event.dataTransfer.effectAllowed = 'copy';
        };
        return (
          <li
            key={link.id}
            draggable
            onDragStart={onDragStart}
            className="border-border bg-background flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-sm active:cursor-grabbing"
          >
            {isExternal && (
              <ExternalLink
                data-external-icon
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
            )}
            <span className="truncate">{link.label}</span>
            {link.kind && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {link.kind}
              </Badge>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDelete(link.id)}
              aria-label={`Delete link ${link.label}`}
              className="hover:text-destructive ml-auto shrink-0 rounded-full p-0.5"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);
```

Note: `isInternalBioUrl` lands in Task 6 — within THIS task create the util file with the minimal client-safe implementation shown in Task 6 Step 3 (the sanitizer wiring stays in Task 6); Task 6 then only adds sanitizer usage + more tests.

`bio-image-palette.tsx`: same structure — tile is `<li draggable>` containing a `next/image` thumb (`src={image.thumbnailUrl ?? image.url}`, `width={96} height={96}`, `unoptimized`, `object-cover rounded-md`), attribution line beneath (`text-muted-foreground line-clamp-2 text-[11px]`), an eye button (`Eye` icon, `aria-label={`Preview ${image.title ?? 'image'}`}`) opening a shadcn `Dialog` with the full image (`unoptimized`, natural aspect), and the X delete button (`aria-label={`Delete image ${image.title ?? image.url}`}`). Drag payload: `{ url: image.url, thumbnailUrl: image.thumbnailUrl ?? null, title: image.title ?? null, attribution: image.attribution ?? null, alt: image.title ?? 'Artist photo', width: image.width ?? null, height: image.height ?? null }`. Grid: `ul` with `grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec vitest run src/lib/validation/bio-dnd-schema.spec.ts src/app/components/forms/bio-link-palette.spec.tsx src/app/components/forms/bio-image-palette.spec.tsx && pnpm run typecheck`
Commit: `feat(admin): ✨ bio link and image palettes`

---

### Task 5: Palette data wiring — mutations hook, container, section integration

**Files:**

- Create: `src/app/hooks/mutations/use-bio-media-mutations.ts`
- Create: `src/app/components/forms/bio-media-palettes.tsx`
- Modify: `src/app/components/forms/sections/artist-bio-section.tsx`
- Modify: `src/app/components/forms/artist-bio-generation-section.tsx` (remove `DiscoveredImages`, `DiscoveredLinks` and their renders in `BioResultPreview`)
- Test: `src/app/hooks/mutations/use-bio-media-mutations.spec.tsx`, `src/app/components/forms/bio-media-palettes.spec.tsx`, update `artist-bio-generation-section.spec.tsx` (remove orphaned discovered-list tests), update `artist-bio-section` coverage via `artist-form.spec.tsx` if it asserts section layout

**Interfaces:**

- Consumes: `useArtistBioGenerationStatusQuery(artistId, { enabled })` (`src/app/hooks/use-artist-bio-generation-status-query.ts:52`), `queryKeys.artists.bioGeneration(artistId)` (`src/lib/query-keys.ts:57`), Task 3 actions, Task 4 palettes.
- Produces: `useDeleteBioLinkMutation(artistId)` → `{ deleteBioLink, isDeletingBioLink }`; `useDeleteBioImageMutation(artistId)` → `{ deleteBioImage, isDeletingBioImage }`; `BioMediaPalettes({ artistId })`.

- [ ] **Step 1: Failing mutations-hook test**

Follow the house pattern of existing mutation hook specs (QueryClientProvider wrapper + `renderHook`):

```tsx
it('invalidates the bio-generation query after a link delete', async () => {
  vi.mocked(deleteArtistBioLinkAction).mockResolvedValue({ success: true });
  const { result, queryClient } = renderWithClient(() => useDeleteBioLinkMutation('artist-1'));
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  await act(() => result.current.deleteBioLink('l1'));
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.artists.bioGeneration('artist-1'),
  });
});

it('surfaces a failed delete as an error toast', async () => {
  vi.mocked(deleteArtistBioLinkAction).mockResolvedValue({ success: false, error: 'nope' });
  const { result } = renderWithClient(() => useDeleteBioLinkMutation('artist-1'));
  await act(() => result.current.deleteBioLink('l1'));
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith('nope');
});
```

- [ ] **Step 2: Implement the hook**

```ts
'use client';
// MPL header + jsdoc

export const useDeleteBioLinkMutation = (artistId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (linkId: string) => deleteArtistBioLinkAction(linkId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete bio link');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioGeneration(artistId) });
    },
  });
  return { deleteBioLink: mutation.mutate, isDeletingBioLink: mutation.isPending };
};
```

`useDeleteBioImageMutation` mirrors it with `deleteArtistBioImageAction`. Add explicit return-type interfaces per repo convention (check a neighboring mutations hook for the exact idiom and JSDoc style).

- [ ] **Step 3: Failing container test**

`bio-media-palettes.spec.tsx`: mock `useArtistBioGenerationStatusQuery` and both mutation hooks.

```tsx
it('renders both palettes when generated content exists', () => {
  mockStatus({ status: 'succeeded', content: { images: [IMAGE_ROW], links: [LINK_ROW], ... } });
  render(<BioMediaPalettes artistId="artist-1" />);
  expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
});

it('renders nothing when the artist has no generated content', () => {
  mockStatus({ status: null, content: null });
  const { container } = render(<BioMediaPalettes artistId="artist-1" />);
  expect(container).toBeEmptyDOMElement();
});

it('routes a link delete through the mutation', async () => {
  ...
  await userEvent.click(screen.getByRole('button', { name: `Delete link ${LINK_ROW.label}` }));
  expect(deleteBioLink).toHaveBeenCalledWith(LINK_ROW.id);
});
```

- [ ] **Step 4: Implement `bio-media-palettes.tsx`**

```tsx
'use client';
// MPL header

/** Side-by-side curated palettes of the artist's discovered bio links and
 *  images, fed by the persisted rows (bio-generation status query). Rendered
 *  directly above the bio editors so tiles drag straight in. */
export const BioMediaPalettes = ({ artistId }: { artistId: string }): JSX.Element | null => {
  const status = useArtistBioGenerationStatusQuery(artistId);
  const { deleteBioLink, isDeletingBioLink } = useDeleteBioLinkMutation(artistId);
  const { deleteBioImage, isDeletingBioImage } = useDeleteBioImageMutation(artistId);

  const content = status.data?.status === 'succeeded' ? status.data.content : null;
  if (!content || (content.links.length === 0 && content.images.length === 0)) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {content.links.length > 0 && (
        <BioLinkPalette
          links={content.links}
          onDelete={deleteBioLink}
          disabled={isDeletingBioLink}
        />
      )}
      {content.images.length > 0 && (
        <BioImagePalette
          images={content.images}
          onDelete={deleteBioImage}
          disabled={isDeletingBioImage}
        />
      )}
    </div>
  );
};
```

The status hook already stops polling on terminal states, so mounting it always (edit mode) costs one fetch for settled artists. TanStack dedupes with `ArtistBioGenerationSection`'s subscription of the same key.

- [ ] **Step 5: Integrate + remove the old lists**

- `artist-bio-section.tsx`: after the `ArtistBioGenerationSection` block (still inside the `isEditMode && artistId` guard), render `<BioMediaPalettes artistId={artistId} />`, before the three `BioEditorField`s.
- `artist-bio-generation-section.tsx`: delete `DiscoveredImages`, `DiscoveredLinks`, their interfaces, and their usages in `BioResultPreview` (keep the short-bio preview and the regenerate note; update the note copy to point at the palettes: `Regenerating replaces the palette images and links. Save the form to keep the result.`). Remove now-unused imports (`Image`, `Star`, `ExternalLink` if unused).
- Update `artist-bio-generation-section.spec.tsx`: remove tests asserting discovered lists; keep/adjust the preview tests.

- [ ] **Step 6: Verify + commit**

Run: `pnpm exec vitest run src/app/hooks/mutations/use-bio-media-mutations.spec.tsx src/app/components/forms/bio-media-palettes.spec.tsx src/app/components/forms/artist-bio-generation-section.spec.tsx src/app/components/forms/artist-form.spec.tsx && pnpm run typecheck`
Commit: `feat(admin): ✨ wire palettes above bio editors`

---

### Task 6: `is-internal-url` + sanitizer origin branch + figure allowlist

**Files:**

- Modify (created minimally in Task 4): `src/lib/utils/is-internal-url.ts`
- Modify: `src/lib/utils/sanitize-bio-html.ts`
- Test: `src/lib/utils/is-internal-url.spec.ts`, `src/lib/utils/sanitize-bio-html.spec.ts`

**Interfaces:**

- Produces: `isInternalBioUrl(href: string): boolean` — `true` for site-relative paths (`/releases/x`) and absolute http(s) URLs whose hostname (www-stripped) equals the app's own hostname (from `getApiBaseUrl()`); `false` otherwise (including `//protocol-relative` and non-http schemes). Sanitizer: `figure`/`figcaption` allowed with the class/style contract below; `<a>` branch by origin.

**Figure HTML contract (used by Tasks 7, 10):**

```html
<figure class="bio-figure bio-figure--left" style="width:45%">
  <img src="https://cdn…/x.webp" alt="…" />
  <figcaption class="bio-figure-caption">
    <span class="bio-figure-title">Title</span>
    <span class="bio-figure-subtitle">Subtitle</span>
    <span class="bio-figure-attribution">Attribution</span>
  </figcaption>
</figure>
```

Float classes: `bio-figure--left` | `bio-figure--right` | `bio-figure--center`. Width only ever a percentage.

- [ ] **Step 1: Failing util tests**

```ts
describe('isInternalBioUrl', () => {
  it('treats a site-relative path as internal', () => {
    expect(isInternalBioUrl('/releases/665f')).toBe(true);
  });
  it('treats a protocol-relative url as external', () => {
    expect(isInternalBioUrl('//evil.example/x')).toBe(false);
  });
  it('treats the own host as internal', () => {
    expect(isInternalBioUrl('https://fakefourrecords.com/artists/x')).toBe(true);
  });
  it('treats the www variant of the own host as internal', () => {
    expect(isInternalBioUrl('https://www.fakefourrecords.com/artists/x')).toBe(true);
  });
  it('treats a foreign host as external', () => {
    expect(isInternalBioUrl('https://en.wikipedia.org/wiki/X')).toBe(false);
  });
  it('treats a non-http scheme as external', () => {
    expect(isInternalBioUrl('mailto:a@b.c')).toBe(false);
  });
});
```

Pin the own-host by stubbing what `getApiBaseUrl()` reads (server path: `vi.stubEnv('AUTH_URL', 'https://fakefourrecords.com')` with `NODE_ENV` production via the file's existing env-stubbing idiom), or mock `@/lib/utils/api-base-url`.

- [ ] **Step 2: Implement**

```ts
// MPL header
import { getApiBaseUrl } from '@/lib/utils/api-base-url';

const stripWww = (hostname: string): string => hostname.replace(/^www\./, '');

/**
 * Classifies a bio link's origin. Internal links (site-relative paths or the
 * app's own host, apex or www) render same-tab without rel hardening or the
 * external icon; everything else is external. Works on server (sanitizer) and
 * client (renderer, editor) — `getApiBaseUrl` handles both contexts.
 */
export const isInternalBioUrl = (href: string): boolean => {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const ownHost = stripWww(new URL(getApiBaseUrl()).hostname);
  return stripWww(parsed.hostname) === ownHost;
};
```

- [ ] **Step 3: Failing sanitizer tests**

```ts
it('keeps an internal link same-tab without rel hardening', () => {
  const out = sanitizeBioHtml(
    '<p><a href="/releases/665f" target="_blank" rel="nofollow">Album</a></p>'
  );
  expect(out).toBe('<p><a href="/releases/665f">Album</a></p>');
});

it('still hardens external links with the rel trio and target', () => {
  const out = sanitizeBioHtml('<p><a href="https://en.wikipedia.org/wiki/X">X</a></p>');
  expect(out).toContain('rel="nofollow noopener noreferrer"');
});

it('preserves a bio figure with caption spans and percentage width', () => {
  const figure =
    '<figure class="bio-figure bio-figure--left" style="width:45%"><img src="https://cdn.example/x.webp" alt="x" /><figcaption class="bio-figure-caption"><span class="bio-figure-title">T</span></figcaption></figure>';
  const out = sanitizeBioHtml(figure);
  expect(out).toContain('bio-figure--left');
});

it('strips a non-percentage figure width', () => {
  const out = sanitizeBioHtml(
    '<figure class="bio-figure" style="width:9999px"><img src="https://cdn.example/x.webp" alt="" /></figure>'
  );
  expect(out).not.toContain('9999px');
});

it('strips an unknown figure class', () => {
  const out = sanitizeBioHtml(
    '<figure class="bio-figure evil-class"><img src="https://cdn.example/x.webp" alt="" /></figure>'
  );
  expect(out).not.toContain('evil-class');
});

it('short bio strips figures entirely', () => {
  const out = sanitizeBioHtmlNoImages(
    '<p>a</p><figure class="bio-figure"><img src="https://cdn.example/x.webp" alt="" /></figure>'
  );
  expect(out).toBe('<p>a</p>');
});
```

- [ ] **Step 4: Implement sanitizer changes**

Consolidate the hand-duplicated allowlists (review minor from PR #548) and extend:

```ts
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

/** Tags shared by every bio surface; image-capable surfaces add img/figure/figcaption. */
const BASE_BIO_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'a',
  'span',
  'h2',
  'h3',
  'h4',
];

const BASE_BIO_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'rel', 'target'],
  span: ['style', 'class'],
};

/** Origin-branched link hardening: internal links stay same-tab and unhardened;
 *  external links carry the rel trio + target=_blank (decision 5). */
const transformAnchor: sanitizeHtml.Transformer = (tagName, attribs) => {
  if (isInternalBioUrl(attribs.href ?? '')) {
    const { rel: _rel, target: _target, ...rest } = attribs;
    return { tagName, attribs: rest };
  }
  return {
    tagName,
    attribs: { ...attribs, rel: 'nofollow noopener noreferrer', target: '_blank' },
  };
};
```

`BIO_HTML_OPTIONS`: `allowedTags: [...BASE_BIO_ALLOWED_TAGS, 'img', 'figure', 'figcaption']`; `allowedAttributes: { ...BASE_BIO_ALLOWED_ATTRIBUTES, img: ['src', 'alt', 'width', 'height'], figure: ['class', 'style'], figcaption: ['class'] }`; add `allowedClasses`:

```ts
allowedClasses: {
  figure: ['bio-figure', 'bio-figure--left', 'bio-figure--right', 'bio-figure--center'],
  figcaption: ['bio-figure-caption'],
  span: ['bio-figure-title', 'bio-figure-subtitle', 'bio-figure-attribution'],
},
```

Extend `allowedStyles` with figure width (two patterns, integer and decimal, matching the file's existing unsafe-regex-avoidance comment): `figure: { width: [/^\d+%$/, /^\d+\.\d+%$/] }`. Replace the inline `transformTags.a` with `transformAnchor` in both options objects. `BIO_HTML_NO_IMAGES_OPTIONS` becomes `{ ...BIO_HTML_OPTIONS, allowedTags: [...BASE_BIO_ALLOWED_TAGS], allowedAttributes: BASE_BIO_ALLOWED_ATTRIBUTES, allowedSchemesByTag: { a: ['http', 'https'] } }` — the shared-constant spread removes the drift risk. Update the header jsdoc (links are no longer unconditionally force-rewritten). Note: `span` gaining `class` is safe — `allowedClasses.span` restricts values to the three caption classes.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec vitest run src/lib/utils/is-internal-url.spec.ts src/lib/utils/sanitize-bio-html.spec.ts && pnpm run typecheck`
Commit: `feat(bio): ✨ origin-branch links, allow figures`

---

### Task 7: `BioHtml` renders figures and internal links

**Files:**

- Modify: `src/app/components/bio-html.tsx`
- Test: `src/app/components/bio-html.spec.tsx`

**Interfaces:**

- Consumes: the figure HTML contract from Task 6; `isInternalBioUrl`.
- Produces: public rendering — floated figures with wrap margins, captions at exactly 11px, internal links same-tab without the icon.

- [ ] **Step 1: Failing tests**

```tsx
it('renders an internal link same-tab without the external icon', () => {
  render(<BioHtml html={'<p><a href="/releases/665f">Album</a></p>'} />);
  const link = screen.getByRole('link', { name: 'Album' });
  expect(link).not.toHaveAttribute('target');
});

it('keeps the external icon and new-tab attributes on external links', () => {
  render(<BioHtml html={'<p><a href="https://en.wikipedia.org/wiki/X">X</a></p>'} />);
  expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute('target', '_blank');
});

it('renders a left-floated figure with the static float class', () => {
  render(<BioHtml html={FIGURE_HTML_LEFT} />);
  const figure = screen.getByRole('figure');
  expect(figure.className).toContain('float-left');
});

it('applies the persisted percentage width to the figure', () => {
  render(<BioHtml html={FIGURE_HTML_LEFT} />); // style="width:45%"
  expect(screen.getByRole('figure')).toHaveStyle({ width: '45%' });
});

it('renders the caption at the 11px floor', () => {
  render(<BioHtml html={FIGURE_HTML_WITH_CAPTION} />);
  const caption = screen.getByText('T').closest('figcaption');
  expect(caption?.className).toContain('text-[11px]');
});
```

- [ ] **Step 2: Implement**

Add to the `replace` visitor (keep each branch a small helper so complexity stays ≤10):

```tsx
/** Static float-class map — Tailwind-visible literals only (never dynamic). */
const FIGURE_FLOAT_CLASSES: Record<string, string> = {
  'bio-figure--left': 'float-left mr-4 mb-2',
  'bio-figure--right': 'float-right ml-4 mb-2',
  'bio-figure--center': 'mx-auto mb-4',
};

const figureClassName = (classAttr: string | undefined): string => {
  const floatClass = (classAttr ?? '')
    .split(/\s+/)
    .map((token) => FIGURE_FLOAT_CLASSES[token])
    .find(Boolean);
  return cn('bio-figure', floatClass ?? FIGURE_FLOAT_CLASSES['bio-figure--center']);
};

const parseFigureWidth = (styleAttr: string | undefined): string | undefined => {
  const match = /width:\s*([\d.]+%)/.exec(styleAttr ?? '');
  return match?.[1];
};
```

In `replace`:

- `a` branch: `if (isInternalBioUrl(href))` return `<Link href={href}>{children}</Link>` (no rel, no target, no icon); else the existing hardened external rendering.
- `figure` branch: render
  ```tsx
  <figure
    className={figureClassName(domNode.attribs.class)}
    // Width is admin-set data (percent, sanitizer-validated), not a style
    // choice — same data-driven exception as the sanitizer's font-size spans.
    style={width ? { width } : undefined}
  >
    {domToReact(domNode.children as DOMNode[], options)}
  </figure>
  ```
- `figcaption` branch: `<figcaption className="text-muted-foreground mt-1 text-[11px] leading-snug [&_.bio-figure-title]:font-medium [&_.bio-figure-attribution]:italic [&_span]:block">{children}</figcaption>` — the caption floor is a fixed 11px and never scales with the figure width.
- `img` inside a figure keeps flowing through the existing `img` branch (next/image with CDN loader) — no change needed there.

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec vitest run src/app/components/bio-html.spec.tsx && pnpm run typecheck`
Commit: `feat(bio): ✨ render figures and internal links`

---

### Task 8: Extract the private-IP guard into a shared util

**Files:**

- Create: `src/lib/utils/ip-guard.ts`
- Modify: `src/app/api/proxy-image/route.ts` (delete the local copies at lines 24-79, import instead)
- Test: `src/lib/utils/ip-guard.spec.ts` (move/adapt the existing route-spec coverage of the predicates; keep route-level behavior tests where they are)

**Interfaces:**

- Produces (moved verbatim from `proxy-image/route.ts:24-79`, converted to arrow consts, exported):
  - `isDisallowedAddress(address: string): boolean` — true for any private/reserved IPv4/IPv6 or non-IP input
  - `isPubliclyRoutableUrl(url: string): Promise<boolean>` — NEW convenience: parses the URL, requires http(s), resolves the hostname via `lookup` from `node:dns/promises`, returns `!isDisallowedAddress(address)`; returns `false` on parse/lookup failure.
- The file starts with `import 'server-only';` — specs need `vi.mock('server-only', () => ({}))`.

- [ ] **Step 1: Failing util tests**

```ts
vi.mock('server-only', () => ({}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

describe('isDisallowedAddress', () => {
  it('blocks the link-local metadata address', () => {
    expect(isDisallowedAddress('169.254.169.254')).toBe(true);
  });
  it('blocks loopback', () => {
    expect(isDisallowedAddress('127.0.0.1')).toBe(true);
  });
  it('blocks an IPv4-mapped IPv6 private address', () => {
    expect(isDisallowedAddress('::ffff:10.0.0.1')).toBe(true);
  });
  it('allows a public address', () => {
    expect(isDisallowedAddress('93.184.216.34')).toBe(false);
  });
  it('blocks non-IP input', () => {
    expect(isDisallowedAddress('not-an-ip')).toBe(true);
  });
});

describe('isPubliclyRoutableUrl', () => {
  it('rejects a url resolving to a private address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '10.0.0.5', family: 4 } as never);
    expect(await isPubliclyRoutableUrl('https://internal.example/img.jpg')).toBe(false);
  });
  it('accepts a url resolving to a public address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 } as never);
    expect(await isPubliclyRoutableUrl('https://example.com/img.jpg')).toBe(true);
  });
  it('rejects a non-http scheme', async () => {
    expect(await isPubliclyRoutableUrl('file:///etc/passwd')).toBe(false);
  });
  it('rejects when dns lookup fails', async () => {
    vi.mocked(lookup).mockRejectedValue(new Error('ENOTFOUND'));
    expect(await isPubliclyRoutableUrl('https://nope.example/x.jpg')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Move `inRange`, `isPrivateSecondOctet`, `isDisallowedIPv4`, `isDisallowedIPv6`, `isDisallowedAddress` from the route file unchanged in logic (the `function isDisallowedAddress` becomes `const isDisallowedAddress = (address: string): boolean => …`; the IPv6↔address mutual recursion works with const arrows because the calls happen post-initialization). Add:

```ts
/**
 * True when the URL is http(s) and its hostname resolves to a publicly
 * routable address. Guards server-side fetches of admin-supplied URLs
 * (save-time bio image re-hosting) against SSRF into private ranges.
 */
export const isPubliclyRoutableUrl = async (url: string): Promise<boolean> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  try {
    const { address } = await lookup(parsed.hostname);
    return !isDisallowedAddress(address);
  } catch {
    return false;
  }
};
```

Update `proxy-image/route.ts` to import `isDisallowedAddress` (its `resolveAndVetAddress`/pinned-dispatcher logic stays in the route). Run the full proxy-image route spec to prove no behavior change.

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec vitest run src/lib/utils/ip-guard.spec.ts src/app/api/proxy-image/route.spec.ts && pnpm run typecheck`
Commit: `refactor(security): ♻️ share private-ip guard`

---

### Task 9: Save-time full re-host of embedded bio images

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts` (+`findBioImagesForRehost`, `updateBioImageUrl`)
- Modify: `src/lib/services/artist-service.ts` (`finalizeBioImages` between sanitize and repo update)
- Test: `src/lib/repositories/artist-repository.spec.ts`, `src/lib/services/artist-service.spec.ts`

**Interfaces:**

- Consumes: `BioImageService.rehostWithVariants(sourceUrl, artistId, index): Promise<RehostedImage>` (bio-image-service.ts:123), `isPubliclyRoutableUrl` (Task 8), `buildCdnUrl` (cdn-url.ts:18).
- Produces:
  - `ArtistRepository.findBioImagesForRehost(artistId): Promise<Array<{ id: string; url: string; thumbnailUrl: string | null; originalUrl: string | null }>>`
  - `ArtistRepository.updateBioImageUrl(imageId: string, url: string): Promise<void>`
  - `finalizeBioImages(artistId, data)` — internal to artist-service; `updateArtist` becomes `sanitize → finalize → repo.update`.

**Re-host rules:**

- Candidate srcs: every `<img src="…">` in `data.bio` and `data.altBio` (shortBio never has images).
- Needs re-host when the src contains `/bio/thumbs/` (generation-time single-variant thumbnail) OR does not start with the CDN prefix (external/manual paste).
- Thumbnail srcs: find the row whose `thumbnailUrl` or `url` equals the src; the full-res source is `row.originalUrl` (skip with a log if null). Re-host source is external → SSRF-guard it.
- External srcs: SSRF-guard the src itself; re-host directly (no row to update).
- After `rehostWithVariants` → replace every occurrence of the old src in both HTML fields; when a row matched, `updateBioImageUrl(row.id, newUrl)`.
- Any failure (guard refusal, fetch, upload) logs and leaves that src untouched; the save itself always proceeds.
- `createArtist` is NOT changed (a new artist has no generated bio rows; a pasted external image finalizes on the first update — note this in a comment).

- [ ] **Step 1: Failing repo tests** — mock `prisma.artistBioImage.findMany`/`update`; assert select `{ id, url, thumbnailUrl, originalUrl }` filtered by `artistId`, and `update({ where: { id }, data: { url } })`.

- [ ] **Step 2: Implement repo methods** (thin, matching Step 1's assertions).

- [ ] **Step 3: Failing service tests**

```ts
describe('updateArtist bio image finalization', () => {
  it('re-hosts a thumbnail src to full variants and rewrites the html', async () => {
    vi.mocked(ArtistRepository.findBioImagesForRehost).mockResolvedValue([
      {
        id: 'img-1',
        url: THUMB,
        thumbnailUrl: THUMB,
        originalUrl: 'https://upload.wikimedia.org/full.jpg',
      },
    ]);
    vi.mocked(isPubliclyRoutableUrl).mockResolvedValue(true);
    vi.mocked(BioImageService.rehostWithVariants).mockResolvedValue({
      url: FULL,
      width: 1200,
      height: 900,
    });
    await ArtistService.updateArtist('a1', { bio: `<p><img src="${THUMB}" alt="x" /></p>` });
    const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
    expect(updateData.bio).toContain(FULL);
  });

  it('upgrades the matching bio image row url', async () => {
    // same arrangement
    expect(vi.mocked(ArtistRepository.updateBioImageUrl)).toHaveBeenCalledWith('img-1', FULL);
  });

  it('skips an external src that resolves to a private address', async () => {
    vi.mocked(isPubliclyRoutableUrl).mockResolvedValue(false);
    await ArtistService.updateArtist('a1', {
      bio: '<p><img src="https://internal.example/x.jpg" alt="" /></p>',
    });
    expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
  });

  it('leaves a fully re-hosted CDN src untouched', async () => {
    await ArtistService.updateArtist('a1', { bio: `<p><img src="${FULL}" alt="" /></p>` });
    expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
  });

  it('saves with the original src when re-hosting throws', async () => {
    vi.mocked(BioImageService.rehostWithVariants).mockRejectedValue(new Error('s3 down'));
    const result = await ArtistService.updateArtist('a1', {
      bio: `<p><img src="${THUMB}" alt="" /></p>`,
    });
    expect(result.success).toBe(true);
  });

  it('skips finalization entirely when no bio fields are updated', async () => {
    await ArtistService.updateArtist('a1', { displayName: 'X' });
    expect(vi.mocked(ArtistRepository.findBioImagesForRehost)).not.toHaveBeenCalled();
  });
});
```

Use constants `THUMB = 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp'`, `FULL = 'https://cdn.example/media/artists/a1/bio/3-def.webp'`, and stub `buildCdnUrl`'s env so the CDN prefix is deterministic (follow existing bio-image-service.spec env idiom).

- [ ] **Step 4: Implement finalization**

In `artist-service.ts` (helpers small and single-purpose to satisfy complexity ≤10):

```ts
const IMG_SRC_PATTERN = /<img\s[^>]*src="([^"]+)"/g;
const BIO_THUMBS_MARKER = '/bio/thumbs/';

const collectImgSrcs = (html: string | null | undefined): string[] =>
  [...(html ?? '').matchAll(IMG_SRC_PATTERN)].map((match) => match[1]);

const needsFullRehost = (src: string, cdnPrefix: string): boolean =>
  src.includes(BIO_THUMBS_MARKER) || !src.startsWith(cdnPrefix);

interface RehostPlan {
  src: string;
  source: string;
  rowId: string | null;
}

const planRehost = (src: string, rows: BioImageRehostRow[]): RehostPlan | null => {
  const row = rows.find((candidate) => candidate.thumbnailUrl === src || candidate.url === src);
  if (row) return row.originalUrl ? { src, source: row.originalUrl, rowId: row.id } : null;
  return { src, source: src, rowId: null };
};
```

Main pass (sequential, index-stable):

```ts
/**
 * Upgrades embedded bio images to fully re-hosted CDN variants at save time:
 * generation-time thumbnails re-host from their recorded originalUrl; manually
 * pasted external URLs re-host directly (SSRF-guarded). Every failure is
 * logged and non-blocking — the save proceeds with the prior src and the next
 * save retries. Create-mode is exempt (no artistId/bio rows yet); pasted
 * images finalize on the first update.
 */
const finalizeBioImages = async (
  artistId: string,
  data: UpdateArtistData
): Promise<UpdateArtistData> => {
  if (data.bio === undefined && data.altBio === undefined) return data;
  try {
    const rows = await ArtistRepository.findBioImagesForRehost(artistId);
    const cdnPrefix = buildCdnUrl('');
    const srcs = [...new Set([...collectImgSrcs(data.bio), ...collectImgSrcs(data.altBio)])].filter(
      (src) => needsFullRehost(src, cdnPrefix)
    );
    let result = { ...data };
    for (const [index, src] of srcs.entries()) {
      result = await rehostOne(result, { artistId, src, index, rows });
    }
    return result;
  } catch (error) {
    loggers.media.warn('bio_image_finalize_failed', { artistId, error: String(error) });
    return data;
  }
};
```

`rehostOne` executes one plan: guard `isPubliclyRoutableUrl(plan.source)` (log + return unchanged on refusal), `BioImageService.rehostWithVariants(plan.source, artistId, index)` in its own try/catch, `replaceAll(src, rehosted.url)` on `result.bio`/`result.altBio` strings, and `updateBioImageUrl(rowId, rehosted.url)` when a row matched. Wire into `updateArtist`:

```ts
const sanitized = sanitizeBioWriteFields(data);
const finalized = await finalizeBioImages(id, sanitized);
const artist = await ArtistRepository.update(id, finalized);
```

Use the service's actual logger instance name.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec vitest run src/lib/services/artist-service.spec.ts src/lib/repositories/artist-repository.spec.ts && pnpm run typecheck`
Commit: `feat(bio): ✨ full re-host of images on save`

---

### Task 10: `bioFigure` TipTap extension (parse/render round-trip)

**Files:**

- Create: `src/app/components/ui/bio-figure-extension.ts`
- Test: `src/app/components/ui/bio-figure-extension.spec.ts`

**Interfaces:**

- Produces: `BioFigure` node extension. Name `'bioFigure'`, `group: 'block'`, `atom: true`, `draggable: true`. Attributes:
  - `src: string` (required — parse fails without it), `alt: string` (default `''`)
  - `width: number` (percent, default `100`, floor `20`, ceiling `100`)
  - `float: 'left' | 'right' | 'none'` (default `'none'`; `'none'` renders class `bio-figure--center`)
  - `title: string | null`, `subtitle: string | null`, `attribution: string | null`
- Emits/parses exactly the Task 6 figure HTML contract. NodeView hook (`addNodeView`) is added in Task 11 — this task ships the extension WITHOUT `addNodeView` so it is testable headless.
- Also exports `FLOAT_TO_CLASS: Record<BioFigureFloat, string>` (`left → 'bio-figure--left'`, `right → 'bio-figure--right'`, `none → 'bio-figure--center'`) and `type BioFigureFloat`.

- [ ] **Step 1: Failing round-trip tests**

Headless TipTap in jsdom:

```ts
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

import { BioFigure } from './bio-figure-extension';

const createEditor = (content: string): Editor =>
  new Editor({ extensions: [StarterKit, BioFigure], content });

const FIGURE_HTML =
  '<figure class="bio-figure bio-figure--left" style="width: 45%"><img src="https://cdn.example/x.webp" alt="Ceschi live"><figcaption class="bio-figure-caption"><span class="bio-figure-title">Ceschi</span><span class="bio-figure-attribution">Wikimedia Commons</span></figcaption></figure>';

it('parses a figure into a bioFigure node with its attributes', () => {
  const editor = createEditor(FIGURE_HTML);
  const node = editor.state.doc.firstChild;
  expect(node?.type.name).toBe('bioFigure');
});

it('round-trips float and width through getHTML', () => {
  const editor = createEditor(FIGURE_HTML);
  const html = editor.getHTML();
  expect(html).toContain('bio-figure--left');
});

it('round-trips caption spans', () => {
  const editor = createEditor(FIGURE_HTML);
  expect(editor.getHTML()).toContain('bio-figure-attribution');
});

it('omits the figcaption when no caption fields are set', () => {
  const editor = createEditor(
    '<figure class="bio-figure"><img src="https://cdn.example/x.webp" alt=""></figure>'
  );
  expect(editor.getHTML()).not.toContain('figcaption');
});

it('ignores a figure without an img src', () => {
  const editor = createEditor(
    '<figure class="bio-figure"><figcaption class="bio-figure-caption">x</figcaption></figure>'
  );
  expect(editor.state.doc.firstChild?.type.name).not.toBe('bioFigure');
});

it('clamps a parsed width below the floor to 20', () => {
  const editor = createEditor(
    '<figure class="bio-figure" style="width: 5%"><img src="https://cdn.example/x.webp" alt=""></figure>'
  );
  expect(editor.state.doc.firstChild?.attrs.width).toBe(20);
});
```

The sanitizer round-trip (editor HTML survives `sanitizeBioHtml`) lives in `sanitize-bio-html.spec.ts` already (Task 6 test 3) — do not duplicate here.

- [ ] **Step 2: Implement**

```ts
// MPL header
import { Node } from '@tiptap/core';

export type BioFigureFloat = 'left' | 'right' | 'none';

export const FLOAT_TO_CLASS: Record<BioFigureFloat, string> = {
  left: 'bio-figure--left',
  right: 'bio-figure--right',
  none: 'bio-figure--center',
};

export const BIO_FIGURE_MIN_WIDTH = 20;
export const BIO_FIGURE_MAX_WIDTH = 100;

export const clampFigureWidth = (value: number): number =>
  Math.min(BIO_FIGURE_MAX_WIDTH, Math.max(BIO_FIGURE_MIN_WIDTH, Math.round(value)));

const parseFloatClass = (element: HTMLElement): BioFigureFloat => {
  if (element.classList.contains('bio-figure--left')) return 'left';
  if (element.classList.contains('bio-figure--right')) return 'right';
  return 'none';
};

const parseCaptionText = (element: HTMLElement, selector: string): string | null =>
  element.querySelector(selector)?.textContent?.trim() || null;

const parseFigureAttributes = (element: HTMLElement): Record<string, unknown> | false => {
  const img = element.querySelector('img');
  const src = img?.getAttribute('src');
  if (!src) return false;
  const widthMatch = /^([\d.]+)%$/.exec(element.style.width);
  return {
    src,
    alt: img?.getAttribute('alt') ?? '',
    width: widthMatch ? clampFigureWidth(Number(widthMatch[1])) : 100,
    float: parseFloatClass(element),
    title: parseCaptionText(element, '.bio-figure-title'),
    subtitle: parseCaptionText(element, '.bio-figure-subtitle'),
    attribution: parseCaptionText(element, '.bio-figure-attribution'),
  };
};

type CaptionSpan = [string, { class: string }, string];

const buildCaptionSpans = (attrs: {
  title: string | null;
  subtitle: string | null;
  attribution: string | null;
}): CaptionSpan[] =>
  (
    [
      ['bio-figure-title', attrs.title],
      ['bio-figure-subtitle', attrs.subtitle],
      ['bio-figure-attribution', attrs.attribution],
    ] as const
  )
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .map(([className, text]) => ['span', { class: className }, text]);

/**
 * Block-level figure node for bio images: `figure > img + figcaption` with a
 * percentage width, float side, and up to three caption lines. Atomic and
 * draggable — ProseMirror-native drag repositions it with live text reflow.
 * Emits exactly the sanitizer's figure contract (sanitize-bio-html.ts).
 */
export const BioFigure = Node.create({
  name: 'bioFigure',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      width: { default: 100 },
      float: { default: 'none' },
      title: { default: null },
      subtitle: { default: null },
      attribution: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'figure.bio-figure', getAttrs: (element) => parseFigureAttributes(element) }];
  },

  renderHTML({ node }) {
    const { src, alt, width, float, title, subtitle, attribution } = node.attrs;
    const spans = buildCaptionSpans({ title, subtitle, attribution });
    const children: unknown[] = [['img', { src, alt }]];
    if (spans.length > 0) children.push(['figcaption', { class: 'bio-figure-caption' }, ...spans]);
    return [
      'figure',
      { class: `bio-figure ${FLOAT_TO_CLASS[float as BioFigureFloat]}`, style: `width: ${width}%` },
      ...children,
    ] as never;
  },
});
```

Adjust the `renderHTML` return typing to what `@tiptap/core`'s `DOMOutputSpec` actually accepts (nested arrays are valid; avoid `as never` if a cleaner cast to `DOMOutputSpec` type-checks — no `any`).

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec vitest run src/app/components/ui/bio-figure-extension.spec.ts && pnpm run typecheck`
Commit: `feat(editor): ✨ bioFigure node with captions`

---

### Task 11: `bioFigure` React NodeView — resize, float, delete

**Files:**

- Create: `src/app/components/ui/bio-figure-node-view.tsx`
- Modify: `src/app/components/ui/bio-figure-extension.ts` (add `addNodeView`)
- Test: `src/app/components/ui/bio-figure-node-view.spec.tsx`

**Interfaces:**

- Consumes: `NodeViewProps` from `@tiptap/react` (`node.attrs`, `updateAttributes`, `deleteNode`, `selected`), `clampFigureWidth`/`FLOAT_TO_CLASS` from Task 10.
- Produces: `BioFigureNodeView(props: NodeViewProps): JSX.Element`; extension gains `addNodeView() { return ReactNodeViewRenderer(BioFigureNodeView); }`.

Behavior:

- Root: `NodeViewWrapper as="figure"` carrying `bio-figure` + float class + `style={{ width: `${width}%` }}` and `data-drag-handle` on the image container (PM-native drag).
- Image: plain `<img>` (editor context, not next/image), full width of the figure.
- Overlay controls (visible on hover/selection): delete X top-right (`deleteNode()`); float toggles as a three-button radio group (lucide `AlignStartVertical`, `AlignCenterVertical`, `AlignEndVertical`; `aria-pressed` per button) calling `updateAttributes({ float })`.
- Corner resize handle (bottom-right, `role="slider"`, `aria-label="Resize image"`, `aria-valuenow={width}`, `aria-valuemin={20}`, `aria-valuemax={100}`): pointer events (`onPointerDown` → `setPointerCapture`, track `clientX` delta against the wrapper's parent width, `updateAttributes({ width: clampFigureWidth(next) })` on move, release on `onPointerUp`). Pointer events cover mouse AND touch. Also support keyboard: ArrowLeft/ArrowRight adjust by 5.
- Caption lines render below the image at `text-[11px]` fixed (never scales with width).

- [ ] **Step 1: Failing tests**

Mock the TipTap React wrapper so the component tests run without an editor:

```tsx
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children?: ReactNode }) => (
    <figure {...props}>{children}</figure>
  ),
}));

const makeProps = (overrides?: Partial<{ attrs: Record<string, unknown> }>): NodeViewProps =>
  ({
    node: {
      attrs: {
        src: 'https://cdn.example/x.webp',
        alt: 'x',
        width: 50,
        float: 'left',
        title: 'T',
        subtitle: null,
        attribution: 'A',
        ...overrides?.attrs,
      },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: true,
  }) as unknown as NodeViewProps;

it('renders the image and caption lines', () => {
  render(<BioFigureNodeView {...makeProps()} />);
  expect(screen.getByText('A')).toBeInTheDocument();
});

it('deletes the node from the X overlay', async () => {
  const props = makeProps();
  render(<BioFigureNodeView {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(props.deleteNode).toHaveBeenCalled();
});

it('updates float from the toggle group', async () => {
  const props = makeProps();
  render(<BioFigureNodeView {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Float right' }));
  expect(props.updateAttributes).toHaveBeenCalledWith({ float: 'right' });
});

it('grows width with the keyboard on the resize handle', async () => {
  const props = makeProps();
  render(<BioFigureNodeView {...props} />);
  screen.getByRole('slider', { name: 'Resize image' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(props.updateAttributes).toHaveBeenCalledWith({ width: 55 });
});

it('clamps pointer resize to the 20 percent floor', () => {
  const props = makeProps({ attrs: { width: 22 } });
  render(<BioFigureNodeView {...props} />);
  const handle = screen.getByRole('slider', { name: 'Resize image' });
  fireEvent.pointerDown(handle, { clientX: 400, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
  expect(props.updateAttributes).toHaveBeenLastCalledWith({ width: 20 });
});
```

jsdom lacks `setPointerCapture` — stub it: `HTMLElement.prototype.setPointerCapture = vi.fn()` (and `releasePointerCapture`) in the spec's setup, and give the wrapper a deterministic parent width by mocking `getBoundingClientRect` where the math needs it.

- [ ] **Step 2: Implement** the component per the behavior list (small handlers, extract `useFigureResize` local hook if the component grows past ~150 lines), then add to the extension:

```ts
addNodeView() {
  return ReactNodeViewRenderer(BioFigureNodeView);
},
```

(`ReactNodeViewRenderer` from `@tiptap/react` — this makes the extension file client-coupled; that is fine, it is only imported by the client-only editor.)

- [ ] **Step 3: Re-run Task 10's spec** (extension still parses headless — `addNodeView` is inert without an editor view) plus the new spec.

Run: `pnpm exec vitest run src/app/components/ui/bio-figure-extension.spec.ts src/app/components/ui/bio-figure-node-view.spec.tsx && pnpm run typecheck`
Commit: `feat(editor): ✨ figure resize, float, delete`

---

### Task 12: Editor integration — drop handler, bubble menu, upgraded dialogs

**Files:**

- Create: `src/app/components/ui/bio-editor-drop.ts`
- Modify: `src/app/components/ui/rich-text-editor.tsx`
- Test: `src/app/components/ui/bio-editor-drop.spec.ts`, `src/app/components/ui/rich-text-editor.spec.tsx`

**Interfaces:**

- Consumes: `BIO_LINK_DRAG_MIME` / `BIO_IMAGE_DRAG_MIME` + payload schemas (Task 4), `BioFigure` (Tasks 10-11), `isInternalBioUrl` (Task 6), `BubbleMenu` from `@tiptap/react/menus`.
- Produces: `handleBioEditorDrop(view: EditorView, event: DragEvent, moved: boolean): boolean` — returns `true` when it consumed a palette payload; `false` otherwise (including `moved === true`, which preserves ProseMirror's native node-move drag).

- [ ] **Step 1: Failing drop-handler tests**

`bio-editor-drop.spec.ts` with a stub view:

```ts
const makeView = () => {
  const insertContentAt = vi.fn().mockReturnThis();
  return {
    posAtCoords: vi.fn().mockReturnValue({ pos: 7, inside: 0 }),
    // handleBioEditorDrop dispatches through a passed-in editor chain — see Step 2
  };
};
```

Design the signature so it is testable without a real ProseMirror view: `handleBioEditorDrop(editor: Editor, view: { posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null }, event: DragEvent, moved: boolean): boolean`. Tests:

```ts
it('ignores an in-editor node move', () => {
  expect(handleBioEditorDrop(editor, view, makeDropEvent({}), true)).toBe(false);
});

it('ignores a drop with no palette payload', () => {
  expect(handleBioEditorDrop(editor, view, makeDropEvent({}), false)).toBe(false);
});

it('inserts linked text at the drop position for a link payload', () => {
  const event = makeDropEvent({
    [BIO_LINK_DRAG_MIME]: JSON.stringify({
      label: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/X',
      kind: 'wikipedia',
      isExternal: true,
    }),
  });
  expect(handleBioEditorDrop(editor, view, event, false)).toBe(true);
  expect(insertContentAt).toHaveBeenCalledWith(7, {
    type: 'text',
    text: 'Wikipedia',
    marks: [
      {
        type: 'link',
        attrs: {
          href: 'https://en.wikipedia.org/wiki/X',
          target: '_blank',
          rel: 'nofollow noopener noreferrer',
        },
      },
    ],
  });
});

it('inserts an internal link without new-tab attributes', () => {
  /* target: null, rel: null */
});

it('inserts a bioFigure for an image payload', () => {
  const event = makeDropEvent({ [BIO_IMAGE_DRAG_MIME]: JSON.stringify(IMAGE_PAYLOAD) });
  expect(handleBioEditorDrop(editor, view, event, false)).toBe(true);
  expect(insertContentAt).toHaveBeenCalledWith(7, {
    type: 'bioFigure',
    attrs: expect.objectContaining({
      src: IMAGE_PAYLOAD.url,
      attribution: IMAGE_PAYLOAD.attribution,
    }),
  });
});

it('rejects a malformed payload without inserting', () => {
  const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: '{"nope":true}' });
  expect(handleBioEditorDrop(editor, view, event, false)).toBe(false);
});
```

`makeDropEvent(data)` builds `{ dataTransfer: { getData: (type: string) => data[type] ?? '' }, clientX: 10, clientY: 20, preventDefault: vi.fn() }`. The editor stub: `{ chain: () => chainable }` where `chainable.focus()/insertContentAt()/run()` are self-returning mocks.

- [ ] **Step 2: Implement `bio-editor-drop.ts`**

```ts
// MPL header — 'use client' not needed (pure logic), but it may import types only from @tiptap
import {
  bioImageDragPayloadSchema,
  bioLinkDragPayloadSchema,
  BIO_IMAGE_DRAG_MIME,
  BIO_LINK_DRAG_MIME,
} from '@/lib/validation/bio-dnd-schema';

interface DropCoordsView {
  posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null;
}

const linkMarkAttrs = (payload: BioLinkDragPayload): Record<string, string | null> =>
  payload.isExternal
    ? { href: payload.url, target: '_blank', rel: 'nofollow noopener noreferrer' }
    : { href: payload.url, target: null, rel: null };

/**
 * editorProps.handleDrop for the bio editors: accepts the two palette drag
 * payloads (validated with zod — drag data is external input) and inserts a
 * linked text run or a bioFigure at the pointer position. Returns false for
 * anything else so ProseMirror's native drag (node moves, plain text) is
 * untouched.
 */
export const handleBioEditorDrop = (
  editor: Editor,
  view: DropCoordsView,
  event: DragEvent,
  moved: boolean
): boolean => {
  if (moved || !event.dataTransfer) return false;
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return false;

  const linkParsed = bioLinkDragPayloadSchema.safeParse(readPayload(event, BIO_LINK_DRAG_MIME));
  if (linkParsed.success) {
    event.preventDefault();
    editor
      .chain()
      .focus()
      .insertContentAt(coords.pos, {
        type: 'text',
        text: linkParsed.data.label,
        marks: [{ type: 'link', attrs: linkMarkAttrs(linkParsed.data) }],
      })
      .run();
    return true;
  }

  const imageParsed = bioImageDragPayloadSchema.safeParse(readPayload(event, BIO_IMAGE_DRAG_MIME));
  if (imageParsed.success) {
    event.preventDefault();
    editor
      .chain()
      .focus()
      .insertContentAt(coords.pos, {
        type: 'bioFigure',
        attrs: {
          src: imageParsed.data.url,
          alt: imageParsed.data.alt,
          title: imageParsed.data.title,
          attribution: imageParsed.data.attribution,
        },
      })
      .run();
    return true;
  }

  return false;
};
```

`readPayload`: `try { return JSON.parse(event.dataTransfer.getData(mime)); } catch { return null; }` (empty string parse fails → null). Split into helpers if complexity exceeds 10.

- [ ] **Step 3: Failing editor integration tests**

Extend `rich-text-editor.spec.tsx` (real-editor harness, no TipTap mock):

```tsx
it('registers the bioFigure node so figure content round-trips', async () => {
  render(<Harness initialValue={FIGURE_HTML} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Bio' })).toBeInTheDocument());
  // The NodeView renders the caption text inside the editor surface.
  expect(screen.getByText('Wikimedia Commons')).toBeInTheDocument();
});

it('inserts a link with anchor text from the upgraded link dialog', async () => {
  // open link dialog, type anchor text 'My band' and url, apply;
  // assert onChange html contains '>My band</a>'
});

it('applies internal link attributes when the external toggle is off', async () => {
  // url '/releases/x', toggle off external → html has no target="_blank"
});

it('inserts a bioFigure with attribution from the upgraded image dialog', async () => {
  // open image dialog, pick image, fill attribution field, insert;
  // assert onChange html contains 'bio-figure-attribution'
});
```

- [ ] **Step 4: Implement the editor changes**

In `rich-text-editor.tsx`:

1. **Register**: add `BioFigure` to `extensions` (keep `BioEditorImage` — legacy `<img>` bios must still parse).
2. **Drop**: `editorProps: { …, handleDrop: (view, event, _slice, moved) => (editorRef.current ? handleBioEditorDrop(editorRef.current, view, event, moved) : false) }` — TipTap's `useEditor` closure can't reference `editor` before creation, so keep a `useRef<Editor | null>` synced after `useEditor` returns (or use `this`-free `view` alone by constructing the insert transaction from `view.state` — pick the cleanest that passes lint; the ref approach is simplest).
3. **Bubble menu**: `import { BubbleMenu } from '@tiptap/react/menus';` — render inside the root div:

```tsx
<BubbleMenu editor={editor} shouldShow={({ editor: instance }) => instance.isActive('link')}>
  <div className="bg-popover flex items-center gap-1 rounded-md border p-1 shadow-md">
    <Button type="button" size="sm" variant="ghost" onClick={openLinkDialog}>
      <Pencil className="size-3.5" aria-hidden />
      Edit
    </Button>
    <Button type="button" size="sm" variant="ghost" onClick={removeLink}>
      <Link2Off className="size-3.5" aria-hidden />
      Unlink
    </Button>
  </div>
</BubbleMenu>
```

4. **Link dialog**: add an anchor-text `Input` (`Label` "Anchor text", prefilled from the current selection text when editing) and an "Opens in new tab" shadcn `Switch` (never a checkbox), auto-set to `!isInternalBioUrl(linkUrl)` whenever the URL field changes, overridable. `applyLink`: when there is a selection, `setLink({ href, ...targetRelAttrs })`; when the selection is empty and anchor text is present, `insertContent({ type: 'text', text: anchorText, marks: [{ type: 'link', attrs: { href, ...targetRelAttrs } }] })`. `targetRelAttrs` = external ? `{ target: '_blank', rel: 'nofollow noopener noreferrer' }` : `{ target: null, rel: null }`. (The sanitizer remains authoritative at save time; editor attributes are a preview courtesy.) Relative URLs must pass validation: replace the `isHttpUrl(href)` gate with `isHttpUrl(href) || (href.startsWith('/') && !href.startsWith('//'))`.
5. **Image dialog**: add three optional `Input`s (Title, Subtitle, Attribution). `insertImage` now inserts `{ type: 'bioFigure', attrs: { src: image.url, alt: image.alt ?? '', title: title || null, subtitle: subtitle || null, attribution: attribution || null } }` via `insertContent`. Clear the fields on close.
6. Update the component jsdoc (toolbar summary) accordingly.

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec vitest run src/app/components/ui/bio-editor-drop.spec.ts src/app/components/ui/rich-text-editor.spec.tsx && pnpm run typecheck`
Commit: `feat(editor): ✨ palette drop, bubble menu, figures`

---

### Task 13: E2E coverage + full gates

**Files:**

- Modify/Create under `e2e/`: extend the existing admin artist-edit spec (find it via `ls e2e/tests`) or add `e2e/tests/admin-bio-palettes.spec.ts`; extend seed data in the E2E seed script with an artist that has persisted `ArtistBioLink`/`ArtistBioImage` rows (CDN-shaped URLs so palettes render).
- Test: Playwright.

**Hard constraint (AGENTS.md — read it before running anything):** E2E runs ONLY against `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` via `pnpm run e2e:docker:up` / the hardcoded defaults. Never read `.env*`. If results look like wrong-database (empty seed, 404s), STOP and surface it.

- [ ] **Step 1: Seed** — add to the E2E seed an artist with `bioStatus: 'succeeded'`, one bio link row (`label: 'E2E Wikipedia'`) and one image row (thumbnailUrl pointing at an existing seeded static asset or data URL the app can render `unoptimized`). Follow the seed script's existing artist fixtures.

- [ ] **Step 2: Failing E2E specs** (page-object style, matching neighboring admin specs):

```ts
test('bio palettes render the persisted rows', async ({ adminPage }) => {
  await gotoArtistEdit(adminPage, seededArtistId);
  await expect(adminPage.getByRole('group', { name: 'Discovered links' })).toBeVisible();
  await expect(adminPage.getByText('E2E Wikipedia')).toBeVisible();
});

test('deleting a palette link removes the tile', async ({ adminPage }) => {
  await gotoArtistEdit(adminPage, seededArtistId);
  await adminPage.getByRole('button', { name: 'Delete link E2E Wikipedia' }).click();
  await expect(adminPage.getByText('E2E Wikipedia')).toHaveCount(0);
});

test('inserted figure persists through save', async ({ adminPage }) => {
  await gotoArtistEdit(adminPage, seededArtistId);
  // open the Bio editor's insert-image dialog, pick the seeded image,
  // fill attribution, insert, save the form, reload,
  // assert the editor content contains the figure caption text.
});
```

Native HTML5 drag stays unit-covered (`bio-editor-drop.spec.ts`) per the spec — only add a synthetic-DataTransfer drag E2E if it proves stable on the first try; otherwise skip it with a comment pointing at the unit coverage.

- [ ] **Step 3: Run E2E** — `pnpm run e2e:docker:up`, then `pnpm run test:e2e` (or the targeted spec), confirm green, `pnpm run e2e:docker:down`.

- [ ] **Step 4: Full gates**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format && pnpm run test:coverage:check`
All clean, coverage within tolerance.

- [ ] **Step 5: Commit**

Commit: `test(e2e): ✅ bio palettes and figure flows`

---

## Self-Review Notes

- **Spec coverage:** palettes+delete (Tasks 3-5), release-link injection (2), bioFigure node/NodeView/drag/bubble-menu/dialogs (10-12), sanitizer/renderer origin branch + figure (6-7), save-time re-host + SSRF guard (8-9), ids contract (1), E2E (13). Out-of-scope items (reordering, AI imagery, palette label editing) appear in no task. ✓
- **Type consistency:** `BioStatusLink`/`BioStatusImage` (Task 1) feed palette props (Task 4) and container (Task 5); `BioLinkDragPayload`/`BioImageDragPayload` (Task 4) feed the drop handler (Task 12); `clampFigureWidth`/`FLOAT_TO_CLASS` (Task 10) feed the NodeView (Task 11); `isInternalBioUrl` (Task 4/6) feeds sanitizer (6), renderer (7), editor (12); `isPubliclyRoutableUrl` (8) feeds finalize (9). ✓
- **Known deviations from the spec letter (intentional):** `img` does not get a `class` attribute in the sanitizer (nothing emits one; YAGNI). Palette thumbs render `unoptimized` (mirrors the existing DiscoveredImages guard for fake/E2E-mode external URLs). Public-page revalidation after a palette delete happens on the next regeneration/save, not per-delete (runAdminEntityAction has a static revalidate list; the admin UI stays live via TanStack invalidation).
