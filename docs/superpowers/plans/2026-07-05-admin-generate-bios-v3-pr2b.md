# Admin Generate Bios v3 — PR 2b: Bounded Expansion + Async Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover more good images per artist (targeted Jina queries + a fixed 1-level link-follow, all through the existing vision gate) and remove the synchronous-invoke failure mode by making the Lambda fire-and-forget and POST its result back to a per-job-token-authenticated callback.

**Architecture:** Two independent halves on one branch. **Part A** (Lambda workspace `bio-generator/`) adds targeted web-search queries and a bounded link-follow step, both feeding `acc.scrapedImages` so they pass the Gemini vision gate — never the provenance-guaranteed `acc.images` tier. **Part B** (web app + Lambda) switches the real invoke to `InvocationType: 'Event'`; the invoke payload carries a random per-job token + a derived callback URL; the Lambda POSTs `{ jobToken, result }` to a new `POST /api/artists/[id]/bio-generation/callback` route that constant-time-matches the token (only while `processing`), then runs the existing persist/rehost pipeline (extracted into `persistGeneratedBio`) in `after()`. The `BIO_GENERATOR_FAKE` path stays fully synchronous, so E2E/dev are unaffected.

**Tech Stack:** TypeScript 6 (strict), Next.js 16 App Router, Prisma 6 + MongoDB, `@aws-sdk/client-lambda` (Event invoke), Zod 4, Vitest 4. Two separate pnpm/vitest/tsc workspaces: root (web app) and `bio-generator/` (Lambda).

## Global Constraints

Every task's requirements implicitly include this section.

- **TDD, non-negotiable:** failing test first, watch it fail, implement, green. **Gate BOTH workspaces before each commit that touches them:** web app `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`; Lambda `pnpm --dir bio-generator typecheck && pnpm --dir bio-generator test:run && pnpm --dir bio-generator lint` (whichever scripts exist there). A commit touching only one workspace gates only that one, but Part-B commits that touch both gate both.
- **Style:** arrow functions only; named exports only (except App Router `route.ts` which exports `GET`/`POST`); no `any`, no non-null `!`; no `eslint-disable`/`@ts-ignore`/`@ts-nocheck`; cyclomatic complexity ≤ 10 (repo counts each `?.`/`??`/`||`/`&&`/`?:`). MPL header on every new file.
- **Lockstep schemas:** the Lambda's `bio-generator/src/types.ts` and the web app's `src/lib/validation/bio-generation-schema.ts` are hand-duplicated (the two workspaces cannot share a module). Any wire-contract change (here: the input schema gaining `callbackUrl`/`jobToken`) must be made in BOTH, identically.
- **Provenance boundary (Part A):** new discovered images MUST be pushed to `acc.scrapedImages` (→ `verifyScrapedImages` vision gate), NEVER straight into `acc.images` (that tier ships un-verified). Respect existing caps (`MAX_VISION_CANDIDATES=60`, `MAX_IMAGES=100`).
- **Fake/E2E path stays synchronous (Part B):** when `BIO_GENERATOR_FAKE==='true'` (E2E + local dev), generation completes in-process (no Event invoke, no callback) exactly as today. No E2E or seed changes. The real async path is unit-tested only (mocked) — first real validation is a prod regen watched via the existing 2.5s poll.
- **Auth = per-job capability token, no stored secret:** a random 128-bit token per job, stored on the artist (`bioJobToken`), passed to the Lambda in the payload, echoed back, constant-time-matched, and single-use. NO SSM param, NO GitHub secret, NO shared HMAC secret. Never log the token.
- **Coverage:** pre-push `test:coverage:check` — 95% branches hard floor + ≤2% regression vs `COVERAGE_METRICS.md`. New branchy code needs both-sides branch coverage.
- **Never touch `.env*`.** New env vars are named + documented; never read/print their values.

## Target service API (post-2b) — the shape all Part-B tasks converge on

`BioGenerationService` (in `src/lib/services/bio-generation-service.ts`) and one extracted module function:

```ts
// REAL Event invoke only — no fake branch, no returned data. Fire acknowledgement.
static generate(input: BioGenerationLambdaInput): Promise<{ ok: true } | { ok: false; error: string }>

// Extracted persist pipeline (former generateForArtist:427-471). Throws on DB error.
export const persistGeneratedBio = (
  artistId: string, data: BioGenerationData, releases: ReleaseCoverSource[], slug: string
) => Promise<GeneratedBioContent>

// Branches fake(sync) vs real(async dispatch). Never throws.
static runGenerationJob(artistId: string, opts?: { links?: string[]; description?: string }): Promise<
  | { status: 'completed'; slug: string; data: GeneratedBioContent }   // fake path finished in-process
  | { status: 'dispatched' }                                           // real path fired; callback will finish it
  | { status: 'failed'; error: string }
>

// Callback half: quick claim (state=processing + constant-time token match + single-use clear), then heavy finish.
static verifyAndClaimCallback(artistId: string, jobToken: string): Promise<{ slug: string } | null>
static completeCallback(artistId: string, result: BioGenerationResult, slug: string): Promise<void>

// unchanged
static getGenerationStatus(artistId: string): Promise<BioGenerationStatusResult | null>
```

Revalidation stays in the action/route layer (not the service): the callback route revalidates after `completeCallback`; `runBioGenerationAfterResponse` revalidates only for the `completed` (fake) outcome. Both use a shared `revalidateArtistBioPaths(slug)` helper.

---

# PART A — Bounded Lambda expansion (`bio-generator/`)

## Task A1: Add targeted web-search queries

**Files:**

- Modify: `bio-generator/src/handler.ts:298-303` (the `queries` array in `applyWebSearch`)
- Test: `bio-generator/src/handler.spec.ts`

**Interfaces:** Produces: three additional Jina search queries issued per generation. Consumes: the existing `for (const query of queries)` loop (unchanged) that calls `deps.searchArtistSources(...)` and pushes `found.images` into `acc.scrapedImages`.

- [ ] **Step 1 — failing test.** In `handler.spec.ts`, add a test that runs `runBioGeneration(input, makeDeps({ searchArtistSources: spy }))` and asserts `spy` is called **6** times and that the issued queries include a `site:bandcamp.com`, a `site:discogs.com`, and a press-photo/live query. (Read the existing web-search test to mirror how `searchArtistSources`/`getScrapeApiKey` are stubbed and how the query is passed — it is the 4th arg `options.query`.) Assert on the `options.query` of the recorded calls.

- [ ] **Step 2 — run, watch fail** (`pnpm --dir bio-generator test:run` filtered to the spec): FAIL — only 3 queries today.

- [ ] **Step 3 — implement.** Replace the array at `handler.ts:298-303`:

```ts
const artist = searchNameFor(input);
const queries: Array<string | undefined> = [
  undefined,
  `${artist} musician interview review press`,
  `${artist} music press feature profile`,
  `${artist} press photo live performance`,
  `${artist} musician site:bandcamp.com`,
  `${artist} musician site:discogs.com`,
];
```

- [ ] **Step 4 — run, watch pass.** Confirm the new-query test and all existing `handler.spec` tests pass. Note in the report: more queries → more scraped candidates, but `MAX_VISION_CANDIDATES=60` still caps what enters the vision gate, so the volume is bounded.

- [ ] **Step 5 — gate + commit** (Lambda workspace gates): `feat: ✨ add targeted bio image search queries`

---

## Task A2: Fixed 1-level link-follow for images

**Files:**

- Modify: `bio-generator/src/handler.ts` (new helper + one call between `applyWebSearch` and `finalizeMetadata` at `:524`)
- Test: `bio-generator/src/handler.spec.ts`

**Interfaces:** Consumes `deps.readUrl` (existing), `acc.links` (candidate URLs), `acc.scrapedImages` (sink). Produces: images from a fixed set of already-discovered high-value links, routed through the vision gate.

- [ ] **Step 1 — read the accumulator shape.** Open `handler.ts` and confirm the exact `MetadataAccumulator` field names used below: `acc.links` (array of `{ url; label; kind? }`), `acc.scrapedImages` (`ScrapedImage[]`), and how the official site already tracked reads (the `sourceUrls`/`acc.facts.sourceUrls` set) so we don't re-read it. Reuse the existing registrable-host helper the file already uses for `attributionHost`/`toScrapedBioImage` rather than adding a new URL parser.

- [ ] **Step 2 — failing test.** In `handler.spec.ts`, stub `deps.readUrl` to return `{ content: '', images: [{ url: 'https://img/bc.jpg', alt: null, sourceUrl: 'https://x.bandcamp.com' }] }` for a Bandcamp URL, seed `acc` (via the real `runBioGeneration` flow with `deps.lookupArtist` returning a Bandcamp link) and assert those followed images reach the vision-gate input — i.e. `deps.verifyScrapedImages` receives a candidate whose `sourceUrl` is the Bandcamp page. Also assert `readUrl` is NOT called for non-Bandcamp/Discogs links and is capped at `MAX_FOLLOWED_LINKS`.

- [ ] **Step 3 — run, watch fail.**

- [ ] **Step 4 — implement the helper** (place near the other `apply*` helpers; verify field names from Step 1):

```ts
/** Known link hosts worth following one level deep for additional images. */
const LINK_FOLLOW_HOSTS = ['bandcamp.com', 'discogs.com'] as const;
/** Cap the fan-out so expansion stays bounded against the Lambda time budget. */
const MAX_FOLLOWED_LINKS = 4;

/**
 * Follow a FIXED set of already-discovered high-value links (Bandcamp/Discogs)
 * one level deep for images, pushing them into `acc.scrapedImages` so they pass
 * the same vision gate as web-search images. No recursive crawl; deduped
 * against links already read; capped at MAX_FOLLOWED_LINKS.
 */
const followKnownLinksForImages = async (
  acc: MetadataAccumulator,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<void> => {
  const alreadyRead = new Set(acc.facts.sourceUrls ?? []);
  const targets = acc.links
    .filter((link) => LINK_FOLLOW_HOSTS.some((host) => registrableHostMatches(link.url, host)))
    .filter((link) => !alreadyRead.has(link.url))
    .slice(0, MAX_FOLLOWED_LINKS);

  for (const link of targets) {
    const result = await deps.readUrl(link.url, scrapeKey);
    if (result) {
      acc.scrapedImages.push(...result.images);
    }
  }
};
```

Then call it between `applyWebSearch` and `finalizeMetadata` (`handler.ts:524`):

```ts
await applyWebSearch(acc, input, scrapeKey, deps);
await followKnownLinksForImages(acc, scrapeKey, deps);
await finalizeMetadata(acc, input, (candidates, context) =>
  deps.verifyScrapedImages(candidates, context, { apiKey, model })
);
```

If a `registrableHostMatches(url, host)` helper does not already exist, add a tiny module-private arrow that parses `new URL(url).hostname` and checks it equals `host` or ends with `.${host}` (guard the `URL` parse in try/catch, returning false on invalid). Keep complexity ≤ 10.

- [ ] **Step 5 — run, watch pass** (new + existing `handler.spec`).

- [ ] **Step 6 — gate + commit:** `feat: ✨ follow known links one level for images`

---

# PART B — Async decoupling

## Task B1: `bioJobToken` schema field

**Files:**

- Modify: `prisma/schema.prisma:282` (Artist model, after `bioStartedAt`)

- [ ] **Step 1 — add the field** (match existing column alignment):

```prisma
  bioJobToken           String? // Opaque per-job token for the async callback; set at dispatch, cleared on completion (guards stale/overtaken writes)
```

- [ ] **Step 2 — regenerate the client** so the new field is on the Prisma types: `pnpm exec prisma generate`. Confirm `pnpm run typecheck` still passes (no consumers yet). **Do NOT run `prisma db push`** against any real database from here — that is an ops/deploy step; MongoDB is schemaless so the additive nullable field needs no migration, and CI regenerates the client in `postinstall`.

- [ ] **Step 3 — commit:** `feat: ✨ add bioJobToken artist field`

---

## Task B2: Repository token methods + surface it in state

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts` (add `setBioJobToken`; add `bioJobToken` to `getBioGenerationState`)
- Test: `src/lib/repositories/artist-repository.spec.ts`

**Interfaces:** Produces `ArtistRepository.setBioJobToken(artistId, token: string | null): Promise<void>` and `getBioGenerationState().bioJobToken: string | null`.

- [ ] **Step 1 — failing tests** (mirror the existing `setBioStatus` spec): (a) `setBioJobToken(id, 'tok')` calls `prisma.artist.update` with `data: { bioJobToken: 'tok' }`; (b) `setBioJobToken(id, null)` sets it to `null`; (c) `getBioGenerationState` selects `bioJobToken` and returns it.

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement.** Add after `setBioStatus` (mirroring its `runQuery`+`prisma.artist.update` shape):

```ts
  /** Set (or clear, with null) the per-job async-callback token for an artist. */
  static async setBioJobToken(artistId: string, token: string | null): Promise<void> {
    await runQuery(() =>
      prisma.artist.update({ where: { id: artistId }, data: { bioJobToken: token } })
    );
  }
```

Add `bioJobToken: true` to the `getBioGenerationState` `select` block and `bioJobToken: string | null;` to its return type.

- [ ] **Step 4 — run, watch pass; gate + commit:** `feat: ✨ add bio job-token repo methods`

---

## Task B3: Lockstep input schema — `callbackUrl` + `jobToken`

**Files:**

- Modify: `bio-generator/src/types.ts:29-55` (`bioGenerationInputSchema`)
- Modify: `src/lib/services/bio-generation-fixture.ts:7-19` (`BioGenerationLambdaInput` interface)
- Test: `bio-generator/src/types.spec.ts` (or wherever the input schema is tested)

- [ ] **Step 1 — failing test** (Lambda workspace): `bioGenerationInputSchema` parses an input that includes `callbackUrl: 'https://x/cb'` and `jobToken: 'abc'`, and still parses one WITHOUT them (both optional).

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement (BOTH workspaces, identical intent):**

In `bio-generator/src/types.ts`, add to `bioGenerationInputSchema` (after `description`):

```ts
  /** Async completion callback URL the Lambda POSTs its result to (absent = synchronous/no callback). */
  callbackUrl: z.string().url().optional(),
  /** Opaque per-job token echoed back in the callback so the web app can match the in-flight job. */
  jobToken: z.string().min(1).optional(),
```

In `src/lib/services/bio-generation-fixture.ts`, add to `BioGenerationLambdaInput`:

```ts
  callbackUrl?: string;
  jobToken?: string;
```

- [ ] **Step 4 — run, watch pass; gate BOTH workspaces; commit:** `feat: ✨ thread callback url + job token to lambda`

---

## Task B4: Extract `persistGeneratedBio` (behavior-preserving)

**Files:**

- Modify: `src/lib/services/bio-generation-service.ts` (extract `:427-471` into a module function; `generateForArtist` calls it)
- Test: `src/lib/services/bio-generation-service.spec.ts`

**Interfaces:** Produces `export const persistGeneratedBio(artistId, data, releases, slug): Promise<GeneratedBioContent>`.

- [ ] **Step 1 — failing test.** Add a direct test: given mocked `rehostImages`/repo/`ReleaseRepository`, `persistGeneratedBio('a', data, releases, 'slug')` returns the assembled `GeneratedBioContent` and calls `ArtistRepository.replaceBioContent` with the expected images/links. (Mirror the assertions already in the `generateForArtist` success test.)

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement.** Extract the marked persist span into a module-level arrow (above the class), returning the assembled content:

```ts
/**
 * Re-host + sanitize + assemble raw generation data and persist it, replacing
 * the artist's bio content. Shared by the fake/sync path and the async callback.
 * Throws on a DB error (callers map that to a `failed` status).
 */
export const persistGeneratedBio = async (
  artistId: string,
  data: BioGenerationData,
  releases: ReleaseCoverSource[],
  slug: string
): Promise<GeneratedBioContent> => {
  const genres = data.genres ? sanitizeBioText(data.genres) || null : null;
  const { rehosted, duplicateAliases } = await rehostImages(data.images, artistId);
  const imageUrlByIndex = buildImageUrlIndex(rehosted, duplicateAliases);
  const persistedImages = rehosted
    .filter((image): image is RehostedImage => image !== null)
    .map((image, index) => ({ ...image, sortOrder: index }));
  const sanitizedLinks = sanitizeLinks(data.links);
  const persistedLinks = appendReleaseLinks(sanitizedLinks, releases);
  const persistedImagesWithCovers = appendInternalCoverImages(persistedImages, releases);
  const content = assembleContent({
    data,
    persistedImages: persistedImagesWithCovers,
    imageUrlByIndex,
    persistedLinks,
    genres,
  });
  await ArtistRepository.replaceBioContent(artistId, {
    shortBio: content.shortBio,
    bio: content.longBio,
    altBio: content.altBio,
    genres: content.genres,
    bioModel: content.bioModel ?? content.model,
    images: persistedImagesWithCovers,
    links: persistedLinks,
  });
  return content;
};
```

(Use the exact field names from the original block — `content.model` not `content.bioModel`; the reference above is illustrative, match the current code at `:463-471` verbatim.) Then in `generateForArtist`, replace the extracted span (`:427-471`) with:

```ts
const content = await persistGeneratedBio(artist.id, result.data, releases, artist.slug);
return { success: true, data: content, slug: artist.slug };
```

`generateForArtist`'s behavior is unchanged; every existing test must still pass.

- [ ] **Step 4 — run, watch pass; gate + commit:** `refactor: ♻️ extract persistGeneratedBio`

---

## Task B5: Callback body schema

**Files:**

- Modify: `src/lib/validation/bio-generation-schema.ts` (add `bioGenerationCallbackSchema`)
- Test: `src/lib/validation/bio-generation-schema.spec.ts`

- [ ] **Step 1 — failing test:** `bioGenerationCallbackSchema` accepts `{ jobToken: 'x', result: { ok: true, data: <valid BioGenerationData> } }` and `{ jobToken: 'x', result: { ok: false, error: 'nope' } }`; rejects a missing `jobToken` and a malformed `result`.

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement** (reuse the existing `bioGenerationResultSchema`):

```ts
/** Body the bio-generator Lambda POSTs to the async completion callback route. */
export const bioGenerationCallbackSchema = z.object({
  jobToken: z.string().min(1),
  result: bioGenerationResultSchema,
});

export type BioGenerationCallback = z.infer<typeof bioGenerationCallbackSchema>;
```

- [ ] **Step 4 — run, watch pass; gate + commit:** `feat: ✨ add bio callback body schema`

---

## Task B6: Service async split (`generate` → Event; `runGenerationJob` fake-vs-async)

**Files:**

- Modify: `src/lib/services/bio-generation-service.ts`
- Test: `src/lib/services/bio-generation-service.spec.ts`

**Interfaces:** see "Target service API" above. Consumes: `persistGeneratedBio` (B4), `setBioJobToken` (B2), the callback-URL helper (B10 — if B10 lands after, add a local `buildBioCallbackUrl(artistId)` here and B10 refines it), `fakeBioGeneration`.

- [ ] **Step 1 — failing tests.** (a) real path: with `BIO_GENERATOR_FAKE` unset + `BIO_GENERATOR_LAMBDA_NAME` set + a base-URL env set, `runGenerationJob` calls `setBioStatus('processing')`, `setBioJobToken(id, <token>)`, and sends an `InvokeCommand` whose input includes `InvocationType: 'Event'` and a `Payload` carrying `callbackUrl` + `jobToken`, then resolves `{ status: 'dispatched' }` while leaving status `processing` (no persist). (b) fake path: with `BIO_GENERATOR_FAKE==='true'`, `runGenerationJob` completes synchronously — `fakeBioGeneration` → `persistGeneratedBio` → `setBioStatus('succeeded')` → `{ status: 'completed', slug, data }`. (c) misconfig: real path with no `BIO_GENERATOR_LAMBDA_NAME` (or no base URL) → `setBioStatus('failed', …)` + `{ status: 'failed' }`. (d) dispatch throw → `failed`.

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement.**
  - `generate(input)` becomes REAL-only and returns a fire-ack: remove the `BIO_GENERATOR_FAKE` branch; add `InvocationType: 'Event'` to the `InvokeCommand`; drop the response-body handling (`FunctionError`/`Payload`/`safeParse`/`return parsed.data`) since Event returns 202 + empty payload; keep the `functionName` guard and the `try/catch`. New return type `Promise<{ ok: true } | { ok: false; error: string }>`. `INVOKE_REQUEST_TIMEOUT_MS` (16 min) is no longer needed for the fast Event call — reduce it (e.g. 30s) or drop it.
  - Extract the pre-invoke prep (read artist, name guard, fetch releases, build the Lambda input) so both branches share it — e.g. a private `prepareGeneration(artistId, opts)` returning `{ artist, releases, input } | { error }`.
  - `runGenerationJob(artistId, opts)`:
    - `await setBioStatus(artistId, 'processing')`
    - `const prep = await prepareGeneration(artistId, opts)`; on error → `setBioStatus('failed', { error })` → `{ status: 'failed', error }`.
    - **fake branch** (`BIO_GENERATOR_FAKE==='true'`): `const result = await fakeBioGeneration(prep.input)`; if `!result.ok` → failed; else `const data = await persistGeneratedBio(prep.artist.id, result.data, prep.releases, prep.artist.slug)`; `setBioStatus('succeeded', { error: null })`; return `{ status: 'completed', slug: prep.artist.slug, data }`.
    - **real branch**: `const jobToken = randomUUID()`; `const callbackUrl = buildBioCallbackUrl(prep.artist.id)`; if `!callbackUrl` → failed 'Bio generator callback URL is not configured'; `await setBioJobToken(prep.artist.id, jobToken)`; `const ack = await generate({ ...prep.input, callbackUrl, jobToken })`; if `!ack.ok` → `setBioStatus('failed', { error: ack.error })` + `setBioJobToken(id, null)` → `{ status: 'failed' }`; else return `{ status: 'dispatched' }` (status stays `processing`).
    - Wrap the whole body in `try/catch` → `setBioStatus('failed', …)` + `{ status: 'failed' }` (as today).
  - Keep complexity ≤ 10 by extracting the fake and real branches into private helpers (`runFakeGeneration(prep)`, `dispatchGeneration(prep)`) if needed.
  - `generateForArtist` is now used only by the fake branch's internals; if it is no longer referenced, remove it and move its logic into `runFakeGeneration`. If any test referenced it, update/remove those tests (no orphans).

- [ ] **Step 4 — run, watch pass.** Update every existing `runGenerationJob`/`generate`/`generateForArtist` test to the new contracts (the biggest test churn in this PR). Mock `@aws-sdk/client-lambda` (`InvokeCommand`/`LambdaClient`) at the SDK boundary and assert on the built command input.

- [ ] **Step 5 — gate + commit:** `feat: ✨ fire bio generation async via event invoke`

---

## Task B7: Callback route + service claim/complete

**Files:**

- Create: `src/app/api/artists/[id]/bio-generation/callback/route.ts`
- Modify: `src/lib/services/bio-generation-service.ts` (`verifyAndClaimCallback`, `completeCallback`)
- Create: `src/lib/config/rate-limit-tiers.ts` entry for a bio-callback limiter (reuse the module's existing pattern)
- Test: `route.spec.ts` (new) + service spec for claim/complete

**Interfaces:** Consumes `bioGenerationCallbackSchema` (B5), `persistGeneratedBio` (B4), `setBioJobToken`/`setBioStatus`/`getBioGenerationState` (repo). Produces the async completion endpoint.

- [ ] **Step 1 — failing service tests** for the claim/complete methods:
  - `verifyAndClaimCallback(id, token)` returns `{ slug }` and clears the token ONLY when `bioStatus==='processing'` AND the stored `bioJobToken` constant-time-equals `token`; returns `null` (and does NOT clear) when status ≠ processing, when no stored token, or when the token mismatches.
  - `completeCallback(id, { ok: true, data }, slug)` re-fetches releases, calls `persistGeneratedBio`, sets `succeeded`; `completeCallback(id, { ok: false, error }, slug)` sets `failed` with the error; a `persistGeneratedBio` throw sets `failed`.

- [ ] **Step 2 — failing route test** (`route.spec.ts`, mock `BioGenerationService`): valid body + a claimed job → 202 and (via mocked `after`) `completeCallback` invoked; unmatched token (claim returns null) → 202 and `completeCallback` NOT invoked; malformed JSON → 400; oversized body → 413; body failing the Zod schema → 400.

- [ ] **Step 3 — run, watch fail.**

- [ ] **Step 4 — implement the service methods** (add a constant-time string compare helper using `crypto.timingSafeEqual` over equal-length `Buffer`s; pre-check length — a random UUID token is fixed-length so this leaks nothing meaningful):

```ts
const tokensMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

  static async verifyAndClaimCallback(
    artistId: string,
    jobToken: string
  ): Promise<{ slug: string } | null> {
    const state = await ArtistRepository.getBioGenerationState(artistId);
    if (!state || state.bioStatus !== 'processing' || !state.bioJobToken) {
      return null;
    }
    if (!tokensMatch(state.bioJobToken, jobToken)) {
      return null; // do NOT clear a valid token on a mismatched/forged callback
    }
    await ArtistRepository.setBioJobToken(artistId, null); // single-use
    return { slug: state.slug };
  }

  static async completeCallback(
    artistId: string,
    result: BioGenerationResult,
    slug: string
  ): Promise<void> {
    if (!result.ok) {
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: result.error });
      return;
    }
    const releases = await ReleaseRepository.findPublishedByArtistWithCovers(artistId).catch(
      () => [] as ReleaseCoverSource[]
    );
    try {
      await persistGeneratedBio(artistId, result.data, releases, slug);
      await ArtistRepository.setBioStatus(artistId, 'succeeded', { error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bio persistence failed.';
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: message });
    }
  }
```

- [ ] **Step 5 — implement the route** (`callback/route.ts`, mirroring the `client-errors` route + the status route's param pattern; import a `bioCallbackLimiter`/`BIO_CALLBACK_LIMIT` added to `rate-limit-tiers.ts`):

```ts
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 512 * 1024; // room for up to ~100 image rows + bios

export const POST = withRateLimit(
  bioCallbackLimiter,
  BIO_CALLBACK_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const parsed = bioGenerationCallbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  }
  const claim = await BioGenerationService.verifyAndClaimCallback(id, parsed.data.jobToken);
  if (claim) {
    // Heavy re-host/persist runs post-response; the 2.5s poll surfaces completion.
    after(async () => {
      await BioGenerationService.completeCallback(id, parsed.data.result, claim.slug);
      revalidateArtistBioPaths(claim.slug);
    });
  }
  // Always 202 — never reveal whether the token matched (anti-enumeration).
  return new NextResponse(null, { status: 202 });
});
```

Add `revalidateArtistBioPaths(slug: string)` to a shared helper (e.g. `generate-artist-bio-action-helpers.ts`) doing the four `revalidatePath` calls currently inline in `runBioGenerationAfterResponse`, and have that function call it too (Task B8).

- [ ] **Step 6 — run, watch pass; gate + commit:** `feat: ✨ add async bio generation callback route`

---

## Task B8: Action — audit at trigger, stale-window fix, revalidation split

**Files:**

- Modify: `src/lib/actions/generate-artist-bio-action.ts` (STALE_JOB_MS; audit at trigger)
- Modify: `src/lib/actions/generate-artist-bio-action-helpers.ts` (revalidate only on `completed`; extract `revalidateArtistBioPaths`)
- Test: both specs

- [ ] **Step 1 — failing tests:** (a) `STALE_JOB_MS === 17 * 60 * 1000`; (b) a successful trigger calls `logSecurityEvent` with the session `userId` and `action: 'bio-generation-triggered'` at dispatch (not completion); (c) `runBioGenerationAfterResponse` revalidates the four paths when `runGenerationJob` returns `{ status: 'completed', slug }` and does NOT revalidate when it returns `{ status: 'dispatched' }` or `{ status: 'failed' }`.

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement.**
  - `generate-artist-bio-action.ts`: `const STALE_JOB_MS = 17 * 60 * 1000;` (update the comment — it must exceed the Lambda's 15-min timeout so an in-flight async job is not superseded). After scheduling the `after()` job (or right before returning `pending`), `logSecurityEvent({ event: 'media.artist.updated', userId: session.user.id, metadata: { artistId, action: 'bio-generation-triggered' } })`.
  - `generate-artist-bio-action-helpers.ts`: add `export const revalidateArtistBioPaths = (slug: string): void => { revalidatePath('/admin/artists'); revalidatePath('/artists'); revalidatePath(\`/artists/${slug}\`); revalidatePath(\`/artists/${slug}/bio\`); };`. Rewrite `runBioGenerationAfterResponse`to`const outcome = await BioGenerationService.runGenerationJob(...); if (outcome.status === 'completed') revalidateArtistBioPaths(outcome.slug);` and REMOVE the completion audit-log (moved to the action).

- [ ] **Step 4 — run, watch pass; gate + commit:** `refactor: ♻️ audit at trigger + fix stale window`

---

## Task B9: Lambda POSTs the callback

**Files:**

- Modify: `bio-generator/src/handler.ts` (`BioGeneratorDeps` + `defaultDeps` + `lambdaHandler` fire the callback)
- Create: `bio-generator/src/callback.ts` (the `postCallback` implementation)
- Test: `bio-generator/src/handler.spec.ts` + `bio-generator/src/callback.spec.ts`

**Interfaces:** Produces `postBioCallback({ url, jobToken, result }, fetchFn?): Promise<void>` and a `postCallback` dep.

- [ ] **Step 1 — failing tests:** (a) `callback.spec.ts`: `postBioCallback({ url, jobToken, result }, fetchFn)` POSTs to `url` with JSON body `{ jobToken, result }` and `content-type: application/json`; a non-ok/throwing `fetchFn` does NOT throw (best-effort, logged). (b) `handler.spec.ts`: `lambdaHandler(event, makeDeps({ postCallback: spy }))` with `event.callbackUrl` + `event.jobToken` present calls `postCallback` with `{ url: callbackUrl, jobToken, result: { ok: true, data } }`; with NO `callbackUrl` it does NOT call `postCallback` (synchronous/fake invoke path).

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement `bio-generator/src/callback.ts`** (reuse `fetchWithRetry` from `lib/http.ts` for 429/503 backoff; global `fetch` is available on nodejs24):

```ts
import { fetchWithRetry } from './lib/http';
import { logEvent, toErrorMessage } from './lib/log'; // match the file's actual log helpers
import type { BioGenerationResult } from './types';

export interface BioCallbackPayload {
  url: string;
  jobToken: string;
  result: BioGenerationResult;
}

/**
 * Best-effort POST of the generation result back to the web app's callback.
 * Never throws — the result was already produced; a failed callback just leaves
 * the web app to time the job out and let a retrigger supersede it.
 */
export const postBioCallback = async (
  { url, jobToken, result }: BioCallbackPayload,
  fetchFn: typeof fetch = fetch
): Promise<void> => {
  try {
    await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobToken, result }),
      },
      { fetchFn }
    );
  } catch (err) {
    logEvent('warn', 'bio_callback_failed', { error: toErrorMessage(err) });
  }
};
```

- [ ] **Step 4 — wire the dep + fire it.** Add `postCallback: (payload: BioCallbackPayload) => Promise<void>` to `BioGeneratorDeps`, wire `postCallback: postBioCallback` in `defaultDeps`, and default it in `makeDeps` as `vi.fn().mockResolvedValue(undefined)`. Thread `deps` into `lambdaHandler` (add `deps: BioGeneratorDeps = defaultDeps` as a second param). After building the result envelope (both the `{ ok: true, data }` and the caught `{ ok: false, error }` branches), fire:

```ts
const { callbackUrl, jobToken } = parsed.data;
if (callbackUrl && jobToken) {
  await deps.postCallback({ url: callbackUrl, jobToken, result });
}
return result;
```

(Restructure `lambdaHandler` so both success and error paths assign a `result` variable, then the single callback+return runs once. Keep complexity ≤ 10 — extract a small `finishHandler(parsed.data, result, deps)` helper if needed.)

- [ ] **Step 5 — run, watch pass; gate Lambda workspace; commit:** `feat: ✨ lambda posts result to async callback`

---

## Task B10: Callback-URL config + docs

**Files:**

- Modify: `src/lib/services/bio-generation-service.ts` (finalize `buildBioCallbackUrl`)
- Modify: `src/lib/config/env-validation.ts` (register the base-URL var if validated there; do NOT hardcode values)
- Create/Modify: a short doc note under `docs/auto-generated/` describing the new env + that NO secret is needed (per-job token)

- [ ] **Step 1 — failing test:** `buildBioCallbackUrl('artist-1')` returns `https://<base>/api/artists/artist-1/bio-generation/callback` when the base-URL env is set, and `null` when it is unset. (Use `vi.stubEnv`.)

- [ ] **Step 2 — run, watch fail.**

- [ ] **Step 3 — implement.** Determine the canonical public base-URL env already used server-side (grep for `NEXT_PUBLIC_BASE_URL` / the auth `buildAuthBaseURL` / `getApiBaseUrl` — reuse the existing one; do not invent a new var unless none is suitable, in which case add `BIO_GENERATOR_CALLBACK_BASE_URL`). Implement:

```ts
const buildBioCallbackUrl = (artistId: string): string | null => {
  const base = process.env.NEXT_PUBLIC_BASE_URL; // or the confirmed canonical public origin
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/artists/${artistId}/bio-generation/callback`;
};
```

- [ ] **Step 4 — docs.** Write `docs/auto-generated/2026-07-05-bio-async-callback-config.md`: the invoke is now `Event`; the Lambda POSTs `{ jobToken, result }` to the derived callback URL; auth is a per-job token (no SSM param, no GitHub/shared secret); the only new/required config is the public base URL (name it) so the Lambda can reach the app; `STALE_JOB_MS` is 17 min; the fake path is unchanged.

- [ ] **Step 5 — run, watch pass; gate + commit:** `feat: ✨ derive bio callback url from base env`

---

## Self-Review

**Spec coverage (design → plan):**

- Targeted queries → A1. Fixed 1-level link-follow (Bandcamp/Discogs) → A2. Both feed `acc.scrapedImages` → vision gate (Global Constraints).
- Event invoke → B6. Per-job token (store/pass/echo/match/clear, no stored secret) → B1/B2/B3/B6/B7. Callback route → B7. Persist reuse → B4. Fake path stays sync → B6. `STALE_JOB_MS` fix → B8. Audit relocation → B8. Lambda callback POST → B9. Config/derived URL → B10. Lockstep schemas → B3.

**Placeholder scan:** new files carry full code; edits carry the exact new lines + a `file:line` anchor. Two callouts where the plan says "match the current code verbatim" (B4 `replaceBioContent` field names; A2 `MetadataAccumulator` field names) are explicit instructions to confirm the existing names, not placeholders — the implementer reads those specific lines.

**Type consistency:** `runGenerationJob`'s three-variant result is consumed identically in B7's mental model and B8's `runBioGenerationAfterResponse`. `bioGenerationCallbackSchema` (`{ jobToken, result }`) matches what B9's Lambda POSTs and B7's route parses. `bioJobToken` flows schema (B1) → repo (B2) → claim (B7). `callbackUrl`/`jobToken` are optional in BOTH input schemas (B3) so existing/fake invokes still validate.

**Risks flagged:**

- **Biggest test churn is B6** (every `generate`/`runGenerationJob`/`generateForArtist` test changes contract). Budget for it; keep the fake-path tests as the E2E-representative coverage.
- **Real async path is unmockable end-to-end locally** — B6/B7/B9 are unit-verified; first true validation is a prod regen watched via the poll. Called out in the PR body.
- **Forged-callback DoS avoided** by NOT clearing the token on mismatch (B7 `verifyAndClaimCallback`).
- **Duplicate/late callbacks** are dropped by the single-use token + `processing` guard; a persist is idempotent (full replace) if one still slips through.
- **Ops before prod works:** the public base-URL env must be set so the Lambda can reach the app; there is no new secret to provision (per-job token). Documented in B10.
