# Zustand Player State — PR 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist volume/mute across every media player via a localStorage Zustand store, refactor the featured-artists player's 15-prop drilling chains onto an in-memory store, and delete the orphaned legacy audio player.

**Architecture:** A flat `usePlayerPrefs` store (volume, muted) persists to localStorage and binds imperatively to Video.js at its only two creation sites (`create-player-initializer.tsx` for both audio players, `video-player-surface.tsx` for video) — values are never rendered, so no hydration gating is needed, and the binding never touches the `persist` API (absent under SSR/storage-blocked clients). The featured player gets a NOT-persisted `useFeaturedPlayerStore` holding IDs and flags only; `FeaturedArtist` objects keep flowing as server props and are derived at render, so the hard boundary (no server state in stores) holds. Selection intentionally survives client-side navigation; playback flags and the imperative controls handle reset on unmount.

**Tech Stack:** zustand@^5 (already installed by PR 1, with `__mocks__/zustand.ts` auto-reset test infra), video.js 8, React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-18-zustand-client-state-design.md` sections "PR 2a", "PR 2b" (approved).

## Global Constraints

- **Worktree:** ALL paths relative to `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat-zustand-player-state` (branch `feat/zustand-player-state`, based on main `24615b26`). Verify with `git branch --show-current`. Never touch the main checkout.
- **Hard boundary:** stores hold only client-owned state (numbers, booleans, IDs, and the in-memory `MediaPlayerControls` handle). Never a `FeaturedArtist`/file object, never TanStack Query data.
- **PR 1 carry-forward lesson 1:** the durable localStorage store ships a `migrate` strategy (`version: 1` + a `migrate` that validates/clamps or falls back to defaults on unknown shapes).
- **PR 1 carry-forward lesson 2:** NEVER dereference `store.persist` — under SSR and storage-blocked clients zustand does not attach it. The binding helper uses only `getState()`/`setState()`, which always exist.
- **Lint:** full-scope `pnpm run lint` runs `--max-warnings 0` with `security/detect-object-injection` — no dynamic `obj[key]` access on non-literal keys in new code (both new stores are flat; keep it that way).
- **TDD:** failing test first, watch it fail, implement, green. Vitest globals (`describe`/`it`/`expect`/`vi`) — never import from 'vitest'. The `__mocks__/zustand.ts` infra auto-resets stores and clears storages between tests — write NO per-spec reset code.
- **Style:** arrow functions; named exports; no `any`, no `!`, no eslint-disable/@ts-ignore; MPL 3-line header (from `HEADER.txt`) on every new source file; explicit types on exported functions.
- **LCP guardrail:** the home page's server-rendered HTML must keep the player shell (guarded by `e2e/tests/home-player-ssr.spec.ts` asserting `aria-label="Play"` + the seeded artist `<img>` in the raw response body). The refactor must not change first-paint markup and must not write to any store during render.
- **Commits:** Conventional Commits + gitmoji, subject ≤48 visible chars before the emoji; exact messages given per task; never `--no-verify`; no AI attribution.
- **E2E:** local Docker Mongo only (`pnpm run e2e:docker:up`, `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`); never read `.env*`; `pnpm exec playwright test …` for flag-bearing runs.
- **Gates:** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` + `pnpm run test:coverage:check` (baseline in `COVERAGE_METRICS.md`).

---

### Task 1: Player prefs store + volume binding helper

**Files:**

- Create: `src/app/hooks/use-player-prefs.ts`
- Test: `src/app/hooks/use-player-prefs.spec.tsx`

**Interfaces:**

- Consumes: zustand (mocked in tests by PR 1 infra).
- Produces (Task 2 relies on these exact names):
  - `usePlayerPrefs` — store hook; state `{ volume: number; muted: boolean }` (defaults `1`, `false`), actions `setVolume(volume: number)` (clamped to 0..1), `setMuted(muted: boolean)`.
  - `bindPlayerVolumePersistence(player: Player): void` — `Player` is `video.js/dist/types/player`. On `player.ready` applies stored volume+muted; on `'volumechange'` writes the player's current values back. Uses ONLY `getState()`.
  - Persist key `'boudreaux-player-prefs'`, `version: 1`, localStorage, `partialize` to `{ volume, muted }`, `migrate` validating shape.

- [ ] **Step 1: Write the failing spec**

Create `src/app/hooks/use-player-prefs.spec.tsx` (`.tsx` so it runs in the happy-dom project, which provides `localStorage`; no JSX — same plan-mandated convention as PR 1's store specs):

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bindPlayerVolumePersistence, usePlayerPrefs } from './use-player-prefs';

import type Player from 'video.js/dist/types/player';

const STORAGE_KEY = 'boudreaux-player-prefs';

interface FakeVolumePlayer {
  ready: (callback: () => void) => void;
  on: (event: string, callback: () => void) => void;
  volume: (value?: number) => number | undefined;
  muted: (value?: boolean) => boolean | undefined;
  /** Test-only: fire a registered event's handlers. */
  trigger: (event: string) => void;
}

/** Minimal stateful Video.js volume surface: ready runs immediately, volume/muted
 *  are getter-setters, trigger fires registered handlers. */
const makeFakePlayer = (initial: { volume: number; muted: boolean }): FakeVolumePlayer => {
  const handlers = new Map<string, Array<() => void>>();
  let currentVolume = initial.volume;
  let currentMuted = initial.muted;
  return {
    ready: (callback) => callback(),
    on: (event, callback) => {
      const existing = handlers.get(event) ?? [];
      existing.push(callback);
      handlers.set(event, existing);
    },
    volume: (value?: number) => {
      if (value !== undefined) {
        currentVolume = value;
        return undefined;
      }
      return currentVolume;
    },
    muted: (value?: boolean) => {
      if (value !== undefined) {
        currentMuted = value;
        return undefined;
      }
      return currentMuted;
    },
    trigger: (event) => handlers.get(event)?.forEach((callback) => callback()),
  };
};

const asPlayer = (fake: FakeVolumePlayer): Player => fake as unknown as Player;

describe('usePlayerPrefs', () => {
  it('defaults to full volume, unmuted', () => {
    expect(usePlayerPrefs.getState().volume).toBe(1);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });

  it('clamps setVolume into the 0..1 range', () => {
    usePlayerPrefs.getState().setVolume(1.7);
    expect(usePlayerPrefs.getState().volume).toBe(1);
    usePlayerPrefs.getState().setVolume(-0.2);
    expect(usePlayerPrefs.getState().volume).toBe(0);
    usePlayerPrefs.getState().setVolume(0.42);
    expect(usePlayerPrefs.getState().volume).toBe(0.42);
  });

  it('persists volume and muted (and only those) to localStorage', () => {
    usePlayerPrefs.getState().setVolume(0.3);
    usePlayerPrefs.getState().setMuted(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as { state: Record<string, unknown>; version: number };
    expect(envelope.version).toBe(1);
    expect(envelope.state).toEqual({ volume: 0.3, muted: true });
  });

  it('migrate falls back to defaults for unknown persisted shapes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { volume: 'loud', muted: 'yes' }, version: 0 })
    );

    await usePlayerPrefs.persist?.rehydrate();

    expect(usePlayerPrefs.getState().volume).toBe(1);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });
});

describe('bindPlayerVolumePersistence', () => {
  it('applies stored volume and muted when the player is ready', () => {
    usePlayerPrefs.getState().setVolume(0.4);
    usePlayerPrefs.getState().setMuted(true);
    const fake = makeFakePlayer({ volume: 1, muted: false });

    bindPlayerVolumePersistence(asPlayer(fake));

    expect(fake.volume()).toBe(0.4);
    expect(fake.muted()).toBe(true);
  });

  it('writes the player values back to the store on volumechange', () => {
    const fake = makeFakePlayer({ volume: 1, muted: false });
    bindPlayerVolumePersistence(asPlayer(fake));

    fake.volume(0.65);
    fake.muted(true);
    fake.trigger('volumechange');

    expect(usePlayerPrefs.getState().volume).toBe(0.65);
    expect(usePlayerPrefs.getState().muted).toBe(true);
  });

  it('the apply-on-ready echo does not corrupt the stored values', () => {
    usePlayerPrefs.getState().setVolume(0.25);
    const fake = makeFakePlayer({ volume: 1, muted: false });

    bindPlayerVolumePersistence(asPlayer(fake));
    // Video.js fires volumechange for the programmatic apply too.
    fake.trigger('volumechange');

    expect(usePlayerPrefs.getState().volume).toBe(0.25);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });
});
```

The `migrate` test dereferences `persist` with `?.` — in the happy-dom test environment it always exists; the optional chain just mirrors the production rule of never assuming it.

- [ ] **Step 2: Run it — expect module-not-found failure**

Run: `pnpm run test:run -- src/app/hooks/use-player-prefs.spec.tsx`
Expected: FAIL — `Cannot find module './use-player-prefs'`.

- [ ] **Step 3: Implement the store + binding**

Create `src/app/hooks/use-player-prefs.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type Player from 'video.js/dist/types/player';

interface PlayerPrefsState {
  /** Playback volume, 0..1. */
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

const DEFAULT_PREFS = { volume: 1, muted: false };

const clampVolume = (volume: number): number => Math.min(1, Math.max(0, volume));

/**
 * Durable player preferences shared by every audio/video player, persisted to
 * localStorage so volume/mute survive browser restarts. Holds only client
 * preference values — playback state stays with each Video.js instance.
 * Nothing renders these values, so no hydration gating is needed; readers use
 * imperative `getState()` inside player callbacks.
 */
export const usePlayerPrefs = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setVolume: (volume) => set({ volume: clampVolume(volume) }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: 'boudreaux-player-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ volume: state.volume, muted: state.muted }),
      // Durable storage outlives deploys: validate anything not written by
      // this exact version and fall back to defaults rather than trusting it.
      migrate: (persistedState) => {
        const candidate = persistedState as Partial<PlayerPrefsState> | null | undefined;
        const volume =
          typeof candidate?.volume === 'number'
            ? clampVolume(candidate.volume)
            : DEFAULT_PREFS.volume;
        const muted = typeof candidate?.muted === 'boolean' ? candidate.muted : DEFAULT_PREFS.muted;
        return { volume, muted };
      },
    }
  )
);

/**
 * Wires a Video.js player to the shared preference store: applies the stored
 * volume/muted once the player is ready, and writes the player's values back
 * on every `volumechange` (slider drags, mute clicks, hotkeys).
 *
 * Uses only `getState()` — never the `persist` API, which zustand does not
 * attach under SSR or storage-blocked clients. iOS ignores programmatic
 * volume (hardware-controlled); the apply is a silent no-op there and the
 * muted preference still works.
 */
export const bindPlayerVolumePersistence = (player: Player): void => {
  player.ready(() => {
    const { volume, muted } = usePlayerPrefs.getState();
    player.volume(volume);
    player.muted(muted);
  });

  player.on('volumechange', () => {
    const volume = player.volume();
    const muted = player.muted();
    if (typeof volume === 'number') {
      usePlayerPrefs.getState().setVolume(volume);
    }
    if (typeof muted === 'boolean') {
      usePlayerPrefs.getState().setMuted(muted);
    }
  });
};
```

- [ ] **Step 4: Run the spec — expect green**

Run: `pnpm run test:run -- src/app/hooks/use-player-prefs.spec.tsx`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/app/hooks/use-player-prefs.ts src/app/hooks/use-player-prefs.spec.tsx
git commit -m 'feat(player): ✨ volume/mute prefs store'
```

---

### Task 2: Wire the binding at both Video.js creation sites

**Files:**

- Modify: `src/app/components/ui/audio/media-player/create-player-initializer.tsx` (~line 231, right after `playerRef.current = player;`)
- Modify: `src/app/components/ui/video/video-player-surface.tsx` (~line 66, right after the `videojs(videoEl, …)` call)
- Test: `src/app/components/ui/video/video-player-surface.spec.tsx` (extend)

**Interfaces:**

- Consumes: `bindPlayerVolumePersistence`, `usePlayerPrefs` from `@/hooks/use-player-prefs` (Task 1).
- Produces: every player in the app applies + records volume prefs. (These are the ONLY two `videojs(...)` creation sites — verified: the coverage-config mention of `playlist-player.tsx` is a stale entry for a deleted file.)

- [ ] **Step 1: Extend the video-surface spec with failing binding tests**

`video-player-surface.spec.tsx` mocks video.js with a `FakePlayer`. Extend the interface and factory (top of file) — add `volume`/`muted` getter-setters:

In the `FakePlayer` interface, add:

```tsx
volume: (value?: number) => number | undefined;
muted: (value?: boolean) => boolean | undefined;
```

In `makePlayer()`, add stateful fields and the two methods (before `trigger`):

```tsx
let currentVolume = 1;
let currentMuted = false;
```

(declare these `let`s at the top of `makePlayer`, alongside `handlers`), and in the returned object:

```tsx
      volume: vi.fn((value?: number) => {
        if (value !== undefined) {
          currentVolume = value;
          return undefined;
        }
        return currentVolume;
      }),
      muted: vi.fn((value?: boolean) => {
        if (value !== undefined) {
          currentMuted = value;
          return undefined;
        }
        return currentMuted;
      }),
```

Then add the import `import { usePlayerPrefs } from '@/hooks/use-player-prefs';` and two tests inside the existing `describe('VideoPlayerSurface', …)`:

```tsx
it('applies stored volume prefs when the player mounts', () => {
  usePlayerPrefs.getState().setVolume(0.35);
  usePlayerPrefs.getState().setMuted(true);

  render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);

  const [player] = getPlayers();
  expect(player.volume()).toBe(0.35);
  expect(player.muted()).toBe(true);
});

it('records user volume changes into the prefs store', () => {
  render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
  const [player] = getPlayers();

  player.volume(0.6);
  player.muted(true);
  act(() => player.trigger('volumechange'));

  expect(usePlayerPrefs.getState().volume).toBe(0.6);
  expect(usePlayerPrefs.getState().muted).toBe(true);
});
```

- [ ] **Step 2: Run it — expect exactly those two tests to fail**

Run: `pnpm run test:run -- src/app/components/ui/video/video-player-surface.spec.tsx`
Expected: FAIL — new tests only (`expect(player.volume()).toBe(0.35)` got 1; store still at defaults). All pre-existing tests pass (the fake's new methods are additive).

- [ ] **Step 3: Wire both creation sites**

`video-player-surface.tsx` — add the import and call:

```ts
import { bindPlayerVolumePersistence } from '@/hooks/use-player-prefs';
```

Immediately after the `const player = videojs(videoEl, { … });` statement:

```ts
bindPlayerVolumePersistence(player);
```

`create-player-initializer.tsx` — add the same import at the top (after the `audio-controls` import block), and immediately after `playerRef.current = player;` / `isInitializedRef.current = true;`:

```ts
bindPlayerVolumePersistence(player);
```

- [ ] **Step 4: Run the surface spec + typecheck — expect green**

Run: `pnpm run test:run -- src/app/components/ui/video/video-player-surface.spec.tsx && pnpm run typecheck`
Expected: PASS (all tests incl. the two new), typecheck clean. (The audio initializer lives under the coverage-excluded `media-player/**` E2E-covered zone — its binding is exercised by Task 1's helper spec and Task 6's E2E.)

- [ ] **Step 5: Run the neighboring media suites for fallout**

Run: `pnpm run test:run -- src/app/components/ui src/app/components/featured-artists-player.spec.tsx src/app/components/release-player.spec.tsx`
Expected: PASS — the binding is invisible to components that mock video.js without volume methods only if they never reach the binding; if any spec's video.js mock now throws on a missing `volume`/`ready` method, extend that mock with the same getter-setter shape shown in Step 1 (report which files needed it).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ui/audio/media-player/create-player-initializer.tsx src/app/components/ui/video/video-player-surface.tsx src/app/components/ui/video/video-player-surface.spec.tsx
git commit -m 'feat(player): ✨ persist volume across players'
```

(If Step 5 required extending other specs' video.js mocks, include those files in the same commit.)

---

### Task 3: Delete the orphaned legacy audio player

**Files:**

- Delete: `src/app/components/ui/audio-player.tsx`
- Delete: `src/app/components/ui/audio-player.spec.tsx`
- Modify: `vitest.config.ts` (remove the now-dead coverage-exclude line `'**/components/ui/audio-player.tsx',`)

**Interfaces:** none — the file is unreferenced (verified on this base: its own spec is the sole importer; the live implementation is `ui/audio/media-player/media-player-controls.tsx`).

- [ ] **Step 1: Re-verify orphan status on this branch**

Run: `grep -rn "audio-player'" src/ --include='*.ts' --include='*.tsx' | grep -v 'audio-player.spec'`
Expected: NO output (exit 1). If anything imports it, STOP and report BLOCKED.

- [ ] **Step 2: Delete both files + the stale coverage exclude**

```bash
git rm src/app/components/ui/audio-player.tsx src/app/components/ui/audio-player.spec.tsx
```

In `vitest.config.ts`, delete the single line `'**/components/ui/audio-player.tsx',` from the coverage `exclude` array (leave every other line, including the stale `playlist-player` line, untouched — out of scope).

- [ ] **Step 3: Full unit suite + typecheck**

Run: `pnpm run test:run && pnpm run typecheck`
Expected: PASS with the suite's file count reduced by one; no dangling references.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/components/ui vitest.config.ts
git commit -m 'chore(player): 🔧 drop orphaned audio player'
```

---

### Task 4: Featured-player store

**Files:**

- Create: `src/app/components/use-featured-player-store.ts`
- Test: `src/app/components/use-featured-player-store.spec.tsx`

**Interfaces:**

- Produces (Task 5 relies on these exact names):
  - `useFeaturedPlayerStore` — NOT persisted (in-memory; survives client-side navigation by design). State: `selectedArtistId: string | null`, `currentFileId: string | null`, `isPlaying: boolean`, `shouldAutoPlay: boolean`, `playerControls: MediaPlayerControls | null`.
  - Actions: `selectArtist(artistId: string | null, initialFileId: string | null, autoPlay: boolean)`, `selectFile(fileId: string, autoPlay: boolean)`, `setIsPlaying(isPlaying: boolean)`, `setPlayerControls(playerControls: MediaPlayerControls | null)`, `resetPlayback()` (clears isPlaying/shouldAutoPlay/playerControls, KEEPS selection).

- [ ] **Step 1: Write the failing spec**

Create `src/app/components/use-featured-player-store.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useFeaturedPlayerStore } from './use-featured-player-store';

describe('useFeaturedPlayerStore', () => {
  it('starts with no selection and idle playback', () => {
    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBeNull();
    expect(state.currentFileId).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.shouldAutoPlay).toBe(false);
    expect(state.playerControls).toBeNull();
  });

  it('selectArtist sets the selection trio atomically', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-9', true);

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-9');
    expect(state.shouldAutoPlay).toBe(true);
  });

  it('selectFile changes only the file and autoplay intent', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', false);
    useFeaturedPlayerStore.getState().selectFile('file-2', true);

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-2');
    expect(state.shouldAutoPlay).toBe(true);
  });

  it('resetPlayback clears playback state but keeps the selection', () => {
    const controls = { play: vi.fn(), pause: vi.fn(), toggle: vi.fn() };
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', true);
    useFeaturedPlayerStore.getState().setIsPlaying(true);
    useFeaturedPlayerStore.getState().setPlayerControls(controls);

    useFeaturedPlayerStore.getState().resetPlayback();

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-1');
    expect(state.isPlaying).toBe(false);
    expect(state.shouldAutoPlay).toBe(false);
    expect(state.playerControls).toBeNull();
  });

  it('never touches browser storage (in-memory only)', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', false);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found failure**

Run: `pnpm run test:run -- src/app/components/use-featured-player-store.spec.tsx`
Expected: FAIL — `Cannot find module './use-featured-player-store'`.

- [ ] **Step 3: Implement the store**

Create `src/app/components/use-featured-player-store.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';

import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';

interface FeaturedPlayerState {
  /** Selected featured-artist ID — null means "derive the first displayable".
   *  IDs only: the FeaturedArtist objects stay in server props (hard boundary). */
  selectedArtistId: string | null;
  /** Selected track file ID — null means "derive the featured/first track". */
  currentFileId: string | null;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  /** Imperative Video.js handle — non-serializable, in-memory only. */
  playerControls: MediaPlayerControls | null;
  selectArtist: (artistId: string | null, initialFileId: string | null, autoPlay: boolean) => void;
  selectFile: (fileId: string, autoPlay: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayerControls: (playerControls: MediaPlayerControls | null) => void;
  resetPlayback: () => void;
}

/**
 * Client state for the home page's featured-artists player. Deliberately NOT
 * persisted: the in-memory store already survives client-side navigation (so
 * returning to the home page restores the last selection), while playback
 * flags and the controls handle are reset on player unmount because Video.js
 * disposes with the component. Browser-write-only — SSR always renders the
 * initial state, so module-level state cannot leak across requests.
 */
export const useFeaturedPlayerStore = create<FeaturedPlayerState>()((set) => ({
  selectedArtistId: null,
  currentFileId: null,
  isPlaying: false,
  shouldAutoPlay: false,
  playerControls: null,
  selectArtist: (artistId, initialFileId, autoPlay) =>
    set({ selectedArtistId: artistId, currentFileId: initialFileId, shouldAutoPlay: autoPlay }),
  selectFile: (fileId, autoPlay) => set({ currentFileId: fileId, shouldAutoPlay: autoPlay }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlayerControls: (playerControls) => set({ playerControls }),
  resetPlayback: () => set({ isPlaying: false, shouldAutoPlay: false, playerControls: null }),
}));
```

- [ ] **Step 4: Run the spec — expect green**

Run: `pnpm run test:run -- src/app/components/use-featured-player-store.spec.tsx`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/use-featured-player-store.ts src/app/components/use-featured-player-store.spec.tsx
git commit -m 'feat(home): ✨ featured player store'
```

---

### Task 5: Refactor the featured-artists player onto the store

**Files:**

- Modify: `src/app/components/featured-artists-player.tsx` (the state layer + subcomponent signatures; JSX bodies stay byte-identical except where a prop read becomes a store/hook read)
- Modify: `src/app/components/featured-artists-player.spec.tsx` (the existing ~50-test suite is the behavioral contract — it must stay green; plus one NEW test)
- NOT modified: `release-share-widget.tsx`, everything under `ui/audio/media-player/`, `release-player.tsx`.

**Interfaces:**

- Consumes: `useFeaturedPlayerStore` (Task 4 exact names).
- Produces: no new exports. The component's rendered output for any given props+interactions is UNCHANGED (LCP guardrail); the only behavior change is selection surviving unmount/remount.

**The design (apply exactly):**

1. **Top-level `FeaturedArtistsPlayer`** keeps `displayableArtists` and gains a `useFeaturedPlayer(displayableArtists)` hook call (defined in this file, below the helpers) that owns ALL state consumption and derivation:

```ts
interface FeaturedPlayerViewModel {
  selectedArtist: FeaturedArtist | null;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  handleSelectArtist: (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
}

/**
 * Binds the featured player's store state to the server-provided artist list.
 * Selection is derived, not synced: a stored ID that left the list falls back
 * to the first displayable artist without writing to the store. Playback
 * flags and the imperative controls handle reset on unmount (Video.js
 * disposes with the component); the selection itself intentionally survives
 * so returning to the home page restores the last-selected artist.
 */
const useFeaturedPlayer = (displayableArtists: FeaturedArtist[]): FeaturedPlayerViewModel => {
  const selectedArtistId = useFeaturedPlayerStore((state) => state.selectedArtistId);
  const currentFileId = useFeaturedPlayerStore((state) => state.currentFileId);
  const isPlaying = useFeaturedPlayerStore((state) => state.isPlaying);
  const playerControls = useFeaturedPlayerStore((state) => state.playerControls);
  const selectArtist = useFeaturedPlayerStore((state) => state.selectArtist);
  const resetPlayback = useFeaturedPlayerStore((state) => state.resetPlayback);

  useEffect(() => resetPlayback, [resetPlayback]);

  const selectedArtist = useMemo<FeaturedArtist | null>(() => {
    if (displayableArtists.length === 0) return null;
    return (
      displayableArtists.find((artist) => artist.id === selectedArtistId) ?? displayableArtists[0]
    );
  }, [displayableArtists, selectedArtistId]);

  const sortedFiles = useMemo<FeaturedArtistFormatFile[]>(() => {
    const files = selectedArtist?.digitalFormat?.files;
    if (!files || files.length === 0) return [];
    return sortFilesByTrackNumber(files);
  }, [selectedArtist?.digitalFormat?.files]);

  const currentFile = useMemo<FeaturedArtistFormatFile | null>(() => {
    if (currentFileId) {
      const inList = sortedFiles.find((file) => file.id === currentFileId);
      if (inList) return inList;
    }
    if (selectedArtist?.featuredTrackNumber != null) {
      const featured = sortedFiles.find(
        (file) => file.trackNumber === selectedArtist.featuredTrackNumber
      );
      if (featured) return featured;
    }
    return sortedFiles[0] ?? null;
  }, [currentFileId, sortedFiles, selectedArtist?.featuredTrackNumber]);

  const audioSrc = useMemo<string | null>(
    () => (currentFile ? resolveStreamUrl(currentFile) : null),
    [currentFile]
  );

  const handleSelectArtist = useCallback(
    (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => {
      if (selectedArtist?.id === artist.id) {
        if (options?.autoPlay) {
          if (isPlaying) {
            playerControls?.pause();
          } else {
            playerControls?.play();
          }
        }
        return;
      }
      selectArtist(
        artist.id,
        resolveInitialFileId(artist.digitalFormat?.files ?? [], artist.featuredTrackNumber),
        options?.autoPlay ?? false
      );
    },
    [selectedArtist?.id, isPlaying, playerControls, selectArtist]
  );

  return { selectedArtist, sortedFiles, currentFile, audioSrc, handleSelectArtist };
};
```

Delete from the old component: all five `useState` calls, the availability-sync `useEffect` (derivation replaces it), `handlePlay`/`handlePause`/`handleTogglePlay`/`toggleCurrentArtistPlayback`/`handleFileSelect`/`handleTrackEnded`/`handlePreviousTrack`/`handleNextTrack` (they move into subcomponents/hooks below), and the old `sortedFiles`/`currentFile`/`audioSrc` memos (moved into the hook above — note the `currentFile` memo gains an in-list check so a stale `currentFileId` from a previous artist falls back correctly).

2. **`FeaturedArtistsPlayerBody`** props shrink to data only:

```ts
interface FeaturedArtistsPlayerBodyProps {
  displayableArtists: FeaturedArtist[];
  selectedArtist: FeaturedArtist | null;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
  showFileListDrawer: boolean;
  onSelectArtist: (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
}
```

(`onSelectArtist` stays a prop because `MediaPlayer.FeaturedArtistCarousel` — a `ui/` compound component whose API we do not change — takes `onSelect`.) The `ReleaseShareWidget` call site inside Body becomes:

```tsx
{
  selectedArtist?.release && (
    <ReleaseShareWidget
      featuredArtists={displayableArtists}
      selectedArtist={selectedArtist}
      setSelectedArtist={(artist) => {
        if (artist) onSelectArtist(artist);
      }}
    />
  );
}
```

(The widget's optional `setSelectedArtist?: (artist: FeaturedArtist | null) => void` contract is unchanged; it only ever calls it with a real artist.)

3. **`FeaturedArtistDetails`** reads playback state from the store and owns track-advance via a small hook (also defined in this file):

```ts
interface FeaturedArtistDetailsProps {
  selectedArtist: FeaturedArtist;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
}
```

Inside `FeaturedArtistDetails`, replace the deleted callback props with:

```ts
const isPlaying = useFeaturedPlayerStore((state) => state.isPlaying);
const shouldAutoPlay = useFeaturedPlayerStore((state) => state.shouldAutoPlay);
const playerControls = useFeaturedPlayerStore((state) => state.playerControls);
const setIsPlaying = useFeaturedPlayerStore((state) => state.setIsPlaying);
const setPlayerControls = useFeaturedPlayerStore((state) => state.setPlayerControls);
const { handleTrackEnded, handlePreviousTrack, handleNextTrack } = useTrackAdvance(
  sortedFiles,
  currentFile
);
```

and wire the JSX identically to today: `InteractiveCoverArt` gets `isPlaying` and `onTogglePlay={() => playerControls?.toggle()}`; `MediaPlayer.Controls` gets `onPlay={() => setIsPlaying(true)}`, `onPause={() => setIsPlaying(false)}`, `onEnded={handleTrackEnded}`, `onPreviousTrack={handlePreviousTrack}`, `onNextTrack={handleNextTrack}`, `autoPlay={shouldAutoPlay}`, `controlsRef={setPlayerControls}`; `InfoTickerTape` gets `isPlaying`.

The advance hook (same file):

```ts
/** Track-advance handlers built on the store's selectFile — auto-advance on
 *  ended, and previous/next preserving the was-playing intent. */
const useTrackAdvance = (
  sortedFiles: FeaturedArtistFormatFile[],
  currentFile: FeaturedArtistFormatFile | null
): {
  handleTrackEnded: () => void;
  handlePreviousTrack: (wasPlaying: boolean) => void;
  handleNextTrack: (wasPlaying: boolean) => void;
} => {
  const selectFile = useFeaturedPlayerStore((state) => state.selectFile);

  const advance = useCallback(
    (direction: 1 | -1, autoPlay: boolean) => {
      /* v8 ignore next -- defensive guard: handlers only fire while a track is loaded */
      if (!currentFile || sortedFiles.length === 0) return;
      const currentIndex = sortedFiles.findIndex((file) => file.id === currentFile.id);
      if (currentIndex === -1) return;
      const nextFile = sortedFiles[currentIndex + direction];
      if (nextFile) selectFile(nextFile.id, autoPlay);
    },
    [currentFile, sortedFiles, selectFile]
  );

  return {
    handleTrackEnded: useCallback(() => advance(1, true), [advance]),
    handlePreviousTrack: useCallback((wasPlaying: boolean) => advance(-1, wasPlaying), [advance]),
    handleNextTrack: useCallback((wasPlaying: boolean) => advance(1, wasPlaying), [advance]),
  };
};
```

4. **`FeaturedArtistTrackRowSlot` / `FeaturedArtistTrackRow`** drop `currentFileId`/`onFileSelect` props; `FeaturedArtistTrackRow` reads them itself:

```ts
const currentFileId = useFeaturedPlayerStore((state) => state.currentFileId);
const selectFile = useFeaturedPlayerStore((state) => state.selectFile);
```

with `FormatFileListDrawer` wired `currentFileId={currentFile?.id ?? null}` — NOTE: pass the DERIVED current file's id (from a new `currentFile` prop on the row, replacing the old `currentFileId` prop) so the drawer highlights the derived default track exactly as today, and `onFileSelect={(fileId) => selectFile(fileId, true)}` (matches the old `handleFileSelect` semantics: selecting a file always autoplays).

Slot/Row prop interfaces after the change:

```ts
interface FeaturedArtistTrackRowProps {
  selectedArtist: FeaturedArtist;
  release: FeaturedRelease;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
}
interface FeaturedArtistTrackRowSlotProps {
  show: boolean;
  selectedArtist: FeaturedArtist | null;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
}
```

5. `FeaturedAddToPlaylist` is untouched.

**Steps:**

- [ ] **Step 1: Add the ONE new behavioral test first**

In `featured-artists-player.spec.tsx`, add inside the top-level `describe('FeaturedArtistsPlayer', …)`, right after the existing `should change selected artist when clicking on carousel item` test (line ~503, whose arrangement this mirrors exactly):

```tsx
it('restores the selected artist across unmount and remount', () => {
  const { unmount } = render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
    wrapper: createWrapper(),
  });
  fireEvent.click(screen.getByTestId('artist-featured-2'));
  expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 2');

  unmount();
  render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
    wrapper: createWrapper(),
  });

  // Store-backed selection survives the remount; local useState would not.
  expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 2');
});
```

- [ ] **Step 2: Run it — expect exactly that test to fail**

Run: `pnpm run test:run -- src/app/components/featured-artists-player.spec.tsx`
Expected: FAIL — only the new test (remount resets to first artist under useState); all ~50 existing tests still pass.

- [ ] **Step 3: Apply the refactor**

Implement the design above in `featured-artists-player.tsx`. JSX bodies: byte-identical except the listed prop-wiring lines. Keep import order lint-clean (`pnpm run lint` auto-fixes).

- [ ] **Step 4: Run the full spec — the contract gate**

Run: `pnpm run test:run -- src/app/components/featured-artists-player.spec.tsx`
Expected: ALL tests green, including the new one. If an existing test fails, diagnose which side is wrong:

- If it asserts USER-VISIBLE behavior (rendered names, playing state after clicks, file advance) — YOUR refactor is wrong; fix the code, never the test.
- If it asserts implementation detail that legitimately changed (e.g. within-one-test double-render sequences that previously saw fresh useState), adapt it minimally and list EVERY adapted test with justification in your report. Expect near-zero of these — the suite drives the DOM.

- [ ] **Step 5: SSR/LCP guardrail check**

Run: `pnpm run test:run -- src/app/components && pnpm run typecheck`
Expected: green. Confirm no store `setState` occurs during render (search your diff: every store WRITE must be inside an event handler, `useEffect`, or `controlsRef` callback — none at component body top-level).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/featured-artists-player.tsx src/app/components/featured-artists-player.spec.tsx
git commit -m 'refactor(home): ♻️ store-backed featured player'
```

---

### Task 6: E2E — volume persistence + player regression sweep

**Files:**

- Create: `e2e/tests/player-volume-persistence.spec.ts`

**Interfaces:**

- Consumes: the `userPage` fixture from `e2e/fixtures/base.fixture` and the seeded `E2E Album One` release (same lookup pattern as `release-page.spec.ts`).

- [ ] **Step 1: Start the isolated E2E database**

Run: `pnpm run e2e:docker:up`
Expected: `boudreaux-e2e-mongo` healthy on localhost:27018. E2E never points anywhere else.

- [ ] **Step 2: Write the volume-persistence spec**

Create `e2e/tests/player-volume-persistence.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let e2eRelease1Id: string;

test.beforeAll(async () => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });
  e2eRelease1Id = release.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Volume/mute persist to localStorage (key `boudreaux-player-prefs`) and are
 * applied to every Video.js player on ready. Drive the media element directly
 * (deterministic — no slider drags) and assert the store round-trip.
 */
test.describe('Player volume persistence', () => {
  test('a volume change persists and re-applies after reload', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const audio = userPage.locator('.audio-player-wrapper audio');
    await expect(audio).toBeAttached();

    // Setting .volume on the media element fires volumechange, which Video.js
    // relays to the binding — the write path users hit via the volume slider.
    await audio.evaluate((element) => {
      (element as HTMLAudioElement).volume = 0.37;
    });

    await expect
      .poll(async () =>
        userPage.evaluate(() => {
          const raw = localStorage.getItem('boudreaux-player-prefs');
          if (!raw) return null;
          return (JSON.parse(raw) as { state: { volume: number } }).state.volume;
        })
      )
      .toBeCloseTo(0.37, 2);

    await userPage.reload();
    const audioAfterReload = userPage.locator('.audio-player-wrapper audio');
    await expect(audioAfterReload).toBeAttached();

    // The binding applies the stored volume on player ready.
    await expect
      .poll(async () =>
        audioAfterReload.evaluate((element) => (element as HTMLAudioElement).volume)
      )
      .toBeCloseTo(0.37, 2);
  });
});
```

- [ ] **Step 3: Run the new spec**

Run: `pnpm exec playwright test e2e/tests/player-volume-persistence.spec.ts`
Expected: PASS 1/1. If the audio element's relayed volumechange doesn't reach the binding (0 store writes), STOP and investigate the Video.js event relay before touching the assertions.

- [ ] **Step 4: Player-area regression sweep (incl. the LCP guardrail)**

Run:

```bash
pnpm exec playwright test e2e/tests/home-player-ssr.spec.ts e2e/tests/release-page.spec.ts e2e/tests/download-dialog.spec.ts e2e/tests/videos.spec.ts
```

Expected: all PASS — `home-player-ssr` green proves the refactored player still ships its shell in the SSR payload (the LCP guardrail).

Deliberate omission, documented: the spec's "selection restored on return" behavior is covered at the unit level (Task 5's remount test) and NOT by a new E2E — the E2E seed creates exactly ONE featured artist, the carousel renders only with ≥3, and changing the seed ripples into count-pinning specs per the repo's seed lesson. If the seed ever grows to 3+ featured artists, add the E2E then.

- [ ] **Step 5: Commit + teardown**

```bash
git add e2e/tests/player-volume-persistence.spec.ts
git commit -m 'test(e2e): ✅ player volume persistence spec'
pnpm run e2e:docker:down
```

---

### Task 7: Full gates + coverage + diff boundary

**Files:** none — verification only.

- [ ] **Step 1: Full gate**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
Expected: all exit 0. If `format` rewrites files: re-run `pnpm run test:run`, then commit only actually-changed files as `style: 🎨 prettier pass`.

- [ ] **Step 2: Coverage baseline**

Run: `pnpm run test:coverage:check`
Expected: PASS vs `COVERAGE_METRICS.md`. New files (`use-player-prefs.ts`, `use-featured-player-store.ts`) are fully spec'd; `featured-artists-player.tsx` keeps its existing coverage via the preserved suite. If a branch gap appears, add the missing branch test where the report points (likely candidates: `clampVolume` bounds or the `advance` guard) and commit as `test(player): ✅ cover prefs branch gap`.

- [ ] **Step 3: Diff boundary**

Run: `git log --oneline origin/main..HEAD && git diff origin/main --stat`
Expected: this plan's commits only; changes confined to `src/app/hooks/`, `src/app/components/`, `e2e/tests/`, `vitest.config.ts`, `docs/superpowers/`. No `package.json` changes (zustand already present).

Done — hand back for the whole-branch review + finishing-a-development-branch. Push/PR are NOT part of this plan.
