# Zustand Client State — PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zustand with airtight test isolation, replace `ChatOpenContext` with an API-identical store, and give the four admin data views a sessionStorage-persisted filter store so filters survive edit-and-back navigation.

**Architecture:** Stores are colocated with their feature and hold only client-owned UI state (booleans, IDs, strings) — TanStack Query stays the sole owner of server state. The filter store persists via `persist` + `createJSONStorage(() => sessionStorage)` with `skipHydration: true`; a `useDataViewFiltersHydration()` hook rehydrates in an effect and gates each infinite query's `enabled` so there is no SSR hydration mismatch and no wasted default-filters fetch. A `__mocks__/zustand.ts` auto-reset keeps module-level stores from leaking state between unit tests.

**Tech Stack:** zustand@^5 (new dep), React 19, Next.js 16 App Router, TanStack Query 5, Vitest 4 (happy-dom/jsdom projects, globals), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-18-zustand-client-state-design.md` (approved).

## Global Constraints

- **Worktree:** ALL file paths are relative to `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat-zustand-client-state` (branch `feat/zustand-client-state`). Verify with `git branch --show-current` before starting. Never touch the main checkout.
- **TDD:** write the failing test first, watch it fail, then implement. Every task below is sequenced that way.
- **Vitest:** `describe`/`it`/`expect`/`vi`/`afterEach` are globals — NEVER import them from `vitest`. Spec files are `.spec.ts(x)` adjacent to source. `.spec.tsx` → happy-dom project; `.spec.ts` → node project.
- **Style:** arrow functions only (`const f = () => …`); named exports only; no `any`, no `!` non-null assertion, no `eslint-disable`, no `@ts-ignore`. Explicit types on exported function params/returns. `interface` for object shapes.
- **Every new source file** starts with the MPL header (3 lines, exact text from `HEADER.txt`):
  ```
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  ```
- **Commits:** Conventional Commits with gitmoji, subject ≤48 visible chars BEFORE the emoji is counted (`feat: ✨`, `refactor: ♻️`, `test: ✅`, `chore: 🔧`). Never `--no-verify`. Exact messages are given per task.
- **Hard boundary:** stores never hold TanStack Query data or server objects. This PR's stores hold only booleans/strings.
- **E2E:** only against the local Docker Mongo (`pnpm run e2e:docker:up`, `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`). Never read `.env*`. Use `pnpm exec playwright test …` for flag-bearing runs (`pnpm run test:e2e -- …` swallows flags).
- **Gates before finishing:** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` all green, plus `pnpm run test:coverage:check` (baseline in `COVERAGE_METRICS.md` must not regress).

---

### Task 1: Zustand dependency + test-isolation infrastructure

**Files:**

- Modify: `package.json` / `pnpm-lock.yaml` (via `pnpm add zustand`)
- Create: `__mocks__/zustand.ts`
- Modify: `setupTests.ts` (add `vi.mock('zustand')` + storage clearing in the existing `afterEach`)
- Test: `src/test-utils/zustand-isolation.spec.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `zustand` importable everywhere; every store made with `create`/`createStore` auto-resets to its initial state after each unit test; `sessionStorage`/`localStorage` cleared after each DOM-env test. Later tasks rely on this implicitly — they write NO per-spec reset code.

- [ ] **Step 1: Write the failing isolation spec**

Create `src/test-utils/zustand-isolation.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { create } from 'zustand';

interface CounterState {
  count: number;
  increment: () => void;
}

// Module-level store — the exact shape production stores use. The
// __mocks__/zustand.ts auto-reset must restore it between tests; without
// that, whichever of the two store tests runs second fails.
const useCounter = create<CounterState>()((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

describe('zustand test isolation', () => {
  it('starts from initial state and mutates freely', () => {
    expect(useCounter.getState().count).toBe(0);
    useCounter.getState().increment();
    expect(useCounter.getState().count).toBe(1);
  });

  it('is reset to initial state between tests', () => {
    expect(useCounter.getState().count).toBe(0);
    useCounter.getState().increment();
    expect(useCounter.getState().count).toBe(1);
  });

  it('clears sessionStorage between tests (first probe)', () => {
    expect(sessionStorage.getItem('isolation-probe')).toBeNull();
    sessionStorage.setItem('isolation-probe', 'leak');
    expect(sessionStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears sessionStorage between tests (second probe)', () => {
    expect(sessionStorage.getItem('isolation-probe')).toBeNull();
    sessionStorage.setItem('isolation-probe', 'leak');
    expect(sessionStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears localStorage between tests (first probe)', () => {
    expect(localStorage.getItem('isolation-probe')).toBeNull();
    localStorage.setItem('isolation-probe', 'leak');
    expect(localStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears localStorage between tests (second probe)', () => {
    expect(localStorage.getItem('isolation-probe')).toBeNull();
    localStorage.setItem('isolation-probe', 'leak');
    expect(localStorage.getItem('isolation-probe')).toBe('leak');
  });
});
```

Each pair is order-independent under test shuffling: both members mutate and both assert a pristine start, so whichever runs second proves the reset.

- [ ] **Step 2: Run it — expect module-not-found failure**

Run: `pnpm run test:run -- src/test-utils/zustand-isolation.spec.tsx`
Expected: FAIL — `Cannot find module 'zustand'` (dep not installed yet).

- [ ] **Step 3: Install zustand**

Run: `pnpm add zustand`
Expected: `package.json` gains `"zustand": "^5.x.y"` under `dependencies`. Confirm with `node -e "console.log(require('./package.json').dependencies.zustand)"`.

- [ ] **Step 4: Run again — expect isolation failures**

Run: `pnpm run test:run -- src/test-utils/zustand-isolation.spec.tsx`
Expected: FAIL — one of each pair fails (`expected 1 to be 0` for the store pair, `expected 'leak' to be null` for the storage pairs). This is the genuine red proving the infra is needed.

- [ ] **Step 5: Create the zustand auto-reset mock**

Create `__mocks__/zustand.ts` (`vi` and `afterEach` are vitest globals — do NOT import them):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act } from 'react';

import type * as ZustandExportedTypes from 'zustand';

export * from 'zustand';

const { create: actualCreate, createStore: actualCreateStore } =
  await vi.importActual<typeof ZustandExportedTypes>('zustand');

/** Reset functions for every store created during the current test file. */
export const storeResetFns = new Set<() => void>();

const createUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreate(stateCreator);
  const initialState = store.getInitialState();
  storeResetFns.add(() => {
    store.setState(initialState, true);
  });
  return store;
};

// Support both create(fn) and the curried create()(fn) form.
export const create = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) =>
  typeof stateCreator === 'function'
    ? createUncurried(stateCreator)
    : createUncurried) as typeof ZustandExportedTypes.create;

const createStoreUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreateStore(stateCreator);
  const initialState = store.getInitialState();
  storeResetFns.add(() => {
    store.setState(initialState, true);
  });
  return store;
};

export const createStore = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) =>
  typeof stateCreator === 'function'
    ? createStoreUncurried(stateCreator)
    : createStoreUncurried) as typeof ZustandExportedTypes.createStore;

// Restore every store to its initial state after each test. act() flushes
// any React subscribers so components don't warn about un-acted updates.
afterEach(() => {
  act(() => {
    storeResetFns.forEach((resetFn) => resetFn());
  });
});
```

- [ ] **Step 6: Wire the mock + storage clearing into setupTests.ts**

In `setupTests.ts`, directly after the `vi.mock('server-only', () => ({}));` line (line 12), add:

```ts
// Auto-mock zustand via __mocks__/zustand.ts: every store created in a test
// file registers a reset fn and the mock's own afterEach restores initial
// state between tests, so module-level stores cannot leak state across tests.
vi.mock('zustand');
```

In the existing global `afterEach` at the bottom of the file, after `cleanupFn();`, add:

```ts
// Persisted zustand stores (and any direct storage writes) must not leak
// between tests. node-env specs have no window, hence the guard.
if (typeof window !== 'undefined') {
  window.sessionStorage.clear();
  window.localStorage.clear();
}
```

- [ ] **Step 7: Run the isolation spec — expect green**

Run: `pnpm run test:run -- src/test-utils/zustand-isolation.spec.tsx`
Expected: PASS, 6/6.

- [ ] **Step 8: Run the full unit suite to prove no fallout**

Run: `pnpm run test:run`
Expected: PASS — same totals as baseline plus 6 new tests. `vi.mock('zustand')` in setup must not break files that never import zustand.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml __mocks__/zustand.ts setupTests.ts src/test-utils/zustand-isolation.spec.tsx
git commit -m 'chore(deps): 🔧 zustand + store test isolation'
```

---

### Task 2: Chat drawer store (replace ChatOpenContext)

**Files:**

- Modify + rename: `src/app/components/chat/use-chat-open.tsx` → `src/app/components/chat/use-chat-open.ts` (no JSX remains)
- Modify: `src/app/components/chat/use-chat-open.spec.tsx` (rewrite)
- Modify: `src/app/components/providers.tsx` (drop provider)
- Modify: `src/app/components/chat/chat-launcher.spec.tsx` (drop wrapper)
- Modify: `src/app/components/chat/chat-panel-trigger.spec.tsx` (drop wrapper)
- NOT modified: `chat-launcher.tsx`, `chat-panel-trigger.tsx` (the hook API is identical)

**Interfaces:**

- Consumes: `create` from Task 1's mocked zustand (transparently).
- Produces: `useChatOpen` — the store hook itself. Calling `useChatOpen()` in a component returns `{ open: boolean; setOpen: (open: boolean) => void }` exactly as before; `useChatOpen.getState()` / `useChatOpen.setState()` are available to tests. `ChatOpenProvider` NO LONGER EXISTS.

- [ ] **Step 1: Rewrite the spec to describe store behavior**

Replace the entire contents of `src/app/components/chat/use-chat-open.spec.tsx` with:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChatOpen } from './use-chat-open';

const Probe = () => {
  const { open, setOpen } = useChatOpen();
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {open ? 'open' : 'closed'}
    </button>
  );
};

describe('useChatOpen', () => {
  it('starts closed and toggles through the shared setter', async () => {
    const user = userEvent.setup();
    render(<Probe />);

    expect(screen.getByRole('button')).toHaveTextContent('closed');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('open');
  });

  it('shares one state across sibling consumers with no provider', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Probe />
        <Probe />
      </>
    );

    const [first, second] = screen.getAllByRole('button');
    await user.click(first);
    expect(second).toHaveTextContent('open');
  });

  it('resets to closed between tests via the store-reset infra', () => {
    expect(useChatOpen.getState().open).toBe(false);
    useChatOpen.getState().setOpen(true);
    expect(useChatOpen.getState().open).toBe(true);
  });
});
```

(The first and third tests form an order-independent reset-proof pair, same pattern as Task 1.)

- [ ] **Step 2: Run it — expect failures against the Context implementation**

Run: `pnpm run test:run -- src/app/components/chat/use-chat-open.spec.tsx`
Expected: FAIL — test 1 stays `closed` after click (provider-less fallback is inert) and test 3 throws (`useChatOpen.getState is not a function`).

- [ ] **Step 3: Implement the store**

Delete `src/app/components/chat/use-chat-open.tsx` and create `src/app/components/chat/use-chat-open.ts` (extensionless imports in consumers keep working):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';

interface ChatOpenState {
  /** Whether the chat drawer is open. */
  open: boolean;
  /** Open/close the chat drawer. */
  setOpen: (open: boolean) => void;
}

/**
 * Shares the chat drawer's open state between the globally-mounted
 * {@link ChatLauncher} (which owns the drawer) and any docked triggers
 * rendered inside page content (e.g. the ZinePanel chat dock).
 *
 * Zustand store — no provider required. Calling `useChatOpen()` returns
 * `{ open, setOpen }` exactly as the previous Context hook did, and
 * `setOpen` is identity-stable across renders. Browser-write-only: nothing
 * calls `setOpen` during SSR, so the server always renders the drawer
 * closed and module-level state cannot leak across requests.
 */
export const useChatOpen = create<ChatOpenState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
```

Use `git mv src/app/components/chat/use-chat-open.tsx src/app/components/chat/use-chat-open.ts` first, then replace the contents, so git records a rename.

- [ ] **Step 4: Run the spec — expect green**

Run: `pnpm run test:run -- src/app/components/chat/use-chat-open.spec.tsx`
Expected: PASS, 3/3.

- [ ] **Step 5: Remove the provider from providers.tsx**

In `src/app/components/providers.tsx`:

1. Delete the import line: `import { ChatOpenProvider } from './chat/use-chat-open';`
2. Replace the return block:

```tsx
// better-auth's `useSession` reads from its own nanostore and needs no
// React context provider, so the legacy `SessionProvider` wrapper is gone.
// The chat drawer's open state lives in the `useChatOpen` zustand store,
// so it needs no provider either.
return (
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  </QueryClientProvider>
);
```

- [ ] **Step 6: Drop the wrapper from the two consumer specs**

`src/app/components/chat/chat-launcher.spec.tsx`:

1. Delete line 10: `import { ChatOpenProvider } from './use-chat-open';`
2. Replace ALL 7 occurrences of `render(<ChatLauncher />, { wrapper: ChatOpenProvider })` with `render(<ChatLauncher />)` (5 plain calls + 2 `const { rerender } = render(...)` destructures — only the wrapper argument is removed).

`src/app/components/chat/chat-panel-trigger.spec.tsx`:

1. Change line 8 from `import { ChatOpenProvider, useChatOpen } from './use-chat-open';` to `import { useChatOpen } from './use-chat-open';`
2. Replace the `renderDocked` helper with:

```tsx
const renderDocked = () =>
  render(
    <>
      <ChatPanelTrigger />
      <OpenProbe />
    </>
  );
```

- [ ] **Step 7: Run the chat + providers spec set**

Run: `pnpm run test:run -- src/app/components/chat src/app/components/providers.spec.tsx`
Expected: PASS — all chat specs green (launcher's cross-test drawer state is handled by the Task 1 reset infra), providers spec green.

- [ ] **Step 8: Typecheck to catch any stale ChatOpenProvider reference**

Run: `pnpm run typecheck`
Expected: PASS. If it fails with `ChatOpenProvider` not exported, a reference was missed — `grep -rn 'ChatOpenProvider' src/` must return nothing.

- [ ] **Step 9: Commit**

```bash
git add src/app/components/chat/use-chat-open.ts src/app/components/chat/use-chat-open.spec.tsx src/app/components/providers.tsx src/app/components/chat/chat-launcher.spec.tsx src/app/components/chat/chat-panel-trigger.spec.tsx
git commit -m 'refactor(chat): ♻️ zustand chat-open store'
```

(If git flags the deleted `.tsx` separately, `git add -A src/app/components/chat` covers the rename pair.)

---

### Task 3: Admin data-view filter store

**Files:**

- Create: `src/app/admin/data-views/use-data-view-filters.ts`
- Test: `src/app/admin/data-views/use-data-view-filters.spec.tsx`

**Interfaces:**

- Consumes: mocked zustand (Task 1).
- Produces (Tasks 4–7 rely on these exact names):
  - `useDataViewFilters` — store hook. Slices: `releases` / `artists` / `featuredArtists`: `EntityFilters` = `{ search: string; showPublished: boolean; showUnpublished: boolean; showDeleted: boolean }`; `videos`: `VideoFilters` = `{ search: string; showPublished: boolean; showUnpublished: boolean; showArchived: boolean; sort: 'asc' | 'desc' }`.
  - Actions: `setFilters(entity, patch)` (typed per-slice partial), `resetFilters(entity)`.
  - Persist key `'boudreaux-admin-filters'`, `version: 1`, sessionStorage, `skipHydration: true`.
  - Exported types: `EntityFilters`, `VideoFilters`, `DataViewEntityKey`.

- [ ] **Step 1: Write the failing store spec**

Create `src/app/admin/data-views/use-data-view-filters.spec.tsx` (`.tsx` so it runs in the happy-dom project, which provides `sessionStorage`; the file needs no JSX):

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useDataViewFilters } from './use-data-view-filters';

const STORAGE_KEY = 'boudreaux-admin-filters';

const DEFAULT_ENTITY = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showDeleted: false,
};

describe('useDataViewFilters', () => {
  it('exposes default filters for every slice', () => {
    const state = useDataViewFilters.getState();
    expect(state.releases).toEqual(DEFAULT_ENTITY);
    expect(state.artists).toEqual(DEFAULT_ENTITY);
    expect(state.featuredArtists).toEqual(DEFAULT_ENTITY);
    expect(state.videos).toEqual({
      search: '',
      showPublished: true,
      showUnpublished: true,
      showArchived: false,
      sort: 'desc',
    });
  });

  it('patches a single slice without touching the others', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'alpha', showDeleted: true });

    const state = useDataViewFilters.getState();
    expect(state.releases).toEqual({ ...DEFAULT_ENTITY, search: 'alpha', showDeleted: true });
    expect(state.artists).toEqual(DEFAULT_ENTITY);
    expect(state.videos.sort).toBe('desc');
  });

  it('patches the videos slice including sort', () => {
    useDataViewFilters.getState().setFilters('videos', { sort: 'asc', showArchived: true });

    expect(useDataViewFilters.getState().videos.sort).toBe('asc');
    expect(useDataViewFilters.getState().videos.showArchived).toBe(true);
  });

  it('resets one slice to defaults, leaving other slices alone', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'alpha' });
    useDataViewFilters.getState().setFilters('artists', { search: 'beta' });

    useDataViewFilters.getState().resetFilters('releases');

    expect(useDataViewFilters.getState().releases).toEqual(DEFAULT_ENTITY);
    expect(useDataViewFilters.getState().artists.search).toBe('beta');
  });

  it('persists slices (and only slices) to sessionStorage on change', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'persisted' });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(envelope.version).toBe(1);
    expect(envelope.state.releases).toEqual({ ...DEFAULT_ENTITY, search: 'persisted' });
    // partialize: actions never reach storage
    expect(envelope.state).not.toHaveProperty('setFilters');
    expect(envelope.state).not.toHaveProperty('resetFilters');
  });

  it('skips hydration until rehydrate() is called, then applies stored values', async () => {
    // skipHydration means creating/using the store never reads storage on its own.
    expect(useDataViewFilters.persist.hasHydrated()).toBe(false);

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          releases: {
            search: 'from-storage',
            showPublished: false,
            showUnpublished: true,
            showDeleted: true,
          },
        },
        version: 1,
      })
    );

    await useDataViewFilters.persist.rehydrate();

    expect(useDataViewFilters.persist.hasHydrated()).toBe(true);
    expect(useDataViewFilters.getState().releases.search).toBe('from-storage');
    expect(useDataViewFilters.getState().releases.showDeleted).toBe(true);
    // Slices absent from storage keep their defaults (shallow merge).
    expect(useDataViewFilters.getState().videos.sort).toBe('desc');
  });
});
```

Note: exactly ONE test calls `rehydrate()`, and no other test asserts `hasHydrated() === false`, so the suite stays green under within-file test shuffling (persist's hydrated flag survives the store-state reset).

- [ ] **Step 2: Run it — expect module-not-found failure**

Run: `pnpm run test:run -- src/app/admin/data-views/use-data-view-filters.spec.tsx`
Expected: FAIL — `Cannot find module './use-data-view-filters'`.

- [ ] **Step 3: Implement the store**

Create `src/app/admin/data-views/use-data-view-filters.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Filter state shared by the release/artist/featured-artist data views. */
export interface EntityFilters {
  search: string;
  showPublished: boolean;
  showUnpublished: boolean;
  showDeleted: boolean;
}

/** Filter state for the videos data view (archive lifecycle + sort). */
export interface VideoFilters {
  search: string;
  showPublished: boolean;
  showUnpublished: boolean;
  showArchived: boolean;
  sort: 'asc' | 'desc';
}

interface DataViewFilterSlices {
  releases: EntityFilters;
  artists: EntityFilters;
  featuredArtists: EntityFilters;
  videos: VideoFilters;
}

export type DataViewEntityKey = keyof DataViewFilterSlices;

interface DataViewFiltersState extends DataViewFilterSlices {
  setFilters: <K extends DataViewEntityKey>(
    entity: K,
    patch: Partial<DataViewFilterSlices[K]>
  ) => void;
  resetFilters: (entity: DataViewEntityKey) => void;
}

const DEFAULT_ENTITY_FILTERS: EntityFilters = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showDeleted: false,
};

const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showArchived: false,
  sort: 'desc',
};

const DEFAULT_SLICES: DataViewFilterSlices = {
  releases: DEFAULT_ENTITY_FILTERS,
  artists: DEFAULT_ENTITY_FILTERS,
  featuredArtists: DEFAULT_ENTITY_FILTERS,
  videos: DEFAULT_VIDEO_FILTERS,
};

/**
 * Admin data-view filters, persisted to sessionStorage so search/toggles/sort
 * survive edit-and-back navigation and tab reloads but reset when the tab
 * closes. Holds only client-owned UI state — the filtered DATA stays in
 * TanStack Query. `skipHydration` avoids an SSR hydration mismatch; views
 * gate their queries on {@link useDataViewFiltersHydration} instead.
 */
export const useDataViewFilters = create<DataViewFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULT_SLICES,
      setFilters: (entity, patch) =>
        set(
          (state) => ({ [entity]: { ...state[entity], ...patch } }) as Partial<DataViewFiltersState>
        ),
      resetFilters: (entity) =>
        set({ [entity]: DEFAULT_SLICES[entity] } as Partial<DataViewFiltersState>),
    }),
    {
      name: 'boudreaux-admin-filters',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        releases: state.releases,
        artists: state.artists,
        featuredArtists: state.featuredArtists,
        videos: state.videos,
      }),
      skipHydration: true,
    }
  )
);

/**
 * Rehydrates the filter store from sessionStorage after mount and reports
 * completion. Views pass the returned flag as the query's `enabled` option:
 * the first client render matches SSR (defaults, no storage read), and the
 * first fetch waits for persisted filters instead of firing twice.
 *
 * @returns `true` once persisted filters (if any) have been applied.
 */
export const useDataViewFiltersHydration = (): boolean => {
  const [hydrated, setHydrated] = useState(useDataViewFilters.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useDataViewFilters.persist.onFinishHydration(() => setHydrated(true));
    void useDataViewFilters.persist.rehydrate();
    return unsubscribe;
  }, []);

  return hydrated;
};
```

The two `as Partial<DataViewFiltersState>` casts are required because TypeScript widens computed-key object literals to an index signature; the generic constraint on `setFilters` keeps call sites fully type-safe.

- [ ] **Step 4: Run the spec — expect green**

Run: `pnpm run test:run -- src/app/admin/data-views/use-data-view-filters.spec.tsx`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/data-views/use-data-view-filters.ts src/app/admin/data-views/use-data-view-filters.spec.tsx
git commit -m 'feat(admin): ✨ data-view filter store'
```

---

### Task 4: Hydration hook spec

**Files:**

- Test: `src/app/admin/data-views/use-data-view-filters-hydration.spec.tsx`
- (Implementation already landed in Task 3's file — this task locks its behavior with rendered-hook tests.)

**Interfaces:**

- Consumes: `useDataViewFilters`, `useDataViewFiltersHydration` from Task 3.
- Produces: nothing new — confidence that Tasks 5–7 can gate `enabled` on the hook.

- [ ] **Step 1: Write the hook spec**

Create `src/app/admin/data-views/use-data-view-filters-hydration.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook, waitFor } from '@testing-library/react';

import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

const STORAGE_KEY = 'boudreaux-admin-filters';

describe('useDataViewFiltersHydration', () => {
  it('flips to true once rehydration completes', async () => {
    const { result } = renderHook(() => useDataViewFiltersHydration());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('applies persisted sessionStorage values during hydration', async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          videos: {
            search: 'stored-video',
            showPublished: true,
            showUnpublished: false,
            showArchived: true,
            sort: 'asc',
          },
        },
        version: 1,
      })
    );

    renderHook(() => useDataViewFiltersHydration());

    await waitFor(() => {
      expect(useDataViewFilters.getState().videos.search).toBe('stored-video');
    });
    expect(useDataViewFilters.getState().videos.sort).toBe('asc');
    // Slices absent from storage keep their defaults.
    expect(useDataViewFilters.getState().releases.search).toBe('');
  });
});
```

Both tests only assert the post-hydration state (via `waitFor`), so they are order-independent even though persist's `hasHydrated` flag stays true after the file's first rehydrate.

- [ ] **Step 2: Run it — expect green (implementation exists)**

Run: `pnpm run test:run -- src/app/admin/data-views/use-data-view-filters-hydration.spec.tsx`
Expected: PASS, 2/2. If either test fails, fix `useDataViewFiltersHydration` — do NOT weaken the test.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/data-views/use-data-view-filters-hydration.spec.tsx
git commit -m 'test(admin): ✅ filter hydration gate spec'
```

---

### Task 5: Wire the release data view to the store

**Files:**

- Modify: `src/app/admin/data-views/release-data-view.tsx`
- Modify: `src/app/admin/data-views/release-data-view.spec.tsx`

**Interfaces:**

- Consumes: `useDataViewFilters`, `useDataViewFiltersHydration` (Task 3); `useInfiniteReleasesQuery(filters, options)` — the hook already takes a trailing `InfiniteQueryOptionsOverride` (`src/app/hooks/use-infinite-releases-query.ts:84`).
- Produces: the pattern Tasks 6–7 copy.

- [ ] **Step 1: Add the failing persistence test to the existing spec**

In `src/app/admin/data-views/release-data-view.spec.tsx`, add inside the top-level `describe('ReleaseDataView', …)` block:

```tsx
it('restores filter state across unmount and remount', async () => {
  vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

  const { unmount } = render(<ReleaseDataView />, { wrapper: createWrapper() });
  await userEvent.click(screen.getByRole('switch', { name: /show deleted/i }));
  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();

  unmount();
  render(<ReleaseDataView />, { wrapper: createWrapper() });

  // Store-backed filters survive the remount; local useState would not.
  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();
});
```

- [ ] **Step 2: Run the spec — expect exactly that test to fail**

Run: `pnpm run test:run -- src/app/admin/data-views/release-data-view.spec.tsx`
Expected: FAIL — the new test's final `toBeChecked()` fails (state was component-local); all pre-existing tests still pass.

- [ ] **Step 3: Swap useState for the store in the component**

In `src/app/admin/data-views/release-data-view.tsx`:

1. Change the react import (useState no longer needed): `import { useMemo } from 'react';`
2. Add to the local imports (after the `DataView` import line):

```ts
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';
```

3. Replace the four `useState` lines and the `debouncedSearch` line (lines 48–52) with:

```ts
const { search, showPublished, showUnpublished, showDeleted } = useDataViewFilters(
  (state) => state.releases
);
const setFilters = useDataViewFilters((state) => state.setFilters);
const hydrated = useDataViewFiltersHydration();
const debouncedSearch = useDebounce(search);
```

4. Add the `enabled` gate to the query call:

```ts
  } = useInfiniteReleasesQuery(
    { search: debouncedSearch, published, deleted: showDeleted },
    { enabled: hydrated }
  );
```

5. Replace the `filters` prop bag:

```tsx
      filters={{
        search,
        onSearchChange: (value) => setFilters('releases', { search: value }),
        showPublished,
        onShowPublishedChange: (value) => setFilters('releases', { showPublished: value }),
        showUnpublished,
        onShowUnpublishedChange: (value) => setFilters('releases', { showUnpublished: value }),
        showDeleted,
        onShowDeletedChange: (value) => setFilters('releases', { showDeleted: value }),
      }}
```

- [ ] **Step 4: Fix the two-argument query assertion in the existing spec**

The query hook is now called with two arguments, and `toHaveBeenLastCalledWith` matches the full argument list. In the existing test `'passes a published filter to the query when the publish toggles differ'`, replace the assertion with:

```tsx
expect(useInfiniteReleasesQuery).toHaveBeenLastCalledWith(
  expect.objectContaining({ published: true }),
  expect.objectContaining({ enabled: true })
);
```

(`enabled` is `true` by then: the hydration effect ran when the component mounted, before the awaited click resolves.)

- [ ] **Step 5: Run the spec — expect green**

Run: `pnpm run test:run -- src/app/admin/data-views/release-data-view.spec.tsx`
Expected: PASS — all tests including the new persistence test.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/data-views/release-data-view.tsx src/app/admin/data-views/release-data-view.spec.tsx
git commit -m 'feat(admin): ✨ persist release view filters'
```

---

### Task 6: Wire the artist + featured-artist data views

**Files:**

- Modify: `src/app/admin/data-views/artist-data-view.tsx`
- Modify: `src/app/admin/data-views/artist-data-view.spec.tsx`
- Modify: `src/app/admin/data-views/featured-artist-data-view.tsx`
- Modify: `src/app/admin/data-views/featured-artist-data-view.spec.tsx`

**Interfaces:**

- Consumes: same as Task 5; `useInfiniteArtistsQuery(filters, options)` (`use-infinite-artists-query.ts:79`) and `useInfiniteFeaturedArtistsQuery(filters, options)` (`use-infinite-featured-artists-query.ts:83`) both take the trailing options param.
- Produces: nothing new.

- [ ] **Step 1: Add the failing persistence test to BOTH specs**

The two specs arrange differently (verified): the artist spec renders BARE (`render(<ArtistDataView />)`, no wrapper — see its existing tests at lines 120–174); the featured spec uses `createWrapper()` + `toInfiniteResult(mockRows)` helpers (lines 67–134).

In `artist-data-view.spec.tsx`, add inside the top-level describe, using that spec's existing query-mock arrangement for a loaded list (copy the `vi.mocked(useInfiniteArtistsQuery).mockReturnValue(...)` line its neighboring render tests use):

```tsx
it('restores filter state across unmount and remount', async () => {
  const { unmount } = render(<ArtistDataView />);
  await userEvent.click(screen.getByRole('switch', { name: /show deleted/i }));
  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();

  unmount();
  render(<ArtistDataView />);

  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();
});
```

In `featured-artist-data-view.spec.tsx`, add inside the top-level describe:

```tsx
it('restores filter state across unmount and remount', async () => {
  vi.mocked(useInfiniteFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

  const { unmount } = render(<FeaturedArtistDataView />, { wrapper: createWrapper() });
  await userEvent.click(screen.getByRole('switch', { name: /show deleted/i }));
  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();

  unmount();
  render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

  expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();
});
```

- [ ] **Step 2: Run both specs — expect exactly the new tests to fail**

Run: `pnpm run test:run -- src/app/admin/data-views/artist-data-view.spec.tsx src/app/admin/data-views/featured-artist-data-view.spec.tsx`
Expected: FAIL — only the two new persistence tests.

- [ ] **Step 3: Swap useState for the store in both components**

Apply the identical mechanical change as Task 5 Step 3 to each file, with the slice key changed:

`artist-data-view.tsx` — remove `useState` from the react import; add the store import; replace lines 35–39 with:

```ts
const { search, showPublished, showUnpublished, showDeleted } = useDataViewFilters(
  (state) => state.artists
);
const setFilters = useDataViewFilters((state) => state.setFilters);
const hydrated = useDataViewFiltersHydration();
const debouncedSearch = useDebounce(search);
```

Query call gains `{ enabled: hydrated }` as the second argument; the `filters` prop bag becomes the Task 5 Step 3.5 shape with every `setFilters('releases', …)` replaced by `setFilters('artists', …)`.

`featured-artist-data-view.tsx` — same change, slice key `'featuredArtists'`, replacing lines 42–46 and the query call/filters bag accordingly:

```ts
const { search, showPublished, showUnpublished, showDeleted } = useDataViewFilters(
  (state) => state.featuredArtists
);
const setFilters = useDataViewFilters((state) => state.setFilters);
const hydrated = useDataViewFiltersHydration();
const debouncedSearch = useDebounce(search);
```

- [ ] **Step 4: Fix any full-argument-list assertions in both specs**

Run `grep -n 'toHaveBeenLastCalledWith\|toHaveBeenCalledWith' src/app/admin/data-views/artist-data-view.spec.tsx src/app/admin/data-views/featured-artist-data-view.spec.tsx` and append `expect.objectContaining({ enabled: true })` as a second matcher argument to every assertion that targets `useInfiniteArtistsQuery` / `useInfiniteFeaturedArtistsQuery`, exactly as in Task 5 Step 4.

- [ ] **Step 5: Run both specs — expect green**

Run: `pnpm run test:run -- src/app/admin/data-views/artist-data-view.spec.tsx src/app/admin/data-views/featured-artist-data-view.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/data-views/artist-data-view.tsx src/app/admin/data-views/artist-data-view.spec.tsx src/app/admin/data-views/featured-artist-data-view.tsx src/app/admin/data-views/featured-artist-data-view.spec.tsx
git commit -m 'feat(admin): ✨ persist artist+featured filters'
```

---

### Task 7: Wire the video data view (5 fields incl. sort)

**Files:**

- Modify: `src/app/admin/data-views/video-data-view.tsx`
- Modify: `src/app/admin/data-views/video-data-view.spec.tsx`

**Interfaces:**

- Consumes: Task 3 exports; `useInfiniteVideosQuery(filters, options)` (`use-infinite-videos-query.ts:78`).
- Produces: nothing new.

- [ ] **Step 1: Add the failing persistence test (sort + archived)**

The video spec renders BARE and already mocks the query at module/beforeEach scope with `toInfiniteResult` (verified: `vi.mocked(useInfiniteVideosQuery).mockReturnValue(toInfiniteResult([mockRow]) as never)` at line 84, bare `render(<VideoDataView />)` throughout, and sort clicks via `getByRole('radio', { name: /oldest first/i })` at lines 140/150). Add inside the top-level describe:

```tsx
it('restores sort and archived filters across unmount and remount', async () => {
  const { unmount } = render(<VideoDataView />);
  await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));
  await userEvent.click(screen.getByRole('switch', { name: /show archived/i }));

  unmount();
  render(<VideoDataView />);

  expect(screen.getByRole('radio', { name: /oldest first/i })).toBeChecked();
  expect(screen.getByRole('switch', { name: /show archived/i })).toBeChecked();
});
```

(Radix `ToggleGroup type="single"` items expose `role="radio"` with `aria-checked`, which `toBeChecked()` reads.)

- [ ] **Step 2: Run the spec — expect exactly that test to fail**

Run: `pnpm run test:run -- src/app/admin/data-views/video-data-view.spec.tsx`
Expected: FAIL — only the new test.

- [ ] **Step 3: Swap useState for the store**

In `video-data-view.tsx`:

1. Remove `useState` from the react import: `import { useCallback, useMemo } from 'react';`
2. Add the store import after the `VideoAdminCard` import block:

```ts
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';
```

3. Replace the five `useState` lines and the debounce line (lines 114–119) with:

```ts
const { search, showPublished, showUnpublished, showArchived, sort } = useDataViewFilters(
  (state) => state.videos
);
const setFilters = useDataViewFilters((state) => state.setFilters);
const hydrated = useDataViewFiltersHydration();
const debouncedSearch = useDebounce(search);
```

4. Gate the query:

```ts
const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useInfiniteVideosQuery(
    { search: debouncedSearch, published, archived: showArchived, sort },
    { enabled: hydrated }
  );
```

5. Replace `handleSortChange`:

```ts
const handleSortChange = (value: string): void => {
  if (value === 'asc' || value === 'desc') setFilters('videos', { sort: value });
};
```

6. Update the four inline JSX handlers:
   - search input: `onChange={(event) => setFilters('videos', { search: event.target.value })}`
   - published switch: `onCheckedChange={(value) => setFilters('videos', { showPublished: value })}`
   - unpublished switch: `onCheckedChange={(value) => setFilters('videos', { showUnpublished: value })}`
   - archived switch: `onCheckedChange={(value) => setFilters('videos', { showArchived: value })}`

- [ ] **Step 4: Fix any full-argument-list assertions**

Same sweep as Task 6 Step 4 against `video-data-view.spec.tsx` for `useInfiniteVideosQuery` assertions — append `expect.objectContaining({ enabled: true })`.

- [ ] **Step 5: Run the spec, then the whole data-views + hooks area**

Run: `pnpm run test:run -- src/app/admin/data-views`
Expected: PASS — all data-view specs green.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/data-views/video-data-view.tsx src/app/admin/data-views/video-data-view.spec.tsx
git commit -m 'feat(admin): ✨ persist video view filters'
```

---

### Task 8: E2E — filter persistence + regression sweep

**Files:**

- Create: `e2e/tests/admin-filter-persistence.spec.ts`
- No production code changes expected. (Pre-verified: the only existing specs that fill a data-view search — `admin-releases-list.spec.ts:25`, `admin-digital-formats.spec.ts:16` — never navigate back to the same list within a test, so persistence cannot break them.)

**Interfaces:**

- Consumes: the `adminPage` fixture from `e2e/fixtures/auth.fixture` (same import style as `admin-releases-list.spec.ts`); the shipped filter store behavior.

- [ ] **Step 1: Start the isolated E2E database**

Run: `pnpm run e2e:docker:up`
Expected: `boudreaux-e2e-mongo` container healthy on localhost:27018. Never point E2E anywhere else.

- [ ] **Step 2: Write the persistence spec**

Create `e2e/tests/admin-filter-persistence.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * The admin data-view filter store persists search/toggles/sort to
 * sessionStorage (key `boudreaux-admin-filters`), so filters survive
 * edit-and-back navigation and tab reloads within a browser session.
 */
test.describe('Admin data-view filter persistence', () => {
  test('release filters survive navigating away and back, and a reload', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByPlaceholder(/search releases/i).fill('Alpha');
    await adminPage.getByRole('switch', { name: /show deleted/i }).click();

    await adminPage.goto('/admin');
    await adminPage.goto('/admin/releases');
    await expect(adminPage.getByPlaceholder(/search releases/i)).toHaveValue('Alpha');
    await expect(adminPage.getByRole('switch', { name: /show deleted/i })).toBeChecked();

    await adminPage.reload();
    await expect(adminPage.getByPlaceholder(/search releases/i)).toHaveValue('Alpha');
    await expect(adminPage.getByRole('switch', { name: /show deleted/i })).toBeChecked();
  });

  test('video sort selection survives navigation', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');
    await adminPage.getByRole('radio', { name: 'Oldest first' }).click();

    await adminPage.goto('/admin');
    await adminPage.goto('/admin/videos');
    await expect(adminPage.getByRole('radio', { name: 'Oldest first' })).toBeChecked();
  });
});
```

- [ ] **Step 3: Run the new spec**

Run: `pnpm exec playwright test e2e/tests/admin-filter-persistence.spec.ts`
Expected: PASS 2/2. (If the store were broken, `toHaveValue('Alpha')` after re-navigation fails — this is the loud end-to-end proof the `enabled` gate wiring loads data with persisted filters.)

- [ ] **Step 4: Run the touched-area regression specs locally**

Per repo lessons, run every spec that covers components this PR touched:

```bash
pnpm exec playwright test e2e/tests/admin-releases-list.spec.ts e2e/tests/admin-artists-list.spec.ts e2e/tests/admin-featured-artists-list.spec.ts e2e/tests/admin-videos-list.spec.ts e2e/tests/admin-digital-formats.spec.ts e2e/tests/admin-entity-delete.spec.ts e2e/tests/admin-dashboard.spec.ts e2e/tests/download-dialog.spec.ts
```

Expected: all PASS.

- [ ] **Step 5: Stress the chat drawer suite (flake-sensitive area we replumbed)**

```bash
pnpm exec playwright test e2e/tests/chat-drawer.spec.ts e2e/tests/chat-drawer-touch.spec.ts --workers=8 --repeat-each=6 --retries=0
```

Expected: all PASS. Any failure here is a real regression in the open-state swap — do not shrug it off as ambient flake; diagnose against `main` first (`git stash` the change → rerun → compare).

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/admin-filter-persistence.spec.ts
git commit -m 'test(e2e): ✅ admin filter persistence spec'
```

- [ ] **Step 7: Tear down the E2E database**

Run: `pnpm run e2e:docker:down`

---

### Task 9: Full gates + coverage baseline

**Files:** none new — verification only.

- [ ] **Step 1: Run the full gate**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
Expected: all four exit 0. `pnpm run format` may rewrite files — if it does, re-run `pnpm run test:run`, then `git add -A && git commit -m 'style: 🎨 prettier pass'` (only if anything changed).

- [ ] **Step 2: Coverage regression check**

Run: `pnpm run test:coverage:check`
Expected: PASS — the new store/hook files are fully spec'd; the baseline in `COVERAGE_METRICS.md` must not regress. If branches dip, add the missing branch tests (the likely gap: `handleSortChange`'s guard rejecting a non-sort value — cover it in `video-data-view.spec.tsx` by asserting an unknown value leaves sort unchanged, if not already covered).

- [ ] **Step 3: Sanity-check the diff boundary**

Run: `git log --oneline origin/main..HEAD` and `git diff origin/main --stat`
Expected: the spec + plan docs commits plus the 8 implementation commits above; no stray files, no changes outside `src/`, `e2e/`, `__mocks__/`, `setupTests.ts`, `package.json`, `pnpm-lock.yaml`, `docs/superpowers/`.

Done — hand back for review/PR (finishing-a-development-branch skill). Push and PR creation are NOT part of this plan.
