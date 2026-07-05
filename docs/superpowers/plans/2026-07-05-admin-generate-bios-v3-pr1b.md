# Admin Generate Bios v3 — PR 1b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an RTE image-upload dialog with required, editable attribution that lands uploads in the persistent bio-image library, and atomically cut the admin artist-image model over to `bioImages` (repoint the RTE picker + featured-cover fallback, migrate existing rows, remove the old images section).

**Architecture:** Builds on PR 1a's persistent bio-image library + write actions. The generic `RichTextEditor` (`ui/`) gains an optional `onUploadImage` callback; when supplied (edit mode, artist saved), its image dialog gains an Upload tab (drag **or** tap-to-pick + required attribution) beside the existing Library grid. Uploads reuse the presigned-S3 → register → variants pipeline but register as `ArtistBioImage` rows (not `Image` rows). Attribution becomes editable in two independent places: the sidebar library tile (persists via `updateArtistBioImageAttributionAction`) and the inserted `bioFigure` node (a local ProseMirror attr edit). The cutover repoints the RTE picker and the featured-artist cover-art fallback from `artist.images` to `bioImages`, migrates existing `Image` rows via a dry-run-default script, and removes `ArtistImagesSection` plus its now-dead artist-only actions. `use-image-operations.ts` stays (the release form uses it).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 6 (strict), TipTap v3 / ProseMirror, TanStack Query 5, Zod 4, Prisma 6 + MongoDB, AWS S3, Vitest 4, shadcn/ui + Tailwind v4, lucide-react.

## Global Constraints

Every task's requirements implicitly include these (from AGENTS.md + the design doc):

- **TDD, non-negotiable:** write the failing test first, watch it fail, then implement. Every task ends green.
- **Gate before every commit:** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` all pass.
- **TypeScript:** no `any`, no non-null assertion (`!`), explicit param/return types, `interface` for object shapes. Named exports only (App Router special files exempt). Arrow functions only (`prefer-arrow-functions`); Next.js special files exempt. Destructure props/params.
- **No suppressions:** no `eslint-disable`, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. ESLint is repo-wide; **cyclomatic complexity ≤ 10** and **max-params** apply everywhere — extract helpers rather than exceed them.
- **New source files** get the MPL header from `HEADER.txt` (copy the 3-line block verbatim from any existing `src` file).
- **Server-only boundaries:** `src/lib/utils/sanitize-bio-html.ts` (`sanitizeBioText`) and repositories are `server-only` — **never import them into client components**. Client-side attribution validation is length-only (Zod `max(500)`); sanitization happens at the server-action boundary (already present in `updateArtistBioImageAttributionAction`; added to create in Task 1).
- **Mobile-first:** every drag path keeps a tap/click fallback; upload uses a native `<input type="file">`; no checkboxes (use toggles/radios); shadcn/ui primitives only (`@/components/ui`, `@/ui`); icons from `lucide-react`; semantic HTML + ARIA + keyboard support.
- **Attribution length:** ≤ 500 chars (matches `createBioImageInputSchema` / `updateBioImageAttributionInputSchema`).
- **Commits:** Conventional Commits `type(scope): <gitmoji> subject`, subject ≤ 50 chars, body lines ≤ 72. No AI-attribution / `Co-authored-by` lines. Feature branch only (`feat/admin-generate-bios-v3-1b`).
- **Coverage:** do not regress the `COVERAGE_METRICS.md` baseline (`test:coverage:check`).

### Interfaces produced by PR 1a (consumed here — do not redefine)

- `createArtistBioImageAction(input: CreateBioImageInput): Promise<{ success: boolean; data?: ArtistBioImageRecord; error?: string }>` — `src/lib/actions/create-artist-bio-image-action.ts`.
- `updateArtistBioImageAttributionAction(input: UpdateBioImageAttributionInput): Promise<{ success: boolean; error?: string }>` — `src/lib/actions/update-artist-bio-image-attribution-action.ts` (already sanitizes attribution via `sanitizeBioText`).
- `deleteArtistBioImageAction(imageId: string): Promise<{ success: boolean; error?: string }>`.
- `createBioImageInputSchema` (Zod) — `src/lib/validation/bio-image-input-schema.ts`: `{ artistId: objectId, url: url, thumbnailUrl?: url|null, title?: string≤300|null, attribution: string≤500 (required), alt?: string≤500|null, sourceUrl?: url|null, width?: int>0|null, height?: int>0|null }`.
- `updateBioImageAttributionInputSchema`: `{ imageId: objectId, attribution: string≤500 | null }`.
- `CreateArtistBioImageData` / `ArtistBioImageRecord` — `src/lib/types/domain/artist.ts`.
- `ArtistRepository.createBioImage` / `.updateBioImageAttribution` — `src/lib/repositories/artist-repository.ts`.
- `useDeleteBioImageMutation(artistId)` / `useDeleteBioLinkMutation(artistId)` — `src/app/hooks/mutations/use-bio-media-mutations.ts` (invalidate `queryKeys.artists.bioGeneration(artistId)`).
- `useArtistBioGenerationStatusQuery(artistId, options?)` — `src/app/hooks/use-artist-bio-generation-status-query.ts`; `.data?.content` carries `images: BioStatusImage[]` (each has `id`, `url`, `thumbnailUrl?`, `title?`, `attribution: string|null`, `width?`, `height?`, `kind?`, `alt?`) and `links: BioStatusLink[]`.

### Existing pipeline primitives (reused, not modified)

- `getPresignedUploadUrlsAction(entityType: 'artists'|'releases'|…, entityId: string, files: PresignedUrlRequest[]): Promise<{ success; data?: PresignedUrlResult[]; error? }>` — `src/lib/actions/presigned-upload-actions.ts`. `PresignedUrlRequest = { fileName; contentType; fileSize; existingS3Key? }`; `PresignedUrlResult = { uploadUrl; s3Key; cdnUrl }`. Accepts `'artists'`.
- `uploadFilesToS3(files: File[], presignedUrls: PresignedUrlResult[]): Promise<DirectUploadResult[]>` — `src/lib/utils/direct-upload.ts`. `DirectUploadResult = { success; s3Key; cdnUrl; error? }`.
- `generateImageVariantsAction(cdnUrl: string): Promise<{ success; variantsGenerated; error? }>` — `src/lib/actions/generate-image-variants-action.ts`. Takes a **CDN URL**, fire-and-forget (see `use-cover-art-upload.ts:221` pattern).
- Native-file-input + drag pattern: `src/app/components/ui/uploader-drop-zone.tsx` (absolutely-positioned `opacity-0` `<input type="file">` → tap anywhere; `onChange`/drop both funnel a `FileList`).

---

## Task 1: Sanitize attribution on create (PR 1a carry-forward)

Symmetric with `updateArtistBioImageAttributionAction`, which already sanitizes. This closes the gap before Task 5 wires the first real caller of the create action.

**Files:**

- Modify: `src/lib/actions/create-artist-bio-image-action.ts`
- Test: `src/lib/actions/create-artist-bio-image-action.spec.ts`

**Interfaces:**

- Consumes: `sanitizeBioText` from `@/lib/utils/sanitize-bio-html` (server-only — fine here, this is a `'use server'` action).
- Produces: no signature change; behavior change only (attribution/title/alt sanitized before the service call).

- [ ] **Step 1 — Failing test.** In the spec, mock `sanitizeBioText` (mirror the update-action spec: `vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => \`clean:${s}\` }))`). Add a test: given `validInput`with`attribution: 'Photo <b>x</b>'`, after a successful call assert `ArtistService.createBioImage`was called with`attribution: 'clean:Photo <b>x</b>'`(and`title`/`alt` likewise sanitized when present). Keep the existing tests green.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/lib/actions/create-artist-bio-image-action.spec.ts` → FAIL (attribution passed through unsanitized).

- [ ] **Step 3 — Implement.** After `createBioImageInputSchema.safeParse(...)` succeeds and before calling `ArtistService.createBioImage`, build a sanitized payload:

```ts
const { attribution, title, alt } = parsed.data;
const created = await ArtistService.createBioImage({
  ...parsed.data,
  attribution: sanitizeBioText(attribution),
  title: title == null ? title : sanitizeBioText(title),
  alt: alt == null ? alt : sanitizeBioText(alt),
});
```

Keep complexity ≤ 10 — if the action's `try` body approaches the limit, extract a `const sanitizeCreateInput = (data: CreateBioImageInput): CreateArtistBioImageData => ({...})` helper above the action.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS. Then run the sibling create/update/delete specs to confirm no regression.

- [ ] **Step 5 — Commit.** `fix: 🐛 sanitize bio-image attribution on create`

---

## Task 2: Update-attribution mutation hook

The sidebar tile (Task 6) needs to persist edited attribution. Only delete mutations exist today. (The upload/create path invalidates directly in Task 5, so no create hook is needed.)

**Files:**

- Modify: `src/app/hooks/mutations/use-bio-media-mutations.ts`
- Test: `src/app/hooks/mutations/use-bio-media-mutations.spec.tsx`

**Interfaces:**

- Consumes: `updateArtistBioImageAttributionAction`, `queryKeys.artists.bioGeneration`.
- Produces: `useUpdateBioImageAttributionMutation(artistId: string): { updateBioImageAttribution: (input: { imageId: string; attribution: string | null }) => void; isUpdatingBioImageAttribution: boolean }`.

- [ ] **Step 1 — Failing test.** Mirror the delete-mutation tests: mock `updateArtistBioImageAttributionAction` and `@tanstack/react-query`'s `useQueryClient` invalidation (the spec already has this harness). Tests: (a) success → `invalidateQueries` called with `queryKeys.artists.bioGeneration(artistId)`; (b) `{ success: false, error: 'x' }` → `toast.error('x')` and **no** invalidation.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/hooks/mutations/use-bio-media-mutations.spec.tsx` → FAIL (hook undefined).

- [ ] **Step 3 — Implement.** Append, following the existing `useDeleteBioImageMutation` shape exactly:

```ts
interface UseUpdateBioImageAttributionMutationResult {
  /** Persists an edited attribution for one bio image row. */
  updateBioImageAttribution: (input: { imageId: string; attribution: string | null }) => void;
  /** True while an attribution update is in flight. */
  isUpdatingBioImageAttribution: boolean;
}

/**
 * Mutation hook wrapping {@link updateArtistBioImageAttributionAction} for the
 * admin bio image palette's inline attribution editor. On success invalidates
 * the artist's bio-generation status query so the palette (and RTE picker)
 * reflect the new value; a failed result surfaces as an error toast.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 */
export const useUpdateBioImageAttributionMutation = (
  artistId: string
): UseUpdateBioImageAttributionMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: updateBioImageAttribution, isPending: isUpdatingBioImageAttribution } =
    useMutation({
      mutationFn: (input: { imageId: string; attribution: string | null }) =>
        updateArtistBioImageAttributionAction(input),
      onSuccess: (result) => {
        if (!result.success) {
          toast.error(result.error ?? 'Failed to update attribution');
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.artists.bioGeneration(artistId),
        });
      },
    });

  return { updateBioImageAttribution, isUpdatingBioImageAttribution };
};
```

Add the import for `updateArtistBioImageAttributionAction`.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ bio-image attribution update mutation hook`

---

## Task 3: Bio-image upload orchestration util

A single-file orchestration that turns a picked `File` + attribution into a persisted `ArtistBioImage`. Distinct from `uploadAndRegisterImages` (which registers `Image` rows) — this registers a bio image.

**Files:**

- Create: `src/app/components/forms/utils/upload-bio-image.ts`
- Test: `src/app/components/forms/utils/upload-bio-image.spec.ts`

**Interfaces:**

- Consumes: `getPresignedUploadUrlsAction`, `uploadFilesToS3`, `createArtistBioImageAction`, `generateImageVariantsAction`.
- Produces:

```ts
export interface UploadBioImageParams {
  artistId: string;
  attribution: string;
  title?: string | null;
  alt?: string | null;
}
export interface UploadBioImageResult {
  success: boolean;
  data?: ArtistBioImageRecord;
  error?: string;
}
export const uploadBioImage = (
  file: File,
  params: UploadBioImageParams
): Promise<UploadBioImageResult>;
```

- [ ] **Step 1 — Failing test.** Mock the three action boundaries + `uploadFilesToS3` (mirror `upload-images.spec.ts` mocking). Fixture: `makeFile('p.jpg','image/jpeg', 1234)`. Cases:
  1. Happy path: presigned → upload ok → create ok → returns `{ success: true, data: createdRecord }`; assert `getPresignedUploadUrlsAction` called with `('artists', artistId, [{ fileName:'p.jpg', contentType:'image/jpeg', fileSize:1234 }])`; assert `createArtistBioImageAction` called with `{ artistId, url: cdnUrl, attribution, title, alt }`; assert `generateImageVariantsAction` called with `cdnUrl`.
  2. Presigned failure → `{ success: false, error }`, and `createArtistBioImageAction` **not** called.
  3. S3 upload failure (`DirectUploadResult.success === false`) → `{ success: false, error }`, create **not** called.
  4. Create action failure (`{ success:false, error:'x' }`) → `{ success:false, error:'x' }`.
  5. Variant generation rejects → still returns `{ success: true }` (fire-and-forget, not awaited/thrown).

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/forms/utils/upload-bio-image.spec.ts` → FAIL.

- [ ] **Step 3 — Implement.** MPL header. Structure (keep complexity ≤ 10 by early-returning on each failure):

```ts
export const uploadBioImage = async (
  file: File,
  { artistId, attribution, title = null, alt = null }: UploadBioImageParams
): Promise<UploadBioImageResult> => {
  const presigned = await getPresignedUploadUrlsAction('artists', artistId, [
    { fileName: file.name, contentType: file.type, fileSize: file.size },
  ]);
  if (!presigned.success || !presigned.data?.[0]) {
    return { success: false, error: presigned.error ?? 'Failed to get upload URL' };
  }

  const [uploadResult] = await uploadFilesToS3([file], presigned.data);
  if (!uploadResult?.success) {
    return { success: false, error: uploadResult?.error ?? 'Failed to upload image' };
  }

  const { cdnUrl } = uploadResult;
  const created = await createArtistBioImageAction({
    artistId,
    url: cdnUrl,
    attribution,
    title,
    alt,
  });
  if (!created.success || !created.data) {
    return { success: false, error: created.error ?? 'Failed to save image' };
  }

  // Fire-and-forget: variants are a progressive enhancement, never block the insert.
  void generateImageVariantsAction(cdnUrl).catch((err) => {
    warn('[Bio image upload] Variant generation failed:', err);
  });

  return { success: true, data: created.data };
};
```

Use the project logger (`warn` from the console-logger util used elsewhere, e.g. `@/lib/utils/console-logger`) — never `console.log`.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ bio-image upload orchestration util`

---

## Task 4: RTE image dialog — Upload mode + `onUploadImage` prop

Extract the inline `ImageDialog` into its own file and give it two modes. Backward-compatible: with no `onUploadImage`, the dialog is pick-only exactly as today (so no other RTE consumer regresses).

**Files:**

- Create: `src/app/components/ui/rich-text-editor-image-dialog.tsx` (extracted + extended)
- Modify: `src/app/components/ui/rich-text-editor.tsx` (thread new prop, use extracted dialog, enable button when uploadable)
- Modify: `src/app/components/ui/rich-text-editor-toolbar.tsx` (button `disabled` condition)
- Test: `src/app/components/ui/rich-text-editor.spec.tsx` (extend; keep real-editor harness)
- Test: `src/app/components/ui/rich-text-editor-image-dialog.spec.tsx` (new, unit — mock `next/image`)

**Interfaces:**

- Produces (new RTE prop):

```ts
onUploadImage?: (
  file: File,
  meta: { attribution: string; title: string | null; subtitle: string | null }
) => Promise<RichTextEditorImage | null>;
```

- Dialog props extend the current `ImageDialogProps` with `onUploadImage?` (same signature) and gain internal mode state (`'library' | 'upload'`). Existing insert path (`onInsertImage`) unchanged.

**Behavior:**

- When `onUploadImage` is provided, render shadcn `Tabs` with **Library** (existing grid, unchanged) and **Upload** panels. When absent, render only the Library grid (today's layout, no tabs).
- **Upload panel:** a drop zone containing a native `<input type="file" accept="image/*">` (absolutely positioned, `opacity-0`, `inset-0` — the `uploader-drop-zone.tsx` pattern) for tap-to-pick; drop and change both set a single selected `File` + a local object-URL preview. A **required** Attribution `LabeledTextField` (reuse the dialog's existing Title/Subtitle/Attribution fields — attribution is required here). An **Upload & insert** button, `disabled` until a file is chosen **and** attribution is non-empty, and while uploading. On click: `setUploading(true)` → `const img = await onUploadImage(file, { attribution, title, subtitle })` → if `img` truthy, call `onInsertImage(img)` (inserts the `bioFigure` with the typed attribution via the RTE's `insertImage`) and close; else surface `toast.error` and stay open. Revoke the object URL on cleanup.
- **Toolbar button:** change `disabled={images.length === 0}` → `disabled={images.length === 0 && !canUpload}` where `canUpload` (a new boolean prop on the toolbar) is `!!onUploadImage`. Thread `canUpload` from RTE → toolbar.

- [ ] **Step 1 — Failing tests.**
  - `rich-text-editor-image-dialog.spec.tsx` (new): (a) without `onUploadImage`, no "Upload" tab is rendered and the grid shows; (b) with `onUploadImage`, choosing a file via the file input (`fireEvent.change(input, { target: { files: [makeFile()] } })`) + typing attribution enables "Upload & insert"; clicking it calls `onUploadImage(file, { attribution, title, subtitle })` then, on a resolved `RichTextEditorImage`, calls `onInsertImage(thatImage)`; (c) empty attribution keeps the button disabled; (d) `onUploadImage` resolving `null` keeps the dialog open and does not call `onInsertImage`. Mock `next/image`; mock `URL.createObjectURL`/`revokeObjectURL`.
  - `rich-text-editor.spec.tsx` (extend): with an `onUploadImage` prop supplied and `images={[]}`, the "Insert image" toolbar button is **enabled** (today it's disabled when empty). Keep all existing image tests green.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/ui/rich-text-editor-image-dialog.spec.tsx src/app/components/ui/rich-text-editor.spec.tsx` → FAIL.

- [ ] **Step 3 — Implement.**
  1. Move `ImageDialogProps` + `ImageDialog` into `rich-text-editor-image-dialog.tsx` (MPL header; export the component + props type). Preserve the existing pick-only rendering when `onUploadImage` is undefined.
  2. Add mode state + the Upload panel + Tabs (only when `onUploadImage` present). Reuse `LabeledTextField` for the required attribution. Use `@/components/ui/tabs`.
  3. In `rich-text-editor.tsx`: add `onUploadImage?` to `RichTextEditorProps`; import the extracted dialog; pass `onUploadImage` and existing props through; compute `canUpload = !!onUploadImage` and pass to the toolbar; pass `canUpload` to the dialog’s render only via the `onUploadImage` presence.
  4. In `rich-text-editor-toolbar.tsx`: add `canUpload?: boolean` prop; button `disabled={images.length === 0 && !canUpload}`.

  Keep each file focused and complexity ≤ 10 — the Upload panel can be its own small internal component in the dialog file if the dialog’s render grows past the limit.

- [ ] **Step 4 — Run, verify pass.** Same command, then the full `ui/` bio/editor specs (`rich-text-editor*`, `bio-figure-*`, `bio-editor-*`) → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ RTE image dialog upload mode`

---

## Task 5: Wire upload into the artist form

Provide `onUploadImage` from the artist form (edit mode only, when `artistId` exists) and thread it through the bio section to every RTE. Uploaded images persist as bio images and refresh the sidebar.

**Files:**

- Modify: `src/app/components/forms/artist-form.tsx`
- Modify: `src/app/components/forms/sections/artist-bio-section.tsx`
- Modify: `src/app/components/forms/sections/bio-editor-field.tsx` (or wherever `BioEditorField` lives — pass the prop through to `RichTextEditor`)
- Test: `src/app/components/forms/sections/artist-bio-section.spec.tsx` (prop pass-through)
- Test: `src/app/components/forms/artist-form.spec.tsx` (onUploadImage present only with artistId)

**Interfaces:**

- Consumes: `uploadBioImage` (Task 3), `useQueryClient`, `queryKeys.artists.bioGeneration`.
- Produces: `ArtistBioSectionProps` gains `onUploadImage?` (same signature as the RTE prop); `BioEditorField` forwards it.

**Behavior:** `onUploadImage` runs `uploadBioImage(file, { artistId, attribution: meta.attribution, title: meta.title, alt: null })`; on success invalidates `queryKeys.artists.bioGeneration(artistId)` (sidebar + picker refresh) and returns `{ url: data.url, alt: data.alt ?? null }`; on failure `toast.error(result.error)` and returns `null`. Only construct/pass it when `artistId` is non-null.

- [ ] **Step 1 — Failing tests.** `artist-bio-section.spec.tsx`: when `onUploadImage` is passed, each `BioEditorField`/`RichTextEditor` receives it (assert via a mocked `RichTextEditor` capturing props). `artist-form.spec.tsx`: in create mode (no `artistId`) the bio section receives `onUploadImage === undefined`; with an `artistId` it receives a function.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/forms/sections/artist-bio-section.spec.tsx src/app/components/forms/artist-form.spec.tsx` → FAIL.

- [ ] **Step 3 — Implement.** In `artist-form.tsx` add:

```ts
const queryClient = useQueryClient();

const handleUploadBioImage = useCallback(
  async (
    file: File,
    meta: { attribution: string; title: string | null; subtitle: string | null }
  ): Promise<RichTextEditorImage | null> => {
    if (!artistId) return null;
    const result = await uploadBioImage(file, {
      artistId,
      attribution: meta.attribution,
      title: meta.title,
    });
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to upload image');
      return null;
    }
    void queryClient.invalidateQueries({
      queryKey: queryKeys.artists.bioGeneration(artistId),
    });
    return { url: result.data.url, alt: result.data.alt ?? null };
  },
  [artistId, queryClient]
);
```

Pass `onUploadImage={artistId ? handleUploadBioImage : undefined}` to `ArtistBioSection`; forward through `BioEditorField` to `RichTextEditor`. Add the `onUploadImage?` prop to `ArtistBioSectionProps` and the field's props.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ wire bio-image upload into artist form`

---

## Task 6: Editable attribution on the sidebar tile

Replace the read-only attribution `<p>` in `BioImageTile` with an inline editor that persists via the Task 2 mutation. Mobile-safe (explicit Save/Cancel, not hover-only).

**Files:**

- Modify: `src/app/components/forms/bio-image-palette.tsx`
- Modify: `src/app/components/forms/bio-media-palettes.tsx` (own the mutation, pass `onEditAttribution`)
- Test: `src/app/components/forms/bio-image-palette.spec.tsx`
- Test: `src/app/components/forms/bio-media-palettes.spec.tsx`

**Interfaces:**

- `BioImagePaletteProps` and `BioImageTileProps` gain `onEditAttribution: (imageId: string, attribution: string) => void` and `disabled` already present.
- `BioMediaPalettes` uses `useUpdateBioImageAttributionMutation(artistId)` and passes `onEditAttribution={(id, value) => updateBioImageAttribution({ imageId: id, attribution: value })}` plus `disabled={isDeleting || isUpdatingBioImageAttribution}`.

**Behavior:** each tile shows attribution text with a small **edit** (pencil, `lucide-react`) button (`aria-label={\`Edit attribution for ${previewLabel}\`}`). Clicking swaps in a shadcn `Input`prefilled with the current attribution + **Save** and **Cancel** buttons. Save (Enter or button) calls`onEditAttribution(image.id, trimmedValue)`then exits edit mode; Cancel restores. Enforce`maxLength={500}`. When there is no attribution yet, show an "Add attribution" affordance (same editor, empty input).

- [ ] **Step 1 — Failing tests.** `bio-image-palette.spec.tsx`: (a) clicking the edit button reveals an input prefilled with `image.attribution`; (b) editing + Save calls `onEditAttribution(image.id, 'New credit')`; (c) Cancel leaves the displayed attribution unchanged and calls nothing; (d) `maxLength` is 500. `bio-media-palettes.spec.tsx`: editing a tile calls the mocked `updateBioImageAttribution` with `{ imageId, attribution }` (mock `useUpdateBioImageAttributionMutation`).

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/forms/bio-image-palette.spec.tsx src/app/components/forms/bio-media-palettes.spec.tsx` → FAIL.

- [ ] **Step 3 — Implement.** Add a local `editing` boolean + `draft` string to `BioImageTile` (via `useState`). Keep complexity ≤ 10 — extract an `AttributionEditor` sub-component in the same file if the tile’s JSX grows. Thread `onEditAttribution` through the palette; in `BioMediaPalettes`, add the mutation hook and pass the handler + combined `disabled`.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ inline attribution editing in bio palette`

---

## Task 7: Editable attribution on the inserted figure

Add an attribution edit control to `BioFigureNodeView`, editing the node's `attribution` attr locally (the library row is a separate source of truth — no sync).

**Files:**

- Modify: `src/app/components/ui/bio-figure-node-view.tsx`
- Test: `src/app/components/ui/bio-figure-node-view.spec.tsx`

**Interfaces:**

- Consumes: `NodeViewProps` (`updateAttributes`, and newly `editor` for `editor.isEditable`).
- Produces: no external signature change; a new editable-attribution affordance inside the figure.

**Behavior:** when `editor.isEditable` and the figure is `selected` (reuse the existing `FigureControls` visibility model), expose an **edit attribution** control. Clicking reveals an input prefilled with `attribution ?? ''`; committing (Enter/blur) calls `updateAttributes({ attribution: value.trim() || null })`; Escape cancels. Read-only render (published/non-editable) is unchanged. Tap-friendly.

- [ ] **Step 1 — Failing tests.** In the spec, extend `makeProps` to include `editor: { isEditable: true } as unknown as NodeViewProps['editor']`. Tests: (a) with `isEditable`, an edit-attribution control is present and editing + commit calls `updateAttributes({ attribution: 'Credit' })`; (b) committing an empty value calls `updateAttributes({ attribution: null })`; (c) with `editor.isEditable === false`, no edit control renders (attribution still shows as text).

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/ui/bio-figure-node-view.spec.tsx` → FAIL.

- [ ] **Step 3 — Implement.** Destructure `editor` from `NodeViewProps`; add local `editingAttribution`/`draft` state; render the control within the existing controls overlay/caption region. Extract a small `AttributionField` component in-file if needed for complexity. Do **not** import the server-only sanitizer; length-bound the input at 500. Confirm `FigureCaption` still renders the persisted attribution text after commit.

- [ ] **Step 4 — Run, verify pass.** Same command, plus `bio-figure-extension.spec.ts` → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ edit attribution on inserted bio figures`

---

## Task 8: Repoint featured-cover fallback to primary bioImage

The featured-artist cover-art fallback currently reads `artist.images[0].src`. Repoint it to the primary `bioImage.url` so it survives the cutover.

**Files:**

- Modify: `src/lib/repositories/featured-artist-repository.ts` (two `images` selects → `bioImages`)
- Modify: `src/lib/types/domain/featured-artist.ts` (`FeaturedArtistArtist.images` → `bioImages`)
- Modify: `src/lib/utils/get-featured-artist-cover-art.ts` (`firstArtistImageSrc` reads `bioImages[0].url`)
- Test: `src/lib/utils/get-featured-artist-cover-art.spec.ts`
- Test: `src/lib/repositories/featured-artist-repository.spec.ts` (assert the new select shape if it asserts includes)

**Interfaces:**

- `FeaturedArtistArtist` changes from `images: Array<{ src: string | null }>` to `bioImages: Array<{ url: string }>`.
- Repository select becomes: `bioImages: { where: { isPrimary: true }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } }` (both call sites).

- [ ] **Step 0 — Grep for consumers.** `grep -rn "\.images" src | grep -i featured` and inspect `FeaturedArtistArtist` usages so no other reader breaks. Adjust any consumer found (report if there’s more than the two known: `featured-artists-player.tsx`, `media-player.tsx`, both via `getFeaturedArtistCoverArt`).

- [ ] **Step 1 — Failing test.** Update `get-featured-artist-cover-art.spec.ts` fixtures from `artists: [{ images: [{ src }] }]` to `artists: [{ bioImages: [{ url }] }]`; assert the fallback returns `bioImages[0].url`, and returns `null` when an artist has no `bioImages`. Update the repository spec's expected include if it asserts one.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/lib/utils/get-featured-artist-cover-art.spec.ts src/lib/repositories/featured-artist-repository.spec.ts` → FAIL.

- [ ] **Step 3 — Implement.** Change the type, both repository selects, and `firstArtistImageSrc`:

```ts
const firstArtistImageUrl = (featured: FeaturedArtist): string | null => {
  if (!featured.artists?.length) return null;
  for (const artist of featured.artists) {
    if (artist.bioImages?.length && artist.bioImages[0].url) {
      return artist.bioImages[0].url;
    }
  }
  return null;
};
```

Update the fallback-chain comment (lines ~7-15) to say "primary bioImage" instead of "artist image".

- [ ] **Step 4 — Run, verify pass.** Same command, plus `pnpm run typecheck` (the type change must ripple cleanly) → PASS.

- [ ] **Step 5 — Commit.** `refactor: ♻️ featured cover-art fallback to bioImages`

---

## Task 9: Migration script — `Image` → `ArtistBioImage`

Dry-run-default, idempotent, iterates all artists, copies admin images into bio images. **Merging the PR runs nothing** — this executes only on an explicit `--execute`.

**Files:**

- Create: `scripts/migrate-artist-images-to-bio-images.ts`
- Test: `scripts/migrate-artist-images-to-bio-images.spec.ts`

**Interfaces:**

- Produces: `migrateArtistImagesToBioImages(argv: string[], injectedPrisma?: PrismaClient): Promise<{ scanned: number; migrated: number; skipped: number }>` (DI for tests, per `migrate-email-verified-to-boolean.ts`).

**Behavior:**

- Own `PrismaClient` (`injectedPrisma ?? new PrismaClient()`); disconnect in `finally` only when not injected.
- Dry-run default; write only when `argv.includes('--execute')`.
- `prisma.artist.findMany({ include: { images: { orderBy: { sortOrder: 'asc' } }, bioImages: { select: { url: true } } } })`.
- For each artist, for each `image` with a non-empty `src`: **skip** when `image.src` already exists in that artist's `bioImages` urls (idempotency, by exact URL). Otherwise map:
  - `url = image.src`
  - `title = image.caption ?? null`
  - `alt = image.altText ?? null`
  - `attribution = image.caption ?? image.altText ?? 'Uploaded'`
  - `kind = 'upload'`, `isPrimary = false`, `sortOrder = image.sortOrder ?? 0`
- On `--execute`, `prisma.artistBioImage.create({ data: { artistId: artist.id, ...mapped } })`. Log per-artist counts with a `[migrate-artist-images]` prefix via `console.info`.
- **Module docstring MUST state, prominently:** running `--execute` copies admin `artist.images` into `bioImages`, and because the public artist **detail** page renders `bioImages`, migrated images become **publicly visible** for artists that have no `isPrimary` bioImages. All migrated rows are `isPrimary: false` (they never appear on the public index card, which queries `isPrimary: true`). Dry-run first.
- CLI entry guard (`if (process.argv[1]?.endsWith('migrate-artist-images-to-bio-images.ts')) …`).

- [ ] **Step 1 — Failing tests.** With an injected fake/mock `PrismaClient`: (a) dry-run reports counts and calls **no** `artistBioImage.create`; (b) `--execute` creates one bio image per new admin image with the mapped fields (assert the `create` data for attribution fallback precedence: caption → altText → 'Uploaded'); (c) idempotency: an image whose `src` already exists in `bioImages` is skipped; (d) images with null/empty `src` are skipped.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run scripts/migrate-artist-images-to-bio-images.spec.ts` → FAIL.

- [ ] **Step 3 — Implement.** MPL header + the docstring above. Borrow the dry-run/DI/env/entry-guard skeleton from `scripts/migrate-email-verified-to-boolean.ts` and the typed `findMany` + per-row idempotent loop from `scripts/fix-featured-artist-connections.ts`. Keep each function ≤ 10 complexity — extract `mapImageToBioImage(image)` and `migrateArtist(prisma, artist, execute)` helpers.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ artist.images → bioImages migration script`

---

## Task 10a: Source the RTE picker from the persisted bio library (additive)

Make the artist form feed the RTE insert-image picker from the persisted `bioImages` (via the status query) **in addition to** its current sources. Additive — no removals yet — so the picker is proven against `bioImages` before Task 10b drops `artist.images`.

**Files:**

- Modify: `src/app/components/forms/artist-form.tsx`
- Test: `src/app/components/forms/artist-form.spec.tsx`

**Interfaces:**

- Consumes: `useArtistBioGenerationStatusQuery(artistId ?? '', { enabled: !!artistId })`.
- `computeBioEditorImages` gains a third source (persisted bio-library images) merged after uploaded/generated, deduped by URL.

**Behavior:** map `statusQuery.data?.content?.images ?? []` (`BioStatusImage[]`) to `RichTextEditorImage[]` as `{ url: image.url, alt: image.alt ?? image.title ?? '' }` and merge into `bioEditorImages` (dedupe by URL; order: uploaded → generated `bioPickerImages` → persisted library). Extend `computeBioEditorImages` to accept the extra array (keep it pure + ≤ 10 complexity by looping the three sources through one `seen` set).

- [ ] **Step 1 — Failing test.** `artist-form.spec.tsx`: mock `useArtistBioGenerationStatusQuery` to return `content.images = [{ id, url:'https://cdn/x.webp', attribution:null }]`; assert the bio section receives a `bioEditorImages` entry with `url:'https://cdn/x.webp'` (assert via a mocked `ArtistBioSection` capturing props). Assert dedupe: a URL present in both uploaded images and the library appears once.

- [ ] **Step 2 — Run, verify fail.** `pnpm exec vitest run src/app/components/forms/artist-form.spec.tsx` → FAIL.

- [ ] **Step 3 — Implement.** Add the status-query call; extend `computeBioEditorImages(images, bioPickerImages, libraryImages)`; update the `useMemo` deps. Do not remove the `images.images` source yet.

- [ ] **Step 4 — Run, verify pass.** Same command → PASS.

- [ ] **Step 5 — Commit.** `feat: ✨ source bio editor picker from bio library`

---

## Task 10b: Cutover — remove ArtistImagesSection + dead artist-image wiring

Remove the admin artist-images model from the artist form now that uploads, the picker, and the featured fallback all run off `bioImages`. `use-image-operations.ts` stays (release form uses it).

**Files:**

- Modify: `src/app/components/forms/artist-form.tsx` (remove section + all `artist.images` wiring)
- Delete: `src/app/components/forms/sections/artist-images-section.tsx` + its spec
- Delete: `src/lib/actions/artist-image-actions.ts` (`reorderArtistImagesAction`, `deleteArtistImageAction`) + spec — **only if** grep confirms no other consumer
- Modify: `src/lib/actions/register-image-actions.ts` — remove the `registerArtistImagesAction` export only (keep the release variant + shared types) — **only if** grep confirms artist-form was its sole consumer
- Modify: `src/app/components/forms/artist-form.spec.tsx`
- Modify: any spec referencing the removed exports

**Behavior — remove from `artist-form.tsx`:** the `<ArtistImagesSection>` block and its `<Separator>`; the `useImageOperations({ entityType:'artists', … })` call; `mapArtistImages` + its use in the load effect; `pendingImages`; both `images.uploadImages(...)` calls in `submitArtistUpdate`/`submitArtistCreate` (and the now-unused `SubmitArtistDeps.images`); the `images.*` inputs to `computeIsSubmitting`/`computeIsDirty`/`isDirty` (drop `isUploadingImages`, `imagesReordered`, `hasPendingImages`); the `computeBioEditorImages` `images.images` argument (now sources from library + generated only); imports of `useImageOperations`, `ArtistImagesSection`, `mapArtistImages`'s deps, `reorderArtistImagesAction`, `deleteArtistImageAction`, `registerArtistImagesAction`, and the `ImageItem` type if unused. Update `SubmittingState`/`computeIsSubmitting` signatures accordingly.

- [ ] **Step 0 — Grep to confirm dead exports.** `grep -rn "registerArtistImagesAction\|reorderArtistImagesAction\|deleteArtistImageAction" src` (excluding the definition files and their specs). If any live consumer remains, keep that export and note it; delete only the truly-dead ones.

- [ ] **Step 1 — Update the tests (refactor-under-test).** Update `artist-form.spec.tsx`: remove assertions about the images section / image upload on submit; add an assertion that `ArtistImagesSection` is **not** rendered. Remove `artist-images-section.spec.tsx`. Update any action spec you delete. (This task is refactor-under-test: the suite defines "done".)

- [ ] **Step 2 — Run, verify fail/red.** `pnpm exec vitest run src/app/components/forms/artist-form.spec.tsx` → FAIL (still references removed wiring) until implementation matches.

- [ ] **Step 3 — Implement.** Perform the removals above. Delete the section file + spec. Delete the confirmed-dead actions + specs. Run `pnpm run typecheck` and fix every resulting type error (this is the safety net for the surgery). Ensure the release form and `use-image-operations.ts` are untouched and their specs stay green.

- [ ] **Step 4 — Run, verify pass.** `pnpm exec vitest run src/app/components/forms` + `pnpm run typecheck` → PASS. Then the full suite (`pnpm run test:run`).

- [ ] **Step 5 — Commit.** `refactor: ♻️ remove artist images section (bioImages cutover)`

---

## Final steps (controller, after all tasks green)

- [ ] Full gate on the branch: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- [ ] `pnpm run test:coverage:check` — confirm no regression vs `COVERAGE_METRICS.md`.
- [ ] Dispatch the final whole-branch review (most capable model) with the branch review package.
- [ ] Update the design/PR notes to record the two behavior changes: (1) migrated images become public on the detail page for artists lacking `isPrimary` bioImages — migration is manual/dry-run-default; (2) create-mode admin image upload is removed (bio images attach after save). Note E2E for the upload→sidebar→insert flow is exercised in CI.
- [ ] Finish via superpowers:finishing-a-development-branch (push + open PR).

## Self-review notes (spec coverage)

- Upload dialog + required attribution → Tasks 3, 4, 5. Editable attribution (library + figure) → Tasks 6, 7. Cutover: picker repoint → 10a/10b; featured fallback → 8; migration → 9; section removal → 10b. Carry-forwards from 1a: attribution sanitize on create → Task 1; SSRF guard → **N/A for 1b** (the upload path fetches nothing external; it stores our own CDN URL and reads our own S3 by key — SSRF hardening belongs to PR 2/3's external fetches). Mobile: native file input (Task 4), explicit Save/Cancel editors (Tasks 6, 7), all drag paths retain tap/Plus fallbacks (unchanged).
  </content>
  </invoke>
