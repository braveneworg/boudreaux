# Enrichment Artist Gate + Title-Only Release-Date Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual web-enrichment runs refuse a blank Artist / Creator (disabled UI + server backstop), and the release-date web lookup builds clean title-only queries when no artist is set.

**Architecture:** Three independent, minimal edits per the approved spec (`docs/superpowers/specs/2026-07-19-enrichment-artist-gate-design.md`): (1) the bio-generator Lambda's `resolveReleaseDateSuggestion` branches its two Serper queries and Gemini prompt on a trimmed artist; (2) `runVideoEnrichmentAction` returns a typed error before any status write when the persisted artist is blank; (3) `VideoEnrichmentPanel` watches the live form artist and disables Run/Re-run with a hint. The automatic kick paths are already gated and are NOT touched.

**Tech Stack:** Next.js 16 App Router, React 19, RHF 7, TanStack Query 5, Vitest 4 (globals — never import `describe`/`it`/`vi`), Playwright, standalone `bio-generator` Lambda package (own `node_modules`, Vitest).

## Global Constraints

- Worktree: all work happens in `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/fix-enrichment-artist-gate` on branch `fix/enrichment-artist-gate`. Never touch the main checkout.
- TDD: write the failing test first, watch it fail, then implement.
- TypeScript: no `any`, no `!` non-null assertion, arrow functions only, named exports, explicit return types on exported functions.
- Never suppress lint/type errors (`eslint-disable`, `@ts-ignore`, etc. are forbidden).
- ESLint `complexity` cap is 10 per function — extract named helpers rather than inlining branches.
- Vitest: `describe`/`it`/`expect`/`vi` are globals — never import them from `vitest`. One condition per test.
- Commits: Conventional Commits with gitmoji, FULL header ≤50 chars (gitmoji counts as 2). No AI attribution lines. Husky pre-commit runs gitleaks + lint-staged + `vitest --changed` — never `--no-verify`.
- E2E: only against the isolated Docker Mongo (`pnpm run e2e:docker:up`; hardcoded `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`). Never read `.env*`; never export `DATABASE_URL` from the shell.
- Exact user-facing copy (verbatim, used across tasks):
  - Panel hint: `Add an artist or creator to enable web enrichment.`
  - Action error: `Add an artist or creator and save before running enrichment.`

---

### Task 1: Lambda — title-only release-date queries and prompt

**Files:**

- Modify: `bio-generator/src/release-date.ts` (queries + prompt builder + `resolveReleaseDateSuggestion`)
- Test: `bio-generator/src/release-date.spec.ts`

**Interfaces:**

- Consumes: nothing from other tasks (fully independent).
- Produces: no exported-surface change — `resolveReleaseDateSuggestion(args, deps)` keeps its exact signature; `artistDisplay: string` may now be blank/whitespace and is handled first-class. Callers (`video-enrichment.ts`, `release-date-lookup.ts`) are untouched.

- [ ] **Step 1: Install the Lambda package deps (fresh worktree has none)**

Run: `pnpm --dir bio-generator install`
Expected: completes without error; `bio-generator/node_modules` exists.

- [ ] **Step 2: Write the three failing tests**

In `bio-generator/src/release-date.spec.ts`, add inside the existing `describe('resolveReleaseDateSuggestion', …)` block (after the `'returns null when both queries yield no evidence'` test). The file's existing `baseArgs` has `title: 'Bite Through Stone'`, `artistDisplay: 'Ceschi'`, `serperKey: 'serper-key'`; `evidence` and `adjudication` are the existing fixtures:

```ts
it('keeps the artist in both queries when one is set', async () => {
  const searchWeb = vi.fn().mockResolvedValue([]);

  await resolveReleaseDateSuggestion(baseArgs, { searchWeb });

  expect(searchWeb).toHaveBeenNthCalledWith(
    1,
    '"Ceschi" "Bite Through Stone" video release date',
    'serper-key'
  );
  expect(searchWeb).toHaveBeenNthCalledWith(2, 'Ceschi Bite Through Stone premiere', 'serper-key');
});

it('searches title-only queries when the artist is blank', async () => {
  const searchWeb = vi.fn().mockResolvedValue([]);

  await resolveReleaseDateSuggestion({ ...baseArgs, artistDisplay: '   ' }, { searchWeb });

  expect(searchWeb).toHaveBeenNthCalledWith(
    1,
    '"Bite Through Stone" video release date',
    'serper-key'
  );
  expect(searchWeb).toHaveBeenNthCalledWith(2, 'Bite Through Stone premiere', 'serper-key');
});

it('omits the artist from the adjudication prompt when blank', async () => {
  const searchWeb = vi.fn().mockResolvedValue(evidence);
  const requestJson = vi.fn().mockResolvedValue(adjudication);

  await resolveReleaseDateSuggestion(
    { ...baseArgs, artistDisplay: '' },
    { searchWeb, requestJson }
  );

  expect(requestJson).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      userPrompt: expect.stringContaining('Video: "Bite Through Stone".'),
    }),
    {}
  );
  expect(requestJson).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ userPrompt: expect.not.stringContaining(' by ') }),
    {}
  );
});
```

- [ ] **Step 3: Run the spec to verify the new tests fail**

Run: `pnpm --dir bio-generator test:run release-date.spec.ts`
Expected: the artist-present test PASSES (current behavior), the two blank-artist tests FAIL — queries arrive as `'"" "Bite Through Stone" video release date'` and the prompt contains `by .`.

- [ ] **Step 4: Implement the conditional queries and prompt**

In `bio-generator/src/release-date.ts`:

(a) Add a helper directly above `buildReleaseDatePrompt`:

```ts
/** The two-query evidence sweep — title-only when no artist is known. */
const releaseDateQueries = (title: string, artist: string): string[] =>
  artist
    ? [`"${artist}" "${title}" video release date`, `${artist} ${title} premiere`]
    : [`"${title}" video release date`, `${title} premiere`];
```

(b) Replace `buildReleaseDatePrompt` (rename its second param to the trimmed `artist`; only the first array element changes):

```ts
/** Builds the release-date user prompt from the numbered evidence block. */
const buildReleaseDatePrompt =
  (title: string, artist: string, adminReleasedOn: string | undefined) =>
  (evidence: string): string =>
    [
      artist ? `Video: "${title}" by ${artist}.` : `Video: "${title}".`,
      adminReleasedOn ? `Admin-entered release date: ${adminReleasedOn} (verify or correct).` : '',
      'EVIDENCE:',
      evidence,
      '',
      'Return JSON: {"releaseDate": "YYYY-MM-DD" or null, "confidence": "high"|"medium"|"low",',
      '"sourceUrls": [evidence links that support the date], "rationale": "<= 300 chars"}',
    ]
      .filter(Boolean)
      .join('\n');
```

(c) In `resolveReleaseDateSuggestion`, derive the trimmed artist and use both helpers. Replace:

```ts
  const { title, artistDisplay, adminReleasedOn, serperKey, geminiKey } = args;
  try {
    const outcome = await adjudicate(
      {
        queries: [
          `"${artistDisplay}" "${title}" video release date`,
          `${artistDisplay} ${title} premiere`,
        ],
```

with:

```ts
  const { title, artistDisplay, adminReleasedOn, serperKey, geminiKey } = args;
  const artist = artistDisplay.trim();
  try {
    const outcome = await adjudicate(
      {
        queries: releaseDateQueries(title, artist),
```

and replace the `buildUserPrompt` line in the same call:

```ts
        buildUserPrompt: buildReleaseDatePrompt(title, artist, adminReleasedOn),
```

- [ ] **Step 5: Run the spec to verify all tests pass**

Run: `pnpm --dir bio-generator test:run release-date.spec.ts`
Expected: PASS, including all pre-existing tests (the artist-present shapes are unchanged).

- [ ] **Step 6: Run the full Lambda suite**

Run: `pnpm --dir bio-generator test:run`
Expected: PASS — `video-enrichment.spec.ts` and `release-date-lookup.spec.ts` exercise `resolveReleaseDateSuggestion` only via injected deps or an always-present artist, so nothing else moves.

- [ ] **Step 7: Commit**

```bash
git add bio-generator/src/release-date.ts bio-generator/src/release-date.spec.ts
git commit -m "fix: 🐛 title-only release-date queries"
```

---

### Task 2: Server action — refuse a blank persisted artist

**Files:**

- Modify: `src/lib/actions/run-video-enrichment-action.ts` (insert one guard after the not-found check, ~line 82)
- Test: `src/lib/actions/run-video-enrichment-action.spec.ts`

**Interfaces:**

- Consumes: `VideoEnrichmentState.artist: string` (already on the state — `dispatchEnrichment` reads it as `artistDisplay`).
- Produces: `runVideoEnrichmentAction` may now return `{ success: false, error: 'Add an artist or creator and save before running enrichment.' }`. The client mutation hook (`useRunVideoEnrichmentMutation`) already toasts `result.error` on any `success: false` — no client plumbing changes.

- [ ] **Step 1: Install root deps (fresh worktree has none; postinstall regenerates the Prisma client)**

Run: `pnpm install`
Expected: completes without error.

- [ ] **Step 2: Write the failing test**

In `src/lib/actions/run-video-enrichment-action.spec.ts`, add inside the existing `describe('runVideoEnrichmentAction', …)` block, after the `'returns an error when the video does not exist'` test. The file's existing `baseState(overrides)` helper and `VIDEO_ID` constant are reused; `afterMock` is the file's hoisted `next/server` `after` spy:

```ts
it('refuses to run when the persisted artist is blank', async () => {
  vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState({ artist: '   ' }));

  const result = await runVideoEnrichmentAction(VIDEO_ID);

  expect(result).toEqual({
    success: false,
    error: 'Add an artist or creator and save before running enrichment.',
  });
  expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
  expect(afterMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm run test:run src/lib/actions/run-video-enrichment-action.spec.ts`
Expected: the new test FAILS — the action currently returns `{ success: true, status: 'pending' }` and calls `setEnrichmentStatus`.

- [ ] **Step 4: Implement the guard**

In `src/lib/actions/run-video-enrichment-action.ts`, directly after:

```ts
if (!state) {
  return { success: false, error: 'Video not found.' };
}
```

insert:

```ts
// Manual-path artist gate: the automatic kicks already require a
// non-blank artist, and a blank one has no linked artists to enrich.
if (state.artist.trim() === '') {
  return {
    success: false,
    error: 'Add an artist or creator and save before running enrichment.',
  };
}
```

Also update the action's JSDoc first paragraph to mention the gate — replace the sentence `A run already in flight (and not stale) is not duplicated.` with `A run already in flight (and not stale) is not duplicated, and a video whose persisted artist is blank is refused before any status write.`

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm run test:run src/lib/actions/run-video-enrichment-action.spec.ts`
Expected: PASS — all pre-existing tests still pass because `baseState()` defaults `artist: 'Ceschi'`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/run-video-enrichment-action.ts src/lib/actions/run-video-enrichment-action.spec.ts
git commit -m "fix: 🐛 gate manual enrichment on artist"
```

---

### Task 3: Panel — disable Run/Re-run and show the hint

**Files:**

- Modify: `src/app/components/forms/videos/enrichment/video-enrichment-panel.tsx`
- Test: `src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx`

**Interfaces:**

- Consumes: the panel's existing `control: Control<VideoFormData>` prop (the form's `artist` field is watched from it — no new props on `VideoEnrichmentPanel`).
- Produces: internal only — `EnrichmentPanelBodyProps` gains `hasArtist: boolean`; the hint copy is the Global Constraints string, also asserted by Task 4's E2E.

- [ ] **Step 1: Write the failing tests and update the blank-artist renders**

In `src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx` (the file's `Harness` already accepts an `artist` prop defaulting to `''`, so a bare `<Harness />` renders a blank-artist form):

(a) Add three tests at the end of the `describe('VideoEnrichmentPanel — states', …)` block:

```ts
  it('disables Run enrichment and shows the hint when the artist is blank', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Run enrichment' })).toBeDisabled();
    expect(
      screen.getByText('Add an artist or creator to enable web enrichment.')
    ).toBeInTheDocument();
  });

  it('enables Run enrichment and hides the hint once an artist is set', () => {
    render(<Harness artist="Lead Act" />);

    expect(screen.getByRole('button', { name: 'Run enrichment' })).toBeEnabled();
    expect(
      screen.queryByText('Add an artist or creator to enable web enrichment.')
    ).not.toBeInTheDocument();
  });

  it('disables the Re-run trigger when the artist is blank', () => {
    setStatus(succeededStatus);
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Re-run enrichment' })).toBeDisabled();
  });
```

(b) Update the four existing tests that CLICK a run affordance with the default blank artist — each will otherwise fail once the gate lands. Change `render(<Harness />);` to `render(<Harness artist="Lead Act" />);` in exactly these tests:

- `'runs enrichment directly (no dialog) from the empty state'`
- `'opens a confirm dialog instead of re-running immediately'`
- `'re-runs after the dialog is confirmed'`
- `'does not re-run when the dialog is cancelled'`

(Leave every other test untouched — presence-only assertions like `'offers Run enrichment for a never-enriched video'` and `'shows the stored error and Re-run on failure'` still hold for a disabled button.)

- [ ] **Step 2: Run the spec to verify the new tests fail**

Run: `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx`
Expected: the two blank-artist disable tests and the hint test FAIL (buttons currently enabled, hint absent); everything else PASSES.

- [ ] **Step 3: Implement the panel gate**

In `src/app/components/forms/videos/enrichment/video-enrichment-panel.tsx`:

(a) Add module-scope helpers directly after the `VIDEO_LEVEL_FIELD_CONFIG` map:

```tsx
/** Copy for the blank-artist gate — asserted verbatim by unit and E2E specs. */
const MISSING_ARTIST_HINT = 'Add an artist or creator to enable web enrichment.';

/** True when the live Artist / Creator field holds a non-blank value. */
const hasArtistValue = (artist: string | undefined): boolean => (artist ?? '').trim() !== '';

/** Muted explainer rendered whenever the gate disables the run affordances. */
const MissingArtistHint = (): React.ReactElement => (
  <p className="text-muted-foreground text-sm">{MISSING_ARTIST_HINT}</p>
);
```

(b) Add `hasArtist: boolean;` to `EnrichmentPanelBodyProps`:

```tsx
interface EnrichmentPanelBodyProps {
  data: VideoEnrichmentStatusResult | undefined;
  control: Control<VideoFormData>;
  isBusy: boolean;
  hasArtist: boolean;
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
  onRun: () => void;
  onApplySuggestion: (
    suggestion: EnrichmentSuggestion,
    expectedCurrent: string | null
  ) => Promise<boolean>;
  onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
}
```

(c) In `PhaseContent`, add `hasArtist` to the destructured props and gate the empty-phase button. Replace:

```tsx
    case 'empty':
      return <RunEnrichmentButton disabled={isBusy} onRun={onRun} />;
```

with:

```tsx
    case 'empty':
      return <RunEnrichmentButton disabled={isBusy || !hasArtist} onRun={onRun} />;
```

(d) In `EnrichmentPanelBody`, destructure `hasArtist`, render the hint, and gate the Re-run trigger. Replace the whole component body with:

```tsx
const EnrichmentPanelBody = (props: EnrichmentPanelBodyProps): React.ReactElement => {
  const { data, isBusy, hasArtist, onRun } = props;
  const phase = panelPhase(data);
  const isTerminal = phase === 'succeeded' || phase === 'failed';

  return (
    <>
      {isTerminal ? <TerminalAnnouncement succeeded={phase === 'succeeded'} /> : null}
      {hasArtist ? null : <MissingArtistHint />}
      <PhaseContent {...props} phase={phase} />
      {isTerminal ? (
        <RerunEnrichmentDialog disabled={isBusy || !hasArtist} onConfirm={onRun} />
      ) : null}
    </>
  );
};
```

(e) In `VideoEnrichmentPanel`, watch the artist and thread the flag. After the existing `const isBusy = …` line, add:

```tsx
const artistValue = useWatch({ control, name: 'artist', defaultValue: '' });
const hasArtist = hasArtistValue(artistValue);
```

and add `hasArtist={hasArtist}` to the `<EnrichmentPanelBody …>` JSX props.

(f) Update the `VideoEnrichmentPanel` JSDoc: append the sentence `Run and Re-run are disabled with a hint while the live Artist / Creator field is blank (the server action refuses blank-artist runs as a backstop).`

- [ ] **Step 4: Run the spec to verify all tests pass**

Run: `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx`
Expected: PASS (all pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/forms/videos/enrichment/video-enrichment-panel.tsx src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx
git commit -m "fix: 🐛 gate enrichment panel on artist"
```

---

### Task 4: E2E — blank-artist draft shows the disabled gate

**Files:**

- Modify: `e2e/tests/admin-video-draft-upload.spec.ts` (add a second test to the existing describe)

**Interfaces:**

- Consumes: the Task 3 hint copy (`Add an artist or creator to enable web enrichment.`) and disabled Run button; `deleteVideoCascade` from `../helpers/e2e-db` (already imported in this file); the filename-parser behavior that a name without `Artist - ` yields `artist: null` so the draft persists a blank artist.
- Produces: nothing consumed later.

- [ ] **Step 1: Write the E2E test**

In `e2e/tests/admin-video-draft-upload.spec.ts`, add inside the existing `test.describe('Admin video draft-upload — pre-save enrichment', …)` block, after the existing test:

```ts
test('a blank-artist draft disables Run enrichment with a hint', async ({ adminPage }) => {
  let videoId: string | undefined;
  try {
    await adminPage.goto('/admin/videos/new');
    await expect(adminPage.getByRole('heading', { name: 'Video File' })).toBeVisible();

    // No `Artist - ` prefix → the filename parser yields artist: null, so
    // the draft row persists a BLANK artist and no enrichment auto-kicks.
    await adminPage
      .getByTestId('video-dropzone')
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'E2E Gate Song.mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('e2e-not-a-real-video'),
      });

    await expect(adminPage.getByLabel('Title')).toHaveValue('E2E Gate Song', {
      timeout: 15_000,
    });
    await adminPage.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/);
    videoId = adminPage.url().split('/').pop();
    expect(videoId).toMatch(/^[0-9a-f]{24}$/);

    // The panel mounts (draft + MUSIC default) but the gate holds: Run is
    // disabled, the hint shows, and no auto-kick ever engaged the status.
    const panel = adminPage.getByTestId('video-enrichment-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole('button', { name: 'Run enrichment' })).toBeDisabled();
    await expect(
      panel.getByText('Add an artist or creator to enable web enrichment.')
    ).toBeVisible();
    await expect(panel.getByTestId('video-enrichment-status-chip')).toHaveText('Not enriched');
  } finally {
    if (videoId) {
      await deleteVideoCascade(videoId);
    }
  }
});
```

- [ ] **Step 2: Start the isolated E2E database**

Run: `pnpm run e2e:docker:up`
Expected: the `boudreaux-e2e-mongo` container is up on `localhost:27018`. Never point E2E at any other database; never read `.env*`.

- [ ] **Step 3: Run the affected E2E specs**

Run: `pnpm exec playwright test admin-video-draft-upload admin-video-enrichment`
(Use `pnpm exec playwright` directly — `pnpm run test:e2e -- …` silently swallows extra args.)
Expected: ALL tests in both files PASS — the new gate test, the existing draft-enrichment keystone (its filename carries `E2E Draft Artist - `, so it is ungated), and the seeded enrichment flow (its video has linked artists). Known unrelated hazard: two S3-dependent specs elsewhere fail in fresh worktrees without AWS creds — not these two files.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/admin-video-draft-upload.spec.ts
git commit -m "test: ✅ blank-artist enrichment gate e2e"
```

---

### Task 5: Full gate + branch verification

**Files:** none created — verification only (plus any formatter write-backs).

**Interfaces:** consumes all prior tasks; produces the pushable branch.

- [ ] **Step 1: Run the full repo gate**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
Expected: all four PASS. `pnpm run lint` auto-fixes; `pnpm run format` writes. If either modifies files, re-run the four until clean.

- [ ] **Step 2: Re-run the Lambda suite (not covered by the root gate)**

Run: `pnpm --dir bio-generator test:run`
Expected: PASS.

- [ ] **Step 3: Commit any formatter/lint write-backs**

Run: `git status --short` — if dirty:

```bash
git add -A
git commit -m "style: 🎨 lint and format write-backs"
```

If clean, skip.

- [ ] **Step 4: Verify the branch is complete**

Run: `git log --oneline origin/main..HEAD`
Expected: the spec commit, the plan commit, plus the four task commits (Tasks 1–4), and optionally the style commit. Do NOT push or open a PR — that is a separate, user-approved step.
