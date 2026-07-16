# Playlists PR3 — Global "Add to a playlist" menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user add the currently-playing track (or a video) to one of their playlists — or create a new playlist seeded with it — directly from any media player, via a kebab "⋮" popover.

**Architecture:** This is the third and final playlists PR. Backend, the picker, the add-item mutation, the duplicate-confirm dialog, the full creator, and the `?edit=` deep-link all already exist (PR1 #597, PR2 #601). PR3 rewrites the dormant `MediaPlayer.DotNav*` stubs onto a real Radix Popover, adds a lazy "Add to a playlist" panel + a lazy "Create playlist" dialog that embeds the existing creator in a new `variant="embedded"` mode, and wires the menu into four player surfaces. No new API routes, services, repositories, or schema.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 (strict), shadcn/ui (Radix Popover/Dialog/AlertDialog/Command), Tailwind v4, TanStack Query 5, React Hook Form 7 + Zod 4, `sonner` toasts, lucide-react, Vitest 4 + @testing-library/react, Playwright.

## Global Constraints

- **Arrow functions only** (`const X = () => …`); **named exports only** (App Router special files exempt). No `function` declarations.
- **No `any`, no non-null `!`, no `eslint-disable`/`@ts-*` suppressions.** Fix the code, not the linter. ESLint `complexity` cap is **10** repo-wide — extract helpers up front.
- **MPL header** (`HEADER.txt`) at the top of every new source file.
- **Tailwind v4 utilities only**, mobile-first, compose with `cn()`. No inline styles, no `@apply`. Icons from `lucide-react`, UI text in Jost. Reuse shadcn/ui primitives from `@/components/ui` — never create a new UI primitive.
- **Client components** (`'use client'`) for everything here (all interactive). Client code never calls Prisma/services/repositories — only Server Actions (mutations) and API routes (queries) via existing hooks.
- **TDD, non-negotiable:** write the failing test first, watch it fail, implement minimally, watch it pass, commit. Specs are `.spec.ts(x)` adjacent to source. `describe`/`it`/`expect`/`vi` are globals — never import from `vitest`.
- **Gate before every commit:** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. Never regress the `COVERAGE_METRICS.md` branch baseline (≥95% floor).
- **Conventional commits** `type(scope): <gitmoji> subject`, subject ≤48 visible chars **before** the gitmoji (commitlint counts the emoji). No `--no-verify`. **No AI attribution / Co-authored-by.** Never commit to `main`. Work only in this worktree.
- **Session gating rule (this feature):** the menu renders **only** when `useSession().status === 'authenticated'`. During SSR and the client's first paint the status is `'loading'`, so the component returns `null` on both — this _is_ the hydration-safe mount-gate (server and first client render agree). Signed-out (`'unauthenticated'`) also returns `null`.

---

## Shared Contracts

Every task uses these existing types/values verbatim — **do not redefine them**.

```ts
// src/lib/types/domain/playlist.ts (existing)
export interface PlaylistSearchItem {
  key: string;
  itemType: PlaylistItemType; // 'track' | 'video'
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
  source: { trackFileId: string; releaseId: string } | { videoId: string };
  context?: string;
}
export interface PlaylistListRow {
  id: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  updatedAt: string;
}
export interface PlaylistItemSourceRef {
  // plain interface — NOT a never-guarded union
  itemType: PlaylistItemType; // 'track' | 'video'
  trackFileId?: string;
  videoId?: string;
}

// src/lib/validation/playlist-schema.ts (existing)
export type AddPlaylistItemInput = (
  | { itemType: 'track'; trackFileId: string }
  | { itemType: 'video'; videoId: string }
) & { playlistId: string; force: boolean };

// src/lib/constants/playlists.ts (existing)
export const DUPLICATE_ITEM_ERROR = 'DUPLICATE_ITEM';
```

Existing hooks/components reused (import, don't rebuild):

- `useAddPlaylistItemMutation()` — `src/app/hooks/use-playlist-mutations.ts`. `addPlaylistItemAsync(input): Promise<PlaylistActionResult<{ item }>>` **never rejects** on `{ success:false }`; branch on `result.success` / `result.error === DUPLICATE_ITEM_ERROR`. `isAddingPlaylistItem` guards double-fire. Invalidates `playlists.mine()` + `playlists.detail(id)` on success.
- `usePlaylistsQuery()` — first page of the user's playlists (used by the picker).
- `PlaylistPickerCombobox` — `src/app/components/playlists/playlist-picker-combobox.tsx`. Props `{ onPick: (row: PlaylistListRow) => void; excludePlaylistId?: string }`. Inline cmdk list, first 5, client-filtered.
- `PlaylistDuplicateConfirmDialog` — `{ open; onOpenChange; itemTitle; onConfirm }` (AlertDialog).
- `PlaylistCreator` — `src/app/components/playlists/playlist-creator.tsx` (extended in Task 3).
- `usePlaylistCreator` machine: `resetToDraft(items)`, `markSaved(id)`, `state.playlistId`, `state.phase`; `draftItemFromSearchItem(searchItem): DraftItem` and `toSourceRef` in `use-playlist-creator.ts`.
- `useSession()` — `src/app/hooks/use-session.ts` → `{ data, status, update }`, `status: 'authenticated'|'loading'|'unauthenticated'`.
- `MediaPlayer` compound — `src/app/components/ui/audio/media-player/media-player.tsx` (`.DotNavMenu` rewritten in Task 4).
- `Popover`/`PopoverTrigger`/`PopoverContent` — `@/components/ui/popover`. `Dialog*` — `@/components/ui/dialog`. `Button` — `@/components/ui/button`. `toast` — `sonner`.

---

## File Structure

- **New (feature, `src/app/components/playlists/`):** `add-to-playlist-menu.tsx`, `add-to-playlist-panel.tsx`, `create-playlist-dialog.tsx`, `use-add-to-playlist-flow.ts`, `player-media-item.ts`, `playlist-save-form.tsx`.
- **New (util):** `src/lib/utils/build-add-playlist-item-input.ts`.
- **Modify:** `playlist-save-dialog.tsx`, `playlist-creator.tsx`, `use-creator-add-flow.ts`, `use-add-to-other-playlist.ts` (import the extracted util); `media-player.tsx` (+ its spec); `release-player.tsx`, `artist-player.tsx`, `featured-artists-player.tsx`, `video-card.tsx`.
- **New E2E:** `e2e/tests/playlists/playlist-add-from-player.spec.ts`.
- Each new/changed unit gets an adjacent `*.spec.ts(x)`.

---

### Task 1: Extract `buildAddPlaylistItemInput` util (DRY the duplicated `addItemInputFor`)

`addItemInputFor` is byte-identical in `use-creator-add-flow.ts` and `use-add-to-other-playlist.ts`. Extract once; both import it; the panel (Task 6) reuses it.

**Files:**

- Create: `src/lib/utils/build-add-playlist-item-input.ts`
- Create test: `src/lib/utils/build-add-playlist-item-input.spec.ts`
- Modify: `src/app/components/playlists/use-creator-add-flow.ts`, `use-add-to-other-playlist.ts` (delete local `addItemInputFor`, import the util)

**Interfaces:**

- Produces: `buildAddPlaylistItemInput(item: PlaylistSearchItem, playlistId: string, force: boolean): AddPlaylistItemInput`

- [ ] **Step 1 — failing test** `build-add-playlist-item-input.spec.ts`:

```ts
import { buildAddPlaylistItemInput } from './build-add-playlist-item-input';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

const track: PlaylistSearchItem = {
  key: 'track:t1',
  itemType: 'track',
  title: 'A',
  artistName: 'x',
  coverArt: null,
  duration: 1,
  source: { trackFileId: 't1', releaseId: 'r1' },
};
const video: PlaylistSearchItem = {
  key: 'video:v1',
  itemType: 'video',
  title: 'B',
  artistName: null,
  coverArt: null,
  duration: null,
  source: { videoId: 'v1' },
};

it('builds a track input from a track search item', () => {
  expect(buildAddPlaylistItemInput(track, 'p1', false)).toEqual({
    itemType: 'track',
    trackFileId: 't1',
    playlistId: 'p1',
    force: false,
  });
});
it('builds a video input from a video search item', () => {
  expect(buildAddPlaylistItemInput(video, 'p1', true)).toEqual({
    itemType: 'video',
    videoId: 'v1',
    playlistId: 'p1',
    force: true,
  });
});
```

- [ ] **Step 2 — run, expect FAIL** (`module not found`): `pnpm exec vitest run src/lib/utils/build-add-playlist-item-input.spec.ts`
- [ ] **Step 3 — implement** (MPL header + arrow fn), lifting the existing body verbatim:

```ts
export const buildAddPlaylistItemInput = (
  { source }: PlaylistSearchItem,
  playlistId: string,
  force: boolean
): AddPlaylistItemInput =>
  'trackFileId' in source
    ? { itemType: 'track', trackFileId: source.trackFileId, playlistId, force }
    : { itemType: 'video', videoId: source.videoId, playlistId, force };
```

- [ ] **Step 4 — refactor both hooks** to `import { buildAddPlaylistItemInput }` and delete their local copies; keep call sites (`addItemInputFor(item, id, force)` → `buildAddPlaylistItemInput(item, id, force)`).
- [ ] **Step 5 — run** the util spec + both hook specs (`use-add-to-other-playlist.spec.*`, `use-creator-add-flow.spec.*`): all PASS.
- [ ] **Step 6 — commit** `refactor(playlists): ♻️ share add-item builder` <!-- ≤48 visible chars before the gitmoji -->

---

### Task 2: Extract `PlaylistSaveForm` from `PlaylistSaveDialog` (behavior-preserving)

Split the RHF form body out so it can render either inside the existing Dialog (page mode) or inline (embedded creator, Task 3) — no Dialog-in-Dialog.

**Files:**

- Create: `src/app/components/playlists/playlist-save-form.tsx`, `playlist-save-form.spec.tsx`
- Modify: `src/app/components/playlists/playlist-save-dialog.tsx`

**Interfaces:**

- Produces: `PlaylistSaveForm` — owns the RHF form (`{ title, isPublic, coverImages }`), `pendingFiles` state, `usePlaylistSaveSubmit`, and a `variant`-driven footer.

```ts
interface PlaylistSaveFormProps {
  variant: 'dialog' | 'inline';
  mode: 'create' | 'edit';
  playlistId: string | null;
  initialValues: { title: string; isPublic: boolean; coverImages: string[] };
  pendingItemRefs: PlaylistItemSourceRef[];
  availableArtistImages: string[];
  onSaved: (playlist: PlaylistDetailResponse) => void;
  onSavingChange?: (isSaving: boolean) => void; // lets the dialog gate its close while saving
  onCancel?: () => void; // dialog only
  onAddSongs?: () => void; // dialog + edit mode only
}
```

- Consumes: `PlaylistCoverArtField`, `usePlaylistSaveSubmit`, `playlistSaveFormSchema` (move the `z.object({ title, isPublic, coverImages })` here or keep in the dialog and pass down — keep it in the form).

- [ ] **Step 1 — failing tests** `playlist-save-form.spec.tsx`: (a) render `variant="dialog"` `mode="create"`, assert the Title input, the Public switch, and a "Save" button render; typing a title + submit calls a mocked submit (mock `usePlaylistSaveSubmit` to capture `submitSave`); mirror the assertions already in `playlist-save-dialog.spec.tsx` so parity is provable. (b) render `variant="inline"` and assert the footer shows **only** Save — no "Cancel", no "Add songs" — so both footer branches are self-covered by this spec.
- [ ] **Step 2 — run, expect FAIL** (module not found).
- [ ] **Step 3 — implement** `PlaylistSaveForm`: lift the `<Form>…</Form>` JSX (title field, cover-art field, public switch) verbatim from the dialog. Footer: `variant === 'dialog'` → the existing `DialogFooter` (Add songs + Cancel + Save); `variant === 'inline'` → a plain `<div className="flex justify-end gap-2">` with just the Save button. Call `onSavingChange?.(isSaving)` via effect so the parent dialog can keep gating Escape/overlay close.
- [ ] **Step 4 — rewrite `PlaylistSaveDialog`** to render `<Dialog><DialogContent><DialogHeader/><PlaylistSaveForm variant="dialog" onSavingChange={setIsSaving} onCancel={() => onOpenChange(false)} …/></DialogContent></Dialog>`, keeping its in-flight close gate. **The existing `playlist-save-dialog.spec.tsx` must pass unchanged** (this is the regression proof).
- [ ] **Step 5 — run** both specs + `pnpm run typecheck`: PASS.
- [ ] **Step 6 — commit** `refactor(playlists): ♻️ extract PlaylistSaveForm`

---

### Task 3: `PlaylistCreator` — `variant="embedded"`, `seedItem`, `onOpenInMyPlaylists`

Page mode is the untouched default. Embedded mode renders the metadata form inline (no nested Dialog), can be seeded with a starting item, and exposes an "Open in My Playlists" affordance once saved.

**Files:**

- Modify: `src/app/components/playlists/playlist-creator.tsx`
- Modify test: `src/app/components/playlists/playlist-creator.spec.tsx` (add embedded-mode cases; keep page-mode cases green)

**Interfaces:**

- Produces (additive props; all optional, page mode unchanged):

```ts
interface PlaylistCreatorProps {
  editPlaylistId: string | null;
  onEditHandled: () => void;
  ref?: Ref<PlaylistCreatorHandle>;
  variant?: 'page' | 'embedded'; // default 'page'
  seedItem?: PlaylistSearchItem; // embedded: pre-stage this on mount
  onOpenInMyPlaylists?: (playlistId: string) => void; // embedded: fires with the saved id
}
```

- [ ] **Step 1 — failing tests** (embedded):
  1. Given `variant="embedded"` + a `seedItem`, on mount the item's title appears in the list AND the inline metadata form (Title input) is visible — **no `role="dialog"`** in the tree (`expect(screen.queryByRole('dialog')).toBeNull()`).
  2. Given embedded + a stubbed create that resolves to `{ id: 'p9', … }`, after saving, an **"Open in My Playlists"** button is enabled and clicking it calls `onOpenInMyPlaylists('p9')`.
  3. Regression: `variant` default (page) still renders the save flow through `PlaylistSaveDialog` (existing assertion).
  4. Re-render with a **different** `seedItem` after mount does NOT re-stage — the list still shows only the first seeded item (proves the ref-guarded mount-once effect).
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
  - Seed (mount-once, exhaustive-deps-safe via a ref guard so a later `seedItem` prop change never re-stages):
    ```tsx
    const seededRef = useRef(false);
    useEffect(() => {
      if (variant === 'embedded' && seedItem && !seededRef.current) {
        seededRef.current = true;
        resetToDraft([draftItemFromSearchItem(seedItem)]);
      }
    }, [variant, seedItem, resetToDraft]);
    ```
  - Render branch where `PlaylistSaveDialog` is today:
    ```tsx
    {canShowSaveDialog(state, detail) && (
      variant === 'embedded'
        ? <PlaylistSaveForm variant="inline" mode={state.phase === 'editing' ? 'edit' : 'create'}
            playlistId={state.playlistId} initialValues={saveDialogInitialValues(state.phase, detail)}
            pendingItemRefs={state.pendingItems.map(toSourceRef)}
            availableArtistImages={dedupeCoverArts(listItems)} onSaved={handleSaved} />
        : <PlaylistSaveDialog open onOpenChange={handleSaveDialogOpenChange} … />
    )}
    ```
  - After save in embedded mode, render the deep-link. Capture `const savedId = state.playlistId;` at the top of the render — a `const`, so its non-null narrowing survives into the `onClick` closure (the banned `!` is unnecessary):
    ```tsx
    const savedId = state.playlistId;
    // …in JSX:
    {
      variant === 'embedded' && savedId && (
        <Button type="button" variant="outline" onClick={() => onOpenInMyPlaylists?.(savedId)}>
          Open in My Playlists
        </Button>
      );
    }
    ```
- [ ] **Step 4 — run** creator spec (embedded + page) + typecheck: PASS.
- [ ] **Step 5 — commit** `feat(playlists): ✨ embedded creator variant`

---

### Task 4: Rewrite `MediaPlayer.DotNavMenu` onto a Radix Popover

The `DotNavMenu`/`DotNavMenuTrigger`/`DotNavMenuItem`/`SocialSharer`/`NavMenuItem` stubs have **no consumers** (verified) — replace them with a real, controllable Popover; delete the now-dead siblings.

**Files:**

- Modify: `src/app/components/ui/audio/media-player/media-player.tsx`
- Modify: `src/app/components/ui/audio/media-player/media-player.spec.tsx`

**Interfaces:**

- Produces: `MediaPlayer.DotNavMenu` with

```ts
interface DotNavMenuProps {
  children: ReactNode; // popover content
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string; // trigger aria-label, default 'Add to a playlist'
  align?: 'start' | 'center' | 'end'; // default 'end'
  className?: string; // trigger button classes (positioning)
}
```

- [ ] **Step 1 — failing test** (in `media-player.spec.tsx`): render `<MediaPlayer.DotNavMenu label="Add to a playlist"><div>panel body</div></MediaPlayer.DotNavMenu>`; assert a button `aria-label="Add to a playlist"` exists. `PopoverContent` is **portaled**, so open it with `userEvent` + `findBy` (not a sync `getByText`): `await user.click(screen.getByRole('button', { name: 'Add to a playlist' }))` then `expect(await screen.findByText('panel body')).toBeInTheDocument()`. Remove/replace the old `navMenuItems`-based assertions.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** replace the three `DotNav*` stubs + `SocialSharer` + `NavMenuItem` with a single Popover-backed `DotNavMenu` (EllipsisVertical ghost `Button` as `PopoverTrigger asChild`, `PopoverContent` renders `children`). Update the compound assignments (`MediaPlayer.DotNavMenu = DotNavMenu;`) and delete `MediaPlayer.DotNavMenuTrigger/DotNavMenuItem/SocialSharer` assignments + their JSDoc blocks. Fix any now-unused imports (`EllipsisVertical` stays).
- [ ] **Step 4 — run** the media-player spec + `pnpm run typecheck` (catches any dangling references): PASS.
- [ ] **Step 5 — commit** `refactor(player): ♻️ DotNav menu on Radix Popover`

---

### Task 5: `player-media-item.ts` — build a `PlaylistSearchItem` from player context

One shared builder so all four player wirings produce an identical item shape (the menu, panel, and embedded-creator seed all speak `PlaylistSearchItem`).

**Files:**

- Create: `src/app/components/playlists/player-media-item.ts`, `player-media-item.spec.ts`

**Interfaces:**

- Produces:

```ts
export const trackMediaItem = (args: {
  trackFileId: string; releaseId: string; title: string;
  artistName: string | null; coverArt: string | null; duration: number | null;
}): PlaylistSearchItem;                       // key `track:${trackFileId}`, source { trackFileId, releaseId }
export const videoMediaItem = (args: {
  videoId: string; title: string; artistName: string | null;
  coverArt: string | null; duration: number | null;
}): PlaylistSearchItem;                        // key `video:${videoId}`, source { videoId }
```

- [ ] **Step 1 — failing test:** `trackMediaItem` yields `{ key:'track:t1', itemType:'track', source:{ trackFileId:'t1', releaseId:'r1' }, … }`; `videoMediaItem` yields `{ key:'video:v1', itemType:'video', source:{ videoId:'v1' }, … }`.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** both arrow builders (MPL header).
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(playlists): ✨ player media-item builders`

---

### Task 6: `useAddToPlaylistFlow` — add a fixed item to a picked playlist

The panel's core: one fixed `item`, pick a playlist → add → toast / duplicate-confirm / error. Mirrors the proven `useAddToOtherPlaylist.runAdd` but without multi-row picker bookkeeping.

**Files:**

- Create: `src/app/components/playlists/use-add-to-playlist-flow.ts`, `use-add-to-playlist-flow.spec.ts`

**Interfaces:**

```ts
export const useAddToPlaylistFlow = (args: {
  item: PlaylistSearchItem;
  onAdded?: () => void;            // e.g. close the popover after success
}): {
  pickPlaylist: (playlist: PlaylistListRow) => void;
  duplicateItemTitle: string | null;
  confirmDuplicate: () => void;
  dismissDuplicate: () => void;
  isAdding: boolean;
};
```

- [ ] **Step 1 — failing tests** (mock `useAddPlaylistItemMutation`):
  1. `pickPlaylist(row)` calls `addPlaylistItemAsync(buildAddPlaylistItemInput(item, row.id, false))`; on `{ success:true }` → `toast.success('Added to <title>')` and `onAdded` fires.
  2. On `{ success:false, error:'DUPLICATE_ITEM' }` → `duplicateItemTitle === item.title` (dialog opens), no error toast; `confirmDuplicate()` re-calls with `force:true`.
  3. On any other `{ success:false, error }` → `toast.error(error)`.
  4. Picks ignored while `isAddingPlaylistItem` is true (no double-fire).
     (Mock `sonner`'s `toast` with `vi.mock`.)
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** by adapting `useAddToOtherPlaylist`'s `runAdd`: fixed `item`, `duplicateTarget: PlaylistListRow | null`, guard on `isAddingPlaylistItem`, call `buildAddPlaylistItemInput`. Success → `toast.success`, `onAdded?.()`, clear duplicate.
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(playlists): ✨ add-to-playlist flow hook`

---

### Task 7: `AddToPlaylistPanel` — the popover body

**Files:**

- Create: `src/app/components/playlists/add-to-playlist-panel.tsx`, `add-to-playlist-panel.spec.tsx`

**Interfaces:**

```ts
interface AddToPlaylistPanelProps {
  item: PlaylistSearchItem;
  onCreatePlaylist: () => void; // menu closes the popover then opens the create dialog
  onAdded?: () => void;
}
```

- [ ] **Step 1 — failing tests** (mock `usePlaylistsQuery` → two rows; mock `useAddToPlaylistFlow`):
  1. Renders `PlaylistPickerCombobox` rows; selecting a row calls `pickPlaylist(row)`. (Rows are cmdk `CommandItem`s selected via `onSelect`, not plain buttons — reuse the interaction idiom from the existing `playlist-picker-combobox.spec.tsx`; don't assume `getByRole('button')`.)
  2. Renders a "Create playlist" button; clicking it calls `onCreatePlaylist`.
  3. When `duplicateItemTitle` is non-null, `PlaylistDuplicateConfirmDialog` is open with that title.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** `const flow = useAddToPlaylistFlow({ item, onAdded });` render a small heading ("Add to a playlist"), `<PlaylistPickerCombobox onPick={flow.pickPlaylist} />`, a full-width `Button variant="outline"` with a `Plus`/`ListPlus` icon → `onCreatePlaylist`, and `<PlaylistDuplicateConfirmDialog open={flow.duplicateItemTitle !== null} onOpenChange={(o)=>!o && flow.dismissDuplicate()} itemTitle={flow.duplicateItemTitle ?? ''} onConfirm={flow.confirmDuplicate} />`. Width ~`w-72`.
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(playlists): ✨ add-to-playlist panel`

---

### Task 8: `CreatePlaylistDialog` — embedded creator in a dialog

**Files:**

- Create: `src/app/components/playlists/create-playlist-dialog.tsx`, `create-playlist-dialog.spec.tsx`

**Interfaces:**

```ts
interface CreatePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PlaylistSearchItem; // seeds the creator
}
```

- [ ] **Step 1 — failing tests** (mock `PlaylistCreator` to a stub that exposes its props; mock `next/navigation`'s `useRouter`):
  1. When `open`, renders a `role="dialog"` embedding `PlaylistCreator` with `variant="embedded"` and `seedItem === item`.
  2. Invoking the stub's `onOpenInMyPlaylists('p9')` calls `router.push('/playlists?edit=p9')` and `onOpenChange(false)`.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** `<Dialog open onOpenChange><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Create playlist</DialogTitle></DialogHeader><PlaylistCreator editPlaylistId={null} onEditHandled={()=>{}} variant="embedded" seedItem={item} onOpenInMyPlaylists={(id)=>{ onOpenChange(false); router.push(\`/playlists?edit=\${id}\`); }} /></DialogContent></Dialog>`.
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(playlists): ✨ create-playlist dialog`

---

### Task 9: `AddToPlaylistMenu` — session-gated kebab tying it together

**Files:**

- Create: `src/app/components/playlists/add-to-playlist-menu.tsx`, `add-to-playlist-menu.spec.tsx`

**Interfaces:**

```ts
interface AddToPlaylistMenuProps {
  item: PlaylistSearchItem;
  className?: string; // positioning for the trigger (e.g. absolute top-right)
}
```

- Lazy-load the heavy children behind the interaction:
  `const AddToPlaylistPanel = dynamic(() => import('./add-to-playlist-panel').then(m => m.AddToPlaylistPanel));`
  `const CreatePlaylistDialog = dynamic(() => import('./create-playlist-dialog').then(m => m.CreatePlaylistDialog));`
  (Behind a click/open — the App-Router "dynamic only SSRs the fallback" caveat does not apply; nothing here needs to be in server HTML.)

- [ ] **Step 1 — failing tests** (mock `useSession`):
  1. `status:'unauthenticated'` → renders nothing (`container` empty; no `aria-label` button).
  2. `status:'loading'` → renders nothing.
  3. `status:'authenticated'` → renders the kebab button (`aria-label="Add to a playlist"`).
  4. Invoking the panel's `onCreatePlaylist` ends with the **popover content unmounted** (its picker/`panel body` gone) **and** the create `role="dialog"` present. (The close-before-open _ordering_ that prevents a Radix focus-teardown race is asserted at the E2E layer via `toBeFocused` in Task 14 — a unit end-state check can't distinguish call order, so don't over-claim it here.)
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
  ```tsx
  const { status } = useSession();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  if (status !== 'authenticated') return null;
  const handleCreate = () => {
    setPopoverOpen(false);
    setDialogOpen(true);
  };
  return (
    <>
      <MediaPlayer.DotNavMenu
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        label="Add to a playlist"
        className={className}
      >
        <AddToPlaylistPanel
          item={item}
          onCreatePlaylist={handleCreate}
          onAdded={() => setPopoverOpen(false)}
        />
      </MediaPlayer.DotNavMenu>
      {dialogOpen && (
        <CreatePlaylistDialog open={dialogOpen} onOpenChange={setDialogOpen} item={item} />
      )}
    </>
  );
  ```
- [ ] **Step 4 — run** the menu spec + `pnpm dedupe --check` (guard the Radix duplicate-instance focus-theft lesson — Popover-opens-Dialog is exactly the at-risk pattern): PASS / clean.
- [ ] **Step 5 — commit** `feat(playlists): ✨ add-to-playlist menu`

---

### Task 10: Wire `ReleasePlayer`

**Files:** Modify `src/app/components/release-player.tsx` (+ spec).

- [ ] **Step 1 — failing test:** render `ReleasePlayer` with an authenticated session (mock `useSession`) + a release with one MP3 file; assert the `aria-label="Add to a playlist"` trigger renders inside the player frame.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** in `ReleasePlayerBody`, when `currentFile && primaryArtist`, build `const mediaItem = trackMediaItem({ trackFileId: currentFile.id, releaseId, title: getTrackDisplayTitle(currentFile.title, currentFile.fileName), artistName: getArtistDisplayName(primaryArtist), coverArt: coverArtSrc, duration: currentFile.duration ?? null });` and render `<AddToPlaylistMenu item={mediaItem} className="absolute right-1 top-1 z-10" />` inside the `relative` cover-art wrapper (`div.relative` around `InteractiveCoverArt`). Extract a helper if the branch pushes `complexity` over 10.
- [ ] **Step 4 — run** release-player spec + existing release-player specs: PASS.
- [ ] **Step 5 — commit** `feat(release): ✨ add-to-playlist on player`

---

### Task 11: Wire `ArtistPlayer`

**Files:** Modify `src/app/components/artist-player.tsx` (+ spec).

- Current track lives as the `currentFile` prop of the child **`ArtistPlayerStage`** (which also receives `selectedRelease` + `artistName`); the release id is **`selectedRelease.id`** — there is NO `selectedReleaseId` binding (top-level state is `selectedReleaseIndex`, and `selectedRelease = selectedArtistRelease?.release`). Render the menu inside `ArtistPlayerStage`, where `currentFile`/`selectedRelease` are already in scope.
- [ ] **Step 1 — failing test:** authenticated + an artist/release with a file → `aria-label="Add to a playlist"` trigger renders in the player.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** in `ArtistPlayerStage`, guarded by `currentFile && selectedRelease`, build `trackMediaItem({ trackFileId: currentFile.id, releaseId: selectedRelease.id, title: getTrackDisplayTitle(currentFile.title, currentFile.fileName), artistName, coverArt: <stage cover>, duration: currentFile.duration ?? null })` and render `<AddToPlaylistMenu … className="absolute right-1 top-1 z-10" />` in the cover-art `relative` wrapper. Extract a helper if the branch pushes complexity over 10.
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(artist): ✨ add-to-playlist on player`

---

### Task 12: Wire `FeaturedArtistsPlayer`

**Files:** Modify `src/app/components/featured-artists-player.tsx` (+ spec).

- The already-resolved `currentFile: FeaturedArtistFormatFile | null` is computed in the top-level player (from `selectedArtist.digitalFormat?.files` + `currentFileId` state) and passed down through `FeaturedArtistsPlayerBody` → **`FeaturedArtistDetails`**. Build from that resolved `currentFile` prop — do NOT re-resolve by `currentFileId` (that state isn't in scope at the render site). Release id is `selectedArtist.release.id`.
- [ ] **Step 1 — failing test:** authenticated + a featured artist with a current file → trigger renders.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** where `currentFile` is in scope (`FeaturedArtistDetails`), guarded by `currentFile && selectedArtist?.release`, build `trackMediaItem({ trackFileId: currentFile.id, releaseId: selectedArtist.release.id, title: getTrackDisplayTitle(currentFile.title, currentFile.fileName), artistName: getFeaturedArtistDisplayName(selectedArtist), coverArt: <cover>, duration: currentFile.duration ?? null })` and render the menu in the cover-art wrapper. Extract a helper to stay under the complexity cap.
- [ ] **Step 4 — run:** PASS.
- [ ] **Step 5 — commit** `feat(featured): ✨ add-to-playlist on player`

---

### Task 13: Wire `VideoCard`

**Files:** Modify `src/app/components/video-card.tsx` (+ spec).

- `video: VideoRow` has `{ id, title, artist, durationSeconds, posterUrl }`.
- [ ] **Step 1 — failing test:** authenticated → the card header shows the `aria-label="Add to a playlist"` trigger; unauthenticated → absent.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** build `const mediaItem = videoMediaItem({ videoId: video.id, title: video.title, artistName: video.artist, coverArt: video.posterUrl ?? null, duration: video.durationSeconds });` render `<AddToPlaylistMenu item={mediaItem} />` in the header row (right of the title/badge cluster — the existing `flex … justify-between` header). No stream/signing work — only `video.id` is needed.
- [ ] **Step 4 — run** video-card spec + existing videos-page specs: PASS.
- [ ] **Step 5 — commit** `feat(videos): ✨ add-to-playlist on video card`

---

### Task 14: E2E — add to a playlist from a player

**Files:** Create `e2e/tests/playlists/playlist-add-from-player.spec.ts`. Reuse existing playlist E2E fixtures/helpers (seeded signed-in user + a published release with an MP3 track, and a published video).

**Repo E2E lessons to honor:** portaled Radix surfaces → assert `await expect(popover).toBeFocused()` (or a focused input inside) as the duplicate-instance focus-theft net; codec-agnostic video assertions (`.or()`); no seed-count-pinning; string `getByText` is case-insensitive substring and `toHaveCount` counts hidden nodes — use roles/exact.

- [ ] **Step 1 — write the spec** (against the isolated Docker Mongo only), covering:
  1. **Signed-out:** open a release page → the `Add to a playlist` trigger is **not** present.
  2. **Signed-in add:** open the release → click `⋮` → popover opens (assert focus lands in the picker) → pick a playlist → **success toast** (assert via a scoped Sonner locator, e.g. `getByRole('status')` / the toast region — NOT a bare `getByText('Added to …')`, which risks the known Sonner `<li>` collision and the "Add"-substring clash with the "Add to a playlist" heading); reopen → pick the same playlist → **duplicate confirm dialog** appears; "Add again" closes it.
  3. **Create from player:** `⋮` → "Create playlist" → popover closes, **create dialog** opens with the track staged → fill title → Save → **"Open in My Playlists"** → URL is `/playlists?edit=<id>` and the creator shows that playlist in edit mode.
  4. **Video add:** on `/videos`, signed-in, `⋮` on a card → pick a playlist → success toast.
- [ ] **Step 2 — run** locally if Docker is available (`pnpm run e2e:docker:up` then the spec); otherwise static-verify and let CI be first execution (flag it in the PR body, per PR2 precedent). Also run the existing `e2e/tests/playlists/*` specs — the menu shares the release/video surfaces.
- [ ] **Step 3 — commit** `test(playlists): ✅ add-from-player e2e`

---

## Self-Review (run before dispatching Task 1)

- **Spec coverage:** menu on 3 audio players + video card ✅ (Tasks 10–13); popover panel with first-5 picker + plus-add + toast + duplicate-confirm ✅ (Tasks 6–7); "Create playlist" → close popover → embedded dialog → "Open in My Playlists" ✅ (Tasks 3, 8, 9); session-gated/hidden-when-signed-out ✅ (Task 9); no backend/schema ✅.
- **Type consistency:** the item flows as one `PlaylistSearchItem` from players (Task 5) → menu (9) → panel (7) → flow (6, via `buildAddPlaylistItemInput` Task 1) and → embedded creator seed (Task 3, via `draftItemFromSearchItem`). `DotNavMenu` controlled `open/onOpenChange` (Task 4) matches the menu's usage (Task 9).
- **No placeholders:** every task carries test + implementation code or an explicit "reuse verbatim from <file>" instruction.

## Verification (whole feature)

- Full gate green: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`; coverage ≥ baseline.
- `pnpm dedupe --check` / `pnpm why @radix-ui/react-focus-scope` clean (Popover-opens-Dialog focus-theft guard).
- E2E: new spec + existing `e2e/tests/playlists/*` against `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` only.
- Manual dev smoke: signed-in release → ⋮ → add → toast; add again → confirm; Create playlist → save → Open in My Playlists opens the editor; sign out → ⋮ gone; repeat from a video card.

## Execution Handoff

After this plan is committed: run **superpowers:subagent-driven-development** (fresh implementer + two-stage spec/quality review per task, fix waves, final whole-branch review on the most capable model) → **superpowers:finishing-a-development-branch** (push + PR). Model policy for this run: fable is usage-limited until 2026-07-20, so dispatch **all** subagents on **Opus 4.8**.
