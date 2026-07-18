# Zustand for pure client state — design

Date: 2026-07-18
Status: approved (brainstormed with user; both PR sections approved)

## Problem

A codebase-wide audit found four places where pure client state has outgrown
component-local `useState`/Context, measured against the repo rule that an
external store is justified only by architectural complexity:

1. **Admin data-view filters are lost on every navigation.** Four admin data
   views (`release-data-view.tsx`, `artist-data-view.tsx`,
   `featured-artist-data-view.tsx`, `video-data-view.tsx`) each duplicate the
   same local filter state (search text, publish toggles, deleted/archived
   toggle, and for videos a sort direction). Navigating to an entity's edit
   page and back wipes it all.
2. **Chat drawer open state needs a root Context for one boolean.**
   `ChatOpenContext` exists solely to share `{ open, setOpen }` between the
   global launcher and docked panel triggers — a provider in `providers.tsx`
   plus a fallback path for provider-less trees, all to avoid a store.
3. **No player preference is remembered.** The two audio players and the video
   surface each hold independent Video.js volume/mute; nothing is shared or
   persisted. The cookies-policy page already tells users we remember volume
   settings — currently untrue.
4. **The featured-artists player prop-drills 15+ props through 3 levels**
   (`FeaturedArtistsPlayer` → `FeaturedArtistsPlayerBody` →
   `FeaturedArtistDetails`), including a parallel chain of nine callbacks.

Also found and folded in: `src/app/components/ui/audio-player.tsx` is dead
code — nothing imports it except its own spec (the live implementation is
`ui/audio/media-player/media-player-controls.tsx`).

## Hard boundary (non-negotiable)

Zustand never holds server state. TanStack Query remains the single source of
truth for data, mutations, refetching, cache sync/invalidation, and async
state. Stores hold only client-owned UI state: booleans, IDs, strings,
numbers, and (in-memory only) imperative handles. Where a store references a
server entity it stores the **ID only**; the entity object is derived from
query/prop data at render time.

## Design overview

Two PRs, split by risk domain. PR 2 branches after PR 1 merges (it needs the
dependency and test infrastructure).

- **PR 1 — foundation + chat drawer + admin filters** (`feat/zustand-client-state`):
  add `zustand@^5`, store test-isolation infra, replace `ChatOpenContext`
  with an API-identical store, and introduce a sessionStorage-persisted
  filter store for the four admin data views.
- **PR 2 — player prefs + featured player** (`feat/zustand-player-state`):
  localStorage-persisted volume/mute preferences applied at both Video.js
  creation sites, the featured-player store refactor, and deletion of the
  orphaned `ui/audio-player.tsx`.

## Foundation (lands with PR 1)

- **Dependency**: `zustand@^5` — MIT (MPL-compatible), ~1.2 kB core, React 19
  compatible. Only built-in middleware (`persist`, `createJSONStorage`); no
  immer, no devtools middleware.
- **Test isolation** (load-bearing): module-level stores would leak state
  between unit tests — the same pollution class as the artist-review lesson.
  Adopt Zustand's official Vitest pattern: `__mocks__/zustand.ts` (the root
  `__mocks__/` dir already exists for `next`) wraps `create`/`createStore`
  and collects per-store reset functions; `setupTests.ts` gains an
  `afterEach` that resets every store and clears `sessionStorage` and
  `localStorage`. Every store is factory-reset between tests with no
  per-spec ceremony.
- **Placement**: stores are colocated with their feature (as `use-chat-open`
  already is). No global `stores/` directory.
- **SSR rule**: stores are browser-write-only. Nothing calls `setState`
  during server render, so SSR always renders initial state and module-level
  store singletons cannot leak state across requests. Persisted stores use
  `skipHydration` wherever a persisted value is rendered (see PR 1); values
  that are only read imperatively inside effects (PR 2 volume) need no
  hydration gating.

## PR 1a — chat drawer store

Rewrite `src/app/components/chat/use-chat-open.tsx` as a Zustand store:

```ts
interface ChatOpenState {
  open: boolean;
  setOpen: (open: boolean) => void;
}
```

- The exported hook keeps its exact name and shape — `useChatOpen(): { open,
setOpen }` (via `useShallow` or equivalent so the pair is
  identity-stable) — so the consumers (`chat-launcher.tsx`,
  `chat-panel-trigger.tsx`) change zero lines.
- `ChatOpenProvider` is deleted, including its mount in `providers.tsx`, and
  the provider-less `FALLBACK` path disappears: without a provider concept,
  isolated test trees get the real store (default `open: false`), which the
  test-reset infra keeps deterministic.
- No persistence — restoring an open drawer on reload would be surprising.
- SSR-safe by construction (browser-write-only; server always renders
  closed).
- The chat drawer E2E suite has a flake history; run those specs locally
  under stress before pushing (see Testing).

## PR 1b — admin data-view filter store

New colocated store `src/app/admin/data-views/use-data-view-filters.ts` with
per-entity slices matching today's exact field names:

```ts
interface EntityFilters {
  search: string;
  showPublished: boolean; // default true
  showUnpublished: boolean; // default true
  showDeleted: boolean; // default false
}
interface VideoFilters {
  search: string;
  showPublished: boolean; // default true
  showUnpublished: boolean; // default true
  showArchived: boolean; // default false
  sort: 'asc' | 'desc'; // default 'desc'
}
interface DataViewFilterSlices {
  releases: EntityFilters;
  artists: EntityFilters;
  featuredArtists: EntityFilters;
  videos: VideoFilters;
}
type DataViewEntityKey = keyof DataViewFilterSlices;
interface DataViewFiltersState extends DataViewFilterSlices {
  setFilters: <K extends DataViewEntityKey>(
    entity: K,
    patch: Partial<DataViewFilterSlices[K]>
  ) => void;
  resetFilters: (entity: DataViewEntityKey) => void;
}
```

- **Persistence**: `persist` + `createJSONStorage(() => sessionStorage)`,
  key `boudreaux-admin-filters`, `version: 1`. Filters survive edit-and-back
  navigation and tab reloads; they reset when the tab closes. Actions are
  excluded from the persisted partial (persist state fields only).
- **Hydration**: synchronous storage would rehydrate during the first client
  render and mismatch SSR HTML (inputs render `''` server-side). So
  `skipHydration: true`, plus a small hook (`useDataViewFiltersHydration()`)
  that calls `persist.rehydrate()` once in an effect and returns a
  `hasHydrated` flag (set via `onRehydrateStorage`). Each data view passes
  `{ enabled: hasHydrated }` through the existing
  `InfiniteQueryOptionsOverride` trailing options — this simultaneously
  avoids the hydration mismatch and prevents a wasted default-filters fetch
  before persisted values load. Until hydration the views show their
  existing pending states (they already render loading UI while
  `isPending`). First visit with nothing persisted hydrates in a microtask;
  the gate is imperceptible.
- **Wiring**: the four data views swap `useState` for store selectors and
  build the same `filters` prop bag they pass today. `DataView`, the filters
  toolbar, `useDebounce` (still applied to the store-read search value), and
  all query hooks are untouched. The `published = showPublished ===
showUnpublished ? null : showPublished` derivation stays in the views.
- The reported-users table's lone `search` state is out of scope (different
  shape, single field, no demonstrated loss-pain); note as a possible
  follow-up.

## PR 2a — player volume/mute preference store

New store `src/app/hooks/use-player-prefs.ts` (shared by audio and video):

```ts
interface PlayerPrefsState {
  volume: number; // 0..1, default 1
  muted: boolean; // default false
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}
```

- **Persistence**: `persist` + `createJSONStorage(() => localStorage)`, key
  `boudreaux-player-prefs`, `version: 1` — a durable preference, per user
  decision. No `skipHydration` needed: values are never rendered, only read
  imperatively inside effects after mount, so there is no hydration surface.
- **Wiring**: one helper, `bindPlayerVolumePersistence(player)`, colocated
  with the player code. On `ready` it applies the stored `volume`/`muted` to
  the Video.js instance; on `volumechange` it writes the instance's current
  values back via `usePlayerPrefs.setState` (imperative `getState`/
  `setState` — the call sites are not React components). Two call sites
  cover every player in the app:
  - `ui/audio/media-player/create-player-initializer.tsx` — shared by both
    audio players (`FeaturedArtistsPlayer` and `ReleasePlayer` both render
    `MediaPlayer.Controls`).
  - `ui/video/video-player-surface.tsx` — the lazily-mounted video surface.
- **Platform caveat**: iOS ignores programmatic volume (hardware-controlled);
  applying it is a silent no-op there and `muted` still persists. No
  gating — Video.js absorbs the no-op.
- No throttling of `volumechange` writes initially (tiny object, no React
  subscribers rendering it); revisit only if profiling says otherwise, per
  the repo's no-premature-optimization rule.
- **Rider**: delete the orphaned `src/app/components/ui/audio-player.tsx`
  and `audio-player.spec.tsx` (verified: the spec is its only importer).

## PR 2b — featured-player store

New colocated store `src/app/components/use-featured-player-store.ts`:

```ts
interface FeaturedPlayerState {
  selectedArtistId: string | null; // ID only — never the FeaturedArtist object
  currentFileId: string | null;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  playerControls: MediaPlayerControls | null; // imperative handle, in-memory only
  // primitive setters for the above
}
```

- **Not persisted to storage** (the controls handle is non-serializable, and
  re-materializing server-derived selections from storage risks staleness).
  In-memory only.
- Orchestration (initial-file resolution, auto-advance, previous/next,
  reselect-toggles-playback, availability fallback) moves into a
  `useFeaturedPlayer(displayableArtists)` hook composing the store with the
  existing derivations. `selectedArtist` is derived as "the artist with
  `selectedArtistId`, else the first displayable" — server objects continue
  to arrive via props from the server component and are never stored.
- `FeaturedArtistsPlayerBody`, `FeaturedArtistDetails`,
  `FeaturedArtistTrackRowSlot` read the store/hook directly, deleting the
  15-prop and 9-callback drilling chains. Store actions are
  identity-stable, replacing the `useCallback` choreography that currently
  protects the memoized carousel.
- `ReleaseShareWidget`'s `setSelectedArtist` prop becomes an ID-based
  selection through the same store/hook.
- **Intentional behavior change**: the in-memory store survives client-side
  navigation, so returning to the home page restores the last-selected
  artist (falling back to the first if it left the list). `isPlaying`,
  `shouldAutoPlay`, and `playerControls` reset on unmount — Video.js
  disposes with the component, so stale playback state must not survive.
- **Guardrail**: this is the LCP-tuned home page. The refactor must not
  change first-paint markup, render order, or the `(min-width: 1024px)`
  cover preload contract. `ReleasePlayer` is deliberately not refactored
  (two levels, manageable) but still gains volume persistence via the
  shared initializer.

## Deliberately not migrated

- **Sidebar state** — its cookie exists so the server can render the correct
  collapsed state without a flash; sessionStorage would regress that.
- **iOS install-prompt dismissal cookie** — same mechanism, working, tiny.
- **Playlist-creator hooks** — entangled with server sync
  (`useCreatorServerItems`); refactoring risks blurring the TanStack Query
  boundary this design protects.
- **Video playback coordinator** (`video-playback-coordinator.ts`) — a
  working 20-line module singleton with tests; converting it buys
  observability nobody needs yet.
- **ImagePreviewContext, BioEditorRegistryContext, UI-library contexts**
  (sidebar/carousel/toggle-group/chart/form) — correctly scoped Context.
- **Form/wizard local state** (email step, checkout step, video form) —
  correctly component-local.

## Testing

TDD throughout (store specs first, then wiring specs). Unit:

- Store specs: defaults, actions, persistence partialize/version, and for
  the filter store the `hasHydrated` flag lifecycle.
- Rewired-component specs updated in place; the zustand mock auto-reset
  keeps them isolated. Global `afterEach` also clears both storages.
- Specs asserting the old Context fallback / provider behavior are rewritten
  against the store (no orphaned tests).

E2E (local, isolated Docker Mongo, before push):

- **New**: admin filter persistence — set search + toggles on a data view,
  navigate to an entity edit page, navigate back, assert filters retained;
  reload the tab, assert retained; assert the filtered query actually
  refires with persisted values (list content matches filter).
- **Regression sweep per repo lessons**: chat drawer suite under stress
  (`--workers=8 --repeat-each=6 --retries=0` via `pnpm exec playwright
test`), the admin data-view suites (grep first for specs assuming filters
  reset between navigations), home player specs, and the download-dialog
  neighbors that historically catch collateral worker poisoning.
- PR 2: home player behavior (selection restored on return), volume
  persistence smoke (set volume, navigate, assert applied on next player
  mount — codec-agnostic assertions per the media lesson).

Gates: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run
format`, coverage baseline held (`test:coverage:check`), all 9 CI checks.

## Risks

- **Store leakage between unit tests** — mitigated by the mock auto-reset
  infra; this is why it ships first, inside PR 1.
- **Admin queries gated on `enabled: hasHydrated`** — if the flag wiring is
  wrong, admin lists never load. Covered by unit specs on the hydration hook
  and the E2E persistence spec (which fails loudly if the list never
  renders).
- **Chat drawer E2E flake history** — the swap is API-identical, but the
  suite is stress-run locally regardless.
- **Home page LCP** — the featured-player refactor is structural; first-paint
  markup must be diffed (server HTML before/after) and home E2E must pass.
- **sessionStorage unavailable** (private-mode edge cases) —
  `createJSONStorage` degrades to unpersisted in-memory behavior; the app
  works identically to today.

## Ops

None. No schema changes, no env changes, no new services. One new npm
dependency (`zustand`).
