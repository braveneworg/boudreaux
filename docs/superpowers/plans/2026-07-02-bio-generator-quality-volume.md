# Bio Generator Quality + Volume (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground bio generation in the artist's own DB facts (full name incl. middle name, birth/death/formed dates), add fact-check + plagiarism passes, reverse the listening-service link ban, widen link/image discovery to quality-gated caps (50/30), richer list/emphasis formatting, and keep attribution through a thumbnail-only re-host at generation.

**Architecture:** All heavy work lives in the `bio-generator/` Lambda workspace (pure modules + DI via `BioGeneratorDeps`). A minimal app-side sliver widens the mirrored contract, removes the sanitizer's listening-service strip, switches generation-time re-hosting to a single thumbnail, and stops discarding attribution — so the Lambda can deploy without breaking the app.

**Tech Stack:** TypeScript 6 strict, zod 4, Vitest 4, hand-rolled fetch (Lambda), Prisma 6 + MongoDB, sharp, sanitize-html (app).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-bio-palettes-editor-dnd-design.md` — decisions 1–4, 6, 8 apply to this PR.
- TDD: failing test first, then implement. `describe/it/expect/vi` are globals — never import from `vitest`. Server-only app specs need `vi.mock('server-only', () => ({}))`.
- Arrow functions only; named exports only; no `any`; no non-null `!`; no lint/type suppressions. MPL header from `HEADER.txt` on every new file.
- Conventional Commits + gitmoji, header ≤50 chars total, body lines ≤72. Never commit to main. No AI attribution lines.
- Lambda tests: `cd bio-generator && pnpm run test -- --run` (or `pnpm --dir bio-generator exec vitest run`). App gate: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- 50 links / 30 images are CAPS after quality gates, never padded targets.
- The LLM never receives or produces real image/link URLs beyond the provided reference list; images stay `<img src="image:N">` placeholders.
- Gemini budget: drafts (parallel) + synthesis + critic + repair = ≤5 calls; critic/repair use `retries: 1` so the worst case stays inside the 900s Lambda timeout; both degrade gracefully (log + return prior prose).

---

### Task 1: Lambda input facts — bornOn/diedOn/formedOn + fuller names

**Files:**

- Modify: `bio-generator/src/types.ts` (input schema + `ArtistFacts`)
- Modify: `bio-generator/src/gemini.ts` (fact lines + authoritative-date constraint)
- Modify: `bio-generator/src/handler.ts` (facts wiring)
- Test: `bio-generator/src/types.spec.ts`, `bio-generator/src/gemini.spec.ts`, `bio-generator/src/handler.spec.ts` (existing files — add cases)

**Interfaces:**

- Produces: `bioGenerationInputSchema` gains `bornOn?: string`, `diedOn?: string`, `formedOn?: string` (ISO `YYYY-MM-DD` strings, zod `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`); `ArtistFacts` gains the same three optional string fields. Tasks 4 and 10 rely on `facts.bornOn`.

- [ ] **Step 1: Write failing tests**

In `types.spec.ts`: input parses with/without the new fields, rejects `bornOn: '1949'` (bad format). In `gemini.spec.ts` (prompt-content assertions on `buildUserPrompt` output — the existing spec pattern calls `generateProse` with a mocked fetch and inspects the request body):

```ts
it('includes authoritative birth/formed dates and the never-before-birth rule', async () => {
  const facts = baseFacts({ bornOn: '1982-05-01', formedOn: '2004-01-01' });
  const { systemPrompt, userPrompt } = await capturePrompts(facts);
  expect(userPrompt).toContain('Born: 1982-05-01');
  expect(userPrompt).toContain('Formed: 2004-01-01');
  expect(systemPrompt).toContain('born 1982-05-01');
  expect(systemPrompt).toMatch(/never state or imply.*before/i);
});
```

In `handler.spec.ts`: `runBioGeneration` forwards `input.bornOn` into the facts handed to `generateProse`.

- [ ] **Step 2: Run tests, verify they fail** — `pnpm --dir bio-generator exec vitest run src/types.spec.ts src/gemini.spec.ts src/handler.spec.ts`

- [ ] **Step 3: Implement**

`types.ts`: add to `bioGenerationInputSchema`:

```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
// inside bioGenerationInputSchema:
bornOn: isoDate.optional(),
diedOn: isoDate.optional(),
formedOn: isoDate.optional(),
```

`ArtistFacts`: add `bornOn?: string; diedOn?: string; formedOn?: string;` with a doc note: "Authoritative dates from the label's own database — they outrank MusicBrainz life-span."

`gemini.ts`: in `factLines`, after `activeYears(facts)`:

```ts
labeledLine('Born (authoritative)', facts.bornOn),
labeledLine('Died (authoritative)', facts.diedOn),
labeledLine('Formed (authoritative)', facts.formedOn),
```

In `buildSystemPrompt` (and `buildSynthesisSystemPrompt`), append when present:

```ts
const authoritativeDateLine = (facts: ArtistFacts): string => {
  if (!facts.bornOn) return '';
  return (
    `AUTHORITATIVE FACT: the artist was born ${facts.bornOn}. This outranks any other source. ` +
    'NEVER state or imply the artist was active, performing, recording, or releasing work before this date.'
  );
};
```

Include `authoritativeDateLine(facts)` in both system prompt arrays (filtered when empty via `.filter(Boolean)` before `.join(' ')`).

`handler.ts` `gatherMetadata`: add `bornOn: input.bornOn, diedOn: input.diedOn, formedOn: input.formedOn` to the initial `acc.facts`.

- [ ] **Step 4: Run tests, verify pass** — same command as Step 2.
- [ ] **Step 5: Commit** — `git add bio-generator/src && git commit -m "feat(bio-generator): ✨ authoritative date facts"`

---

### Task 2: `plagiarism.ts` — shingle-overlap detector (pure)

**Files:**

- Create: `bio-generator/src/plagiarism.ts`
- Test: `bio-generator/src/plagiarism.spec.ts`

**Interfaces:**

- Produces: `findPlagiarizedSegments(output: string, sources: string[], shingleSize?: number): PlagiarismSegment[]` where `PlagiarismSegment = { text: string }` (normalized overlapping run). Task 4 consumes it.

- [ ] **Step 1: Write failing tests** (`plagiarism.spec.ts`, MPL header, no vitest imports)

```ts
import { findPlagiarizedSegments } from './plagiarism.js';

const SOURCE =
  'Ceschi Ramos is an American rapper and singer from New Haven Connecticut who co-founded the label Fake Four Inc with his brother David Ramos in 2008';

describe('findPlagiarizedSegments', () => {
  it('returns empty when output shares no 8-word run with sources', () => {
    expect(
      findPlagiarizedSegments('<p>A wholly original sentence about music.</p>', [SOURCE])
    ).toEqual([]);
  });

  it('flags a copied run and merges overlapping shingles into one segment', () => {
    const output = `<p>He is <strong>an American rapper and singer from New Haven Connecticut who co-founded</strong> things.</p>`;
    const segments = findPlagiarizedSegments(output, [SOURCE]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe(
      'an american rapper and singer from new haven connecticut who co founded'
    );
  });

  it('ignores markup, case, and punctuation when matching', () => {
    const output =
      '<p>An AMERICAN rapper, and singer — from New Haven, Connecticut who co-founded!</p>';
    expect(findPlagiarizedSegments(output, [SOURCE])).toHaveLength(1);
  });

  it('returns empty when sources are empty', () => {
    expect(findPlagiarizedSegments('anything at all here now and then some more', [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --dir bio-generator exec vitest run src/plagiarism.spec.ts` (module not found)
- [ ] **Step 3: Implement** (`plagiarism.ts`, MPL header)

```ts
/** Sliding-window size: 8 consecutive normalized words shared with a source
 * marks copied phrasing — long enough to skip idioms, short enough to catch
 * lifted sentences. */
const DEFAULT_SHINGLE_SIZE = 8;

export interface PlagiarismSegment {
  /** The normalized overlapping run, for the repair prompt to target. */
  text: string;
}

/** Strips tags, lowercases, drops punctuation, splits to words. */
const normalizeWords = (text: string): string[] =>
  text
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

const shingleAt = (words: string[], start: number, size: number): string =>
  words.slice(start, start + size).join(' ');

/**
 * Finds runs of the output that reproduce `shingleSize` consecutive words from
 * any source text. Overlapping/adjacent matches merge into one segment.
 */
export const findPlagiarizedSegments = (
  output: string,
  sources: string[],
  shingleSize: number = DEFAULT_SHINGLE_SIZE
): PlagiarismSegment[] => {
  const sourceShingles = new Set<string>();
  for (const source of sources) {
    const words = normalizeWords(source);
    for (let i = 0; i + shingleSize <= words.length; i += 1) {
      sourceShingles.add(shingleAt(words, i, shingleSize));
    }
  }
  if (!sourceShingles.size) return [];

  const words = normalizeWords(output);
  const segments: PlagiarismSegment[] = [];
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i + shingleSize <= words.length; i += 1) {
    if (sourceShingles.has(shingleAt(words, i, shingleSize))) {
      if (runStart === -1) runStart = i;
      runEnd = i + shingleSize;
    } else if (runStart !== -1 && i >= runEnd) {
      segments.push({ text: words.slice(runStart, runEnd).join(' ') });
      runStart = -1;
    }
  }
  if (runStart !== -1) segments.push({ text: words.slice(runStart, runEnd).join(' ') });
  return segments;
};
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ shingle plagiarism check"`

---

### Task 3: Gemini critic + revise calls (`critiqueProse`, `reviseProse`)

**Files:**

- Modify: `bio-generator/src/types.ts` (critique schema)
- Modify: `bio-generator/src/gemini.ts` (generic JSON core + two new calls)
- Test: `bio-generator/src/gemini.spec.ts`

**Interfaces:**

- Produces (Task 4 consumes):
  - `bioCritiqueSchema` in types.ts: `{ violations: Array<{ location: 'shortBio'|'longBio'|'altBio'; quote: string; issue: string }> }`; export `BioCritique`, `BioCritiqueViolation`.
  - `critiqueProse({ facts, prose, suspectYears, apiKey, model }: CritiqueProseArgs, options?): Promise<BioCritique>`
  - `reviseProse({ facts, prose, violations, plagiarizedSegments, apiKey, model }: ReviseProseArgs, options?): Promise<BioProse>`

- [ ] **Step 1: Write failing tests** (mock fetch returning canned Gemini JSON; existing spec has the helper pattern)

```ts
it('critiqueProse posts bios + suspect years and validates the violations JSON', async () => {
  const fetchFn = geminiFetchStub({
    violations: [{ location: 'longBio', quote: 'began in 1949', issue: 'precedes birth (1982)' }],
  });
  const result = await critiqueProse(
    {
      facts: baseFacts({ bornOn: '1982-05-01' }),
      prose: fakeProse,
      suspectYears: [1949],
      apiKey: 'k',
      model: 'm',
    },
    { fetchFn }
  );
  expect(result.violations).toHaveLength(1);
  const body = JSON.parse(fetchFn.mock.calls[0][1].body);
  expect(body.contents[0].parts[0].text).toContain('1949');
  expect(body.generationConfig.temperature).toBe(0.2);
});

it('reviseProse posts violations + plagiarized segments and returns full prose', async () => {
  const fetchFn = geminiFetchStub(fakeProse);
  const revised = await reviseProse(
    {
      facts: baseFacts({}),
      prose: fakeProse,
      violations: [v],
      plagiarizedSegments: [{ text: 'copied run here' }],
      apiKey: 'k',
      model: 'm',
    },
    { fetchFn }
  );
  expect(revised.longBio).toBe(fakeProse.longBio);
  const text = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
  expect(text).toContain('copied run here');
  expect(text).toMatch(/rewrite only/i);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

`types.ts`:

```ts
export const bioCritiqueViolationSchema = z.object({
  location: z.enum(['shortBio', 'longBio', 'altBio']),
  quote: z.string().min(1),
  issue: z.string().min(1),
});
export type BioCritiqueViolation = z.infer<typeof bioCritiqueViolationSchema>;
export const bioCritiqueSchema = z.object({ violations: z.array(bioCritiqueViolationSchema) });
export type BioCritique = z.infer<typeof bioCritiqueSchema>;
```

`gemini.ts` — refactor `parseProse`/`requestProse` into a schema-generic core (keep behavior identical):

```ts
const parseJsonContent = (body: GeminiResponse): unknown => {
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini returned an empty completion');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Gemini returned non-JSON content');
  }
};

const requestJson = async <T>(
  schema: { parse: (value: unknown) => T },
  { systemPrompt, userPrompt, apiKey, model, temperature }: ProseRequest,
  options: FetchRetryOptions = {}
): Promise<T> => {
  const response = await fetchWithRetry(/* unchanged fetch block */);
  if (!response.ok) throw new Error(await failureMessage(response));
  return schema.parse(parseJsonContent((await response.json()) as GeminiResponse));
};

const requestProse = (request: ProseRequest, options: FetchRetryOptions = {}): Promise<BioProse> =>
  requestJson(bioProseSchema, request, options);
```

New calls (both use `retries: 1` by default so quality passes can't blow the timeout — callers may override):

```ts
const CRITIC_TEMPERATURE = 0.2;
const REVISE_TEMPERATURE = 0.4;
const QUALITY_PASS_RETRIES = 1;

export interface CritiqueProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  suspectYears: number[];
  apiKey: string;
  model?: string;
}

export const critiqueProse = async (
  { facts, prose, suspectYears, apiKey, model = DEFAULT_GEMINI_MODEL }: CritiqueProseArgs,
  options: FetchRetryOptions = {}
): Promise<BioCritique> =>
  requestJson(
    bioCritiqueSchema,
    {
      systemPrompt: [
        'You are a meticulous fact-checker for artist biographies. Compare the bios against the',
        'verified facts and source material. Report ONLY concrete violations: claims contradicted',
        'by the facts, dates preceding the authoritative birth/formation dates, or claims with no',
        'support in the source material. An empty violations array is the correct answer for clean',
        'bios. Respond with a single JSON object and nothing else.',
      ].join(' '),
      userPrompt: [
        ...factLines(facts),
        '',
        sourceMaterialLine(facts),
        '',
        suspectYears.length
          ? `SUSPECT YEARS (earlier than the artist's authoritative birth date — verify each): ${suspectYears.join(', ')}`
          : '',
        `BIOS (JSON): ${JSON.stringify(prose)}`,
        '',
        'Return JSON: {"violations": [{"location": "shortBio"|"longBio"|"altBio", "quote": "exact offending text", "issue": "why it is wrong"}]}',
      ]
        .filter(Boolean)
        .join('\n'),
      apiKey,
      model,
      temperature: CRITIC_TEMPERATURE,
    },
    { retries: QUALITY_PASS_RETRIES, ...options }
  );

export interface ReviseProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  violations: BioCritiqueViolation[];
  plagiarizedSegments: Array<{ text: string }>;
  apiKey: string;
  model?: string;
}

export const reviseProse = async (
  {
    facts,
    prose,
    violations,
    plagiarizedSegments,
    apiKey,
    model = DEFAULT_GEMINI_MODEL,
  }: ReviseProseArgs,
  options: FetchRetryOptions = {}
): Promise<BioProse> =>
  requestJson(
    bioProseSchema,
    {
      systemPrompt: [
        buildSystemPrompt(facts),
        'You are repairing existing bios, not writing new ones.',
      ].join(' '),
      userPrompt: [
        ...factLines(facts),
        '',
        referenceUrlsLine(referenceUrls(facts)),
        '',
        `CURRENT BIOS (JSON): ${JSON.stringify(prose)}`,
        violations.length
          ? `FACT VIOLATIONS to fix:\n${violations.map((v) => `- [${v.location}] "${v.quote}" — ${v.issue}`).join('\n')}`
          : '',
        plagiarizedSegments.length
          ? `PLAGIARIZED PHRASING to reword in fresh words:\n${plagiarizedSegments.map((s) => `- "${s.text}"`).join('\n')}`
          : '',
        'Rewrite ONLY the affected sentences; keep everything else verbatim, including every inline',
        '<a> link and <img src="image:N"> placeholder. Return the FULL corrected JSON.',
        '',
        ...OUTPUT_SPEC_LINES,
      ]
        .filter(Boolean)
        .join('\n'),
      apiKey,
      model,
      temperature: REVISE_TEMPERATURE,
    },
    { retries: QUALITY_PASS_RETRIES, ...options }
  );
```

- [ ] **Step 4: Run gemini spec, verify pass (including untouched existing cases).**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ critic and revise passes"`

---

### Task 4: `factcheck.ts` — year gate + quality-pass orchestration, wired into handler

**Files:**

- Create: `bio-generator/src/factcheck.ts`
- Modify: `bio-generator/src/handler.ts` (deps + `runBioGeneration` wiring)
- Test: `bio-generator/src/factcheck.spec.ts`, `bio-generator/src/handler.spec.ts`

**Interfaces:**

- Produces: `findYearsBeforeBirth(html: string, birthYear: number): number[]`; `runQualityPasses(args: QualityPassArgs, deps: QualityPassDeps): Promise<BioProse>` with `QualityPassArgs = { prose, facts, apiKey, model }`, `QualityPassDeps = { critiqueProse, reviseProse }`.
- Consumes: Task 2's `findPlagiarizedSegments`, Task 3's `critiqueProse`/`reviseProse`.
- `BioGeneratorDeps` gains `critiqueProse: typeof critiqueProse` and `reviseProse: typeof reviseProse`.

- [ ] **Step 1: Write failing tests** (`factcheck.spec.ts`)

```ts
describe('findYearsBeforeBirth', () => {
  it('flags years earlier than the birth year, deduped and sorted', () => {
    expect(
      findYearsBeforeBirth('<p>Began in 1949, again 1949, then 1990 and 2004.</p>', 1982)
    ).toEqual([1949]);
  });
  it('returns empty when all years are on/after birth', () => {
    expect(findYearsBeforeBirth('<p>Born 1982, debut 2004.</p>', 1982)).toEqual([]);
  });
});

describe('runQualityPasses', () => {
  it('returns prose untouched when critic finds nothing and no plagiarism', async () => {
    const deps = {
      critiqueProse: vi.fn().mockResolvedValue({ violations: [] }),
      reviseProse: vi.fn(),
    };
    const result = await runQualityPasses(
      { prose, facts: factsWithSource, apiKey: 'k', model: 'm' },
      deps
    );
    expect(result).toBe(prose);
    expect(deps.reviseProse).not.toHaveBeenCalled();
  });
  it('revises when the critic reports violations', async () => {
    /* reviseProse called with violations, returns revised */
  });
  it('revises on plagiarized segments even when critic passes', async () => {
    /* sourceText engineered to overlap prose */
  });
  it('returns original prose when critic throws', async () => {
    /* critiqueProse rejects → prose returned, no throw */
  });
  it('returns original prose when revise throws', async () => {
    /* reviseProse rejects → prose returned */
  });
});
```

`handler.spec.ts`: `runBioGeneration` calls the quality passes with the generated prose and returns the revised prose's bios.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (`factcheck.ts`, MPL header)

```ts
import { logEvent, toErrorMessage } from './lib/log.js';
import { findPlagiarizedSegments } from './plagiarism.js';

import type { critiqueProse, reviseProse } from './gemini.js';
import type { ArtistFacts, BioCritiqueViolation, BioProse } from './types.js';

const YEAR_PATTERN = /\b(1[89]\d\d|20\d\d)\b/g;

/** Distinct years in the text strictly earlier than the birth year, ascending. */
export const findYearsBeforeBirth = (html: string, birthYear: number): number[] => {
  const years = new Set<number>();
  for (const match of html.matchAll(YEAR_PATTERN)) {
    const year = Number(match[1]);
    if (year < birthYear) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
};

export interface QualityPassArgs {
  prose: BioProse;
  facts: ArtistFacts;
  apiKey: string;
  model: string;
}

export interface QualityPassDeps {
  critiqueProse: typeof critiqueProse;
  reviseProse: typeof reviseProse;
}

/**
 * Post-generation quality gate: deterministic year screen + programmatic
 * plagiarism screen feed one critic pass; any finding triggers a single repair
 * pass. Both remote passes degrade gracefully — a failure returns the prose
 * unchanged rather than costing the artist their bio.
 */
export const runQualityPasses = async (
  { prose, facts, apiKey, model }: QualityPassArgs,
  deps: QualityPassDeps
): Promise<BioProse> => {
  const combined = [prose.shortBio, prose.longBio, prose.altBio].join('\n');
  const birthYear = facts.bornOn ? Number(facts.bornOn.slice(0, 4)) : null;
  const suspectYears = birthYear ? findYearsBeforeBirth(combined, birthYear) : [];
  const plagiarizedSegments = findPlagiarizedSegments(
    combined,
    facts.sourceText ? [facts.sourceText] : []
  );

  let violations: BioCritiqueViolation[] = [];
  try {
    ({ violations } = await deps.critiqueProse({ facts, prose, suspectYears, apiKey, model }));
  } catch (err) {
    logEvent('warn', 'critic_pass_failed', { error: toErrorMessage(err) });
  }

  logEvent('info', 'quality_passes', {
    suspectYears: suspectYears.length,
    plagiarizedSegments: plagiarizedSegments.length,
    violations: violations.length,
  });
  if (!violations.length && !plagiarizedSegments.length) return prose;

  try {
    return await deps.reviseProse({ facts, prose, violations, plagiarizedSegments, apiKey, model });
  } catch (err) {
    logEvent('warn', 'repair_pass_failed', { error: toErrorMessage(err) });
    return prose;
  }
};
```

`handler.ts`: import `critiqueProse, reviseProse` from `./gemini.js` and `runQualityPasses` from `./factcheck.js`; add both call functions to `BioGeneratorDeps` + `defaultDeps`; in `runBioGeneration` after `generateProse`:

```ts
const prose = await deps.generateProse(facts, apiKey, model);
const checked = await runQualityPasses(
  { prose, facts, apiKey, model },
  { critiqueProse: deps.critiqueProse, reviseProse: deps.reviseProse }
);
```

…and use `checked` everywhere `prose` was used below.

- [ ] **Step 4: Run lambda suite, verify pass** — `pnpm --dir bio-generator exec vitest run`
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ fact-check quality gate"`

---

### Task 5: Link reversal, classification, labels, caps

**Files:**

- Modify: `bio-generator/src/types.ts` (`bioLinkSchema` kind += `'streaming'`)
- Modify: `bio-generator/src/listening-services.ts` (doc comment: now classification, not a ban)
- Modify: `bio-generator/src/musicbrainz.ts` (streaming relations kept)
- Modify: `bio-generator/src/jina.ts` (result titles surfaced; second query support)
- Modify: `bio-generator/src/handler.ts` (finalize: classify instead of drop; junk filter; `MAX_LINKS = 50`; second search)
- Test: matching `.spec.ts` files

**Interfaces:**

- Produces: `BioLink['kind']` now `'wikipedia'|'official'|'musicbrainz'|'social'|'streaming'|'other'`. `WebSearchSources` gains `references: Array<{ url: string; title: string | null }>`. `searchArtistSources(artistName, apiKey?, fetchFn?, options?, query?)` gains an optional final `query` override. Task 8 mirrors the kind enum app-side.

- [ ] **Step 1: Write failing tests**

- `musicbrainz.spec.ts`: a lookup response with `relations: [{ type: 'streaming', url: { resource: 'https://open.spotify.com/artist/x' } }, { type: 'free streaming', url: { resource: 'https://artist.bandcamp.com' } }]` yields links with `kind: 'streaming'`.
- `jina.spec.ts`: `searchArtistSources` returns `references` `[{ url, title }]` using each result's `title` (null when missing); passing a custom `query` changes the request URL.
- `handler.spec.ts`:
  - streaming links survive `finalizeMetadata` with `kind: 'streaming'` (a Spotify link from MB relations appears in output links);
  - `facts.sourceUrls` are no longer filtered of listening services;
  - Jina references produce links labeled with the page title, falling back to `'Reference'`;
  - links from a search-engine host (`https://www.google.com/search?q=x`) are dropped;
  - 60 unique candidate links are capped to 50.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

`types.ts`:

```ts
kind: z.enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'other']).optional(),
```

`musicbrainz.ts` — `classifyRelation` + `collectRelations`:

```ts
const STREAMING_RELATION_TYPES = new Set(['streaming', 'free streaming', 'purchase for download']);

const classifyRelation = (type: string): BioLink['kind'] => {
  if (type === 'wikipedia') return 'wikipedia';
  if (type === 'official homepage') return 'official';
  if (type === 'social network') return 'social';
  if (STREAMING_RELATION_TYPES.has(type)) return 'streaming';
  return 'other';
};
```

…and in `collectRelations`, include `kind === 'streaming'` in the push condition. Label streaming links by host (`new URL(resource).hostname.replace(/^www\./, '')`) instead of the raw relation type so the palette shows "open.spotify.com" / "artist.bandcamp.com", not "streaming".

`jina.ts` — in `searchArtistSources`, keep `title` through the mapping and return it:

```ts
const references = results.map((result) => ({
  url: result.url,
  title: result.title?.trim() || null,
}));
// include title in the intermediate map alongside url/text/images
return { sourceText, sourceUrls, references, images };
```

Add the optional `query` parameter (default preserves today's query):

```ts
export const searchArtistSources = async (
  artistName: string,
  apiKey?: string | null,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {},
  query: string = `${artistName} musician biography career discography`
): Promise<WebSearchSources | null> => {
  /* use `query` in the URL */
};
```

(Keep the existing listening-service filter on _image_ collection — streaming pages flood the summary with album art, which is an image-quality gate, not a link ban.)

`handler.ts`:

```ts
const MAX_LINKS = 50;

/** Search-engine result pages and share widgets — never useful bio links. */
const JUNK_LINK_HOSTS = ['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com'];
const isJunkLinkUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return JUNK_LINK_HOSTS.some((junk) => host === junk || host.endsWith(`.${junk}`));
  } catch {
    return true;
  }
};
```

`applyWebSearch`: run TWO searches (default query + press variant), merging results; build links from `references`:

```ts
const queries: Array<string | undefined> = [
  undefined,
  `${searchNameFor(input)} musician interview review press`,
];
for (const query of queries) {
  const found = await deps.searchArtistSources(
    searchNameFor(input),
    scrapeKey,
    undefined,
    {},
    query
  );
  if (!found) continue;
  acc.facts.sourceText = appendSourceText(acc.facts.sourceText, found.sourceText);
  acc.scrapedImages.push(...found.images);
  acc.facts.sourceUrls = [
    /* existing union, plus found.sourceUrls */
  ];
  for (const ref of found.references) {
    acc.links.push({ label: ref.title ?? 'Reference', url: ref.url, kind: 'other' });
  }
}
```

(Adjust the `searchArtistSources` call signature accordingly — when `query` is `undefined` the default applies. Update the existing empty/results logging to run per query.)

`finalizeMetadata` — classify, gate, cap; stop filtering `sourceUrls`:

```ts
acc.links = dedupeLinks(acc.links)
  .filter((link) => !isJunkLinkUrl(link.url))
  .map((link) => (isListeningServiceUrl(link.url) ? { ...link, kind: 'streaming' as const } : link))
  .slice(0, MAX_LINKS);
applyScrapedImageFallback(acc);
```

(Remove the `sourceUrls` listening-service filter line entirely; update `listening-services.ts`'s doc comment to say it now classifies streaming links and gates scraped-image collection, no longer bans links.)

Also delete the two streaming-ban lines from `SHARED_CONSTRAINT_LINES` in `gemini.ts` (`'NEVER link to streaming…'` through `'…or the label.'`) — the reversal must reach the prompt too. Keep the no-link-list and img-placeholder lines. Update `gemini.spec.ts` assertions accordingly.

- [ ] **Step 4: Run lambda suite, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ streaming links, 50 cap"`

---

### Task 6: Image volume — merge Commons + scraped, cap 30, alt fallback

**Files:**

- Modify: `bio-generator/src/handler.ts`, `bio-generator/src/jina.ts` (`MAX_SCRAPED_IMAGES`)
- Test: `bio-generator/src/handler.spec.ts`, `bio-generator/src/jina.spec.ts`

**Interfaces:**

- Produces: up to 30 `BioImage`s; Commons (licensed) always ranked first; every `imageTitles` entry non-empty.

- [ ] **Step 1: Write failing tests**
  - handler: with 2 Commons images and 5 scraped candidates, output has 7 images (Commons first, scraped deduped-by-URL after, alt-titled scraped ranked before untitled);
  - handler: 40 candidates cap to 30;
  - handler: `facts.imageTitles` entries are never empty — untitled images fall back to `Photo of {displayName}`;
  - jina: more than 12 plausible images are no longer truncated at 12 (new cap 20 per call).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

`jina.ts`: `const MAX_SCRAPED_IMAGES = 20;`

`handler.ts`: `const MAX_IMAGES = 30;` and replace `applyScrapedImageFallback` with an always-merge:

```ts
/**
 * Merges web-scraped candidates AFTER the licensed Commons images (which always
 * rank first), deduped by URL, up to MAX_IMAGES. Alt-titled candidates rank
 * before untitled ones — a named image is likelier to actually depict the artist.
 */
const applyScrapedImages = (acc: MetadataAccumulator): void => {
  if (!acc.scrapedImages.length) return;
  const seen = new Set(acc.images.map((image) => image.url.toLowerCase()));
  const ranked = [...acc.scrapedImages].sort(
    (a, b) => Number(Boolean(b.alt)) - Number(Boolean(a.alt))
  );
  for (const candidate of ranked) {
    if (acc.images.length >= MAX_IMAGES) break;
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    acc.images.push(toScrapedBioImage(candidate));
  }
  logEvent('info', 'scraped_images_merged', {
    candidates: acc.scrapedImages.length,
    total: acc.images.length,
  });
};
```

Call it from `finalizeMetadata` (replacing the fallback call) and set the alt fallback there:

```ts
acc.facts.imageTitles = acc.images.map(
  (image) => image.title?.trim() || `Photo of ${input.displayName}`
);
```

Keep `resolveImages`'s slice at `MAX_IMAGES` (Commons alone may now supply up to 30).

- [ ] **Step 4: Run lambda suite, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ merge scraped images, cap 30"`

---

### Task 7: Output-spec prompt — lists, links-first richer emphasis, italics

**Files:**

- Modify: `bio-generator/src/gemini.ts` (`OUTPUT_SPEC_LINES` only)
- Test: `bio-generator/src/gemini.spec.ts` (prompt-content assertions)

- [ ] **Step 1: Write failing tests** — the user prompt: (a) requires at least one list in the long bio; (b) instructs italicizing work titles; (c) keeps "prefer links over bold" while allowing bold for unlinkable key facts; (d) no longer contains any "streaming/listening service" prohibition.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — in `OUTPUT_SPEC_LINES`:
  - Delete every remaining `'…do NOT link to any streaming/listening service.'` clause (three occurrences: shortBio, longBio, altBio blocks) — keep the "no Sources/References section" wording.
  - Replace the longBio emphasis bullet (the `'- Prefer links over bold…'` block) with:

```ts
'- Prefer links over bold: when a key name or term is covered by a reference URL, make it an',
'  inline link instead of bolding it. ADDITIONALLY bold the pivotal unlinkable facts — key',
'  dates, release titles, collaborators, and turning points — with <strong> so they stand out',
'  when scanning, and italicize album/song/work titles with <em> wherever they appear.',
```

- Add a chunking bullet to the longBio block:

```ts
'- Chunk enumerable content into <ul>/<ol> lists for web readability: discographies, timelines,',
'  collaborator rosters, and similar runs of items belong in lists, not comma prose. Include at',
'  least one list in the long bio whenever the material supports it.',
```

- [ ] **Step 4: Run lambda suite, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio-generator): ✨ lists + richer emphasis"`

---

### Task 8: App contract widening + Prisma `originalUrl` + input fields

**Files:**

- Modify: `prisma/schema.prisma` (`ArtistBioImage` gains `originalUrl String?`)
- Modify: `src/lib/validation/bio-generation-schema.ts` (kind enum += `'streaming'`)
- Modify: `src/lib/services/bio-generation-fixture.ts` (`BioGenerationLambdaInput` gains `bornOn?/diedOn?/formedOn?: string`)
- Modify: `src/lib/services/bio-generation-service.ts` (`deriveRealName` incl. middleName; pass dates)
- Test: `src/lib/services/bio-generation-service.spec.ts` (existing; add cases)

**Interfaces:**

- Consumes: Lambda contract from Tasks 1/5. Produces: `ArtistBioImage.originalUrl` for PR 2's save-time full re-host.

- [ ] **Step 1: Write failing tests** (in `bio-generation-service.spec.ts`, mocking `BioGenerationService.generate`):

```ts
it('derives the real name including the middle name', async () => {
  // artist: { firstName: 'Julio', middleName: 'Francisco', surname: 'Ramos', isPseudonymous: false, bornOn: new Date('1982-05-01'), ... }
  await BioGenerationService.generateForArtist('id1');
  expect(generateSpy).toHaveBeenCalledWith(
    expect.objectContaining({ realName: 'Julio Francisco Ramos', bornOn: '1982-05-01' })
  );
});
it('omits dates the artist record does not have', async () => {
  /* bornOn undefined when null */
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm exec vitest run src/lib/services/bio-generation-service.spec.ts`
- [ ] **Step 3: Implement**

`prisma/schema.prisma`, inside `model ArtistBioImage` (next to `sourceUrl`):

```prisma
  /// Original external image URL, kept so save-time re-hosting can fetch the
  /// full-resolution source after the generation-time thumbnail pass.
  originalUrl String?
```

Run `pnpm exec prisma generate` (and `pnpm exec prisma db push` for the dev DB — additive nullable field, safe).

`bio-generation-schema.ts`:

```ts
kind: z.enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'other']).optional(),
```

`bio-generation-fixture.ts` input interface: add `bornOn?: string; diedOn?: string; formedOn?: string;`.

`bio-generation-service.ts`:

```ts
/** Derive a public real name for the metadata lookup (skip if pseudonymous). */
const deriveRealName = (artist: {
  firstName: string;
  middleName: string | null;
  surname: string;
  isPseudonymous: boolean;
}): string | undefined => {
  if (artist.isPseudonymous) return undefined;
  const realName = [artist.firstName, artist.middleName, artist.surname]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return realName || undefined;
};

/** YYYY-MM-DD for the Lambda's ISO-date fields, or undefined. */
const toIsoDate = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString().slice(0, 10) : undefined;
```

…and in `generateForArtist`'s `generate({ … })` call add:

```ts
bornOn: toIsoDate(artist.bornOn),
diedOn: toIsoDate(artist.diedOn),
formedOn: toIsoDate(artist.formedOn),
```

(Confirm `ArtistRepository.findById` returns `middleName`, `bornOn`, `diedOn`, `formedOn` — it returns the full Prisma model; if a narrowed select exists, widen it.)

- [ ] **Step 4: Run app tests for touched files, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio): ✨ widen contract, date inputs"`

---

### Task 9: Remove the app sanitizer's listening-service strip

**Files:**

- Modify: `src/lib/utils/sanitize-bio-html.ts` (`transformTags.a`)
- Modify: `src/lib/services/bio-generation-service.ts` (`sanitizeLinks` — drop the `isListeningServiceUrl` gate)
- Test: `src/lib/utils/sanitize-bio-html.spec.ts`, `src/lib/services/bio-generation-service.spec.ts`

- [ ] **Step 1: Write failing tests** — flip the existing "strips listening-service hrefs" specs:

```ts
it('keeps listening-service hrefs (product rule reversed 2026-07)', () => {
  const html = '<a href="https://open.spotify.com/artist/x">Spotify</a>';
  expect(sanitizeBioHtml(html)).toBe(
    '<a href="https://open.spotify.com/artist/x" rel="nofollow noopener noreferrer" target="_blank">Spotify</a>'
  );
});
```

…and in the service spec: a Bandcamp link in the Lambda result survives into persisted links.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

`sanitize-bio-html.ts` — `transformTags.a` becomes unconditional (delete the `isListeningServiceUrl` import and branch; update the header comment):

```ts
transformTags: {
  // Harden every link for the untrusted-content context; PR 2 branches this
  // by origin (internal links keep same-tab, no rel restrictions).
  a: (tagName, attribs) => ({
    tagName,
    attribs: { ...attribs, rel: 'nofollow noopener noreferrer', target: '_blank' },
  }),
},
```

`bio-generation-service.ts` `sanitizeLinks`: change the guard to `if (!url) return acc;` and remove the `isListeningServiceUrl` import. Keep `src/lib/utils/is-listening-service-url.ts` itself — PR 2 reuses it for `kind` styling; if `pnpm run lint` flags it as unused elsewhere, leave it (it has its own spec).

- [ ] **Step 4: Run touched specs, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio): ✨ allow streaming links"`

---

### Task 10: Thumbnail re-host at generation + attribution kept

**Files:**

- Modify: `src/lib/services/bio-image-service.ts` (shared fetch helper + `rehostThumbnail`)
- Modify: `src/lib/services/bio-generation-service.ts` (`rehostImages` uses thumbnails, keeps metadata)
- Modify: `src/lib/repositories/artist-repository.ts` (`replaceBioContent` image type + `getBioGenerationState` select gain `originalUrl`; check `bioImages` selects include `attribution`)
- Test: `src/lib/services/bio-image-service.spec.ts`, `src/lib/services/bio-generation-service.spec.ts`

**Interfaces:**

- Produces: `BioImageService.rehostThumbnail(sourceUrl: string, artistId: string, index: number): Promise<RehostedImage>` (same return shape as `rehostWithVariants`). `rehostWithVariants` is UNCHANGED — PR 2's save pipeline uses it.
- Persisted image rows now carry `attribution`, `license`, `sourceUrl`, `originalUrl`, and `thumbnailUrl` (= the thumb CDN URL; `url` also points at the thumb until PR 2 upgrades it on save).

- [ ] **Step 1: Write failing tests**

`bio-image-service.spec.ts` (mock fetch + S3 client + sharp per the file's existing pattern):

```ts
it('rehostThumbnail uploads a single 384px webp and returns its CDN URL', async () => {
  const result = await BioImageService.rehostThumbnail('https://ex.com/big.jpg', 'artist1', 0);
  expect(putObjectCalls).toHaveLength(1); // exactly one object — no variants
  expect(putObjectCalls[0].Key).toMatch(
    /^media\/artists\/artist1\/bio\/thumbs\/0-[a-f0-9]{8}\.webp$/
  );
  expect(putObjectCalls[0].ContentType).toBe('image/webp');
  expect(result.url).toContain('/media/artists/artist1/bio/thumbs/');
});
it('rehostThumbnail skips upload in fake/E2E mode and echoes the source URL', async () => {
  /* env stub */
});
```

`bio-generation-service.spec.ts`:

```ts
it('persists attribution, license, sourceUrl and originalUrl from the lambda result', async () => {
  // lambda image: { url: 'https://ext/img.jpg', attribution: 'Jane Doe', license: 'CC BY-SA 4.0', sourceUrl: 'https://page', ... }
  await BioGenerationService.generateForArtist('id1');
  expect(replaceBioContentSpy).toHaveBeenCalledWith(
    'id1',
    expect.objectContaining({
      images: [
        expect.objectContaining({
          attribution: 'Jane Doe',
          license: 'CC BY-SA 4.0',
          sourceUrl: 'https://page',
          originalUrl: 'https://ext/img.jpg',
          thumbnailUrl: expect.stringContaining('cdn'),
        }),
      ],
    })
  );
});
it('re-hosts via rehostThumbnail, not rehostWithVariants, at generation time', async () => {
  /* spy assertions */
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**

`bio-image-service.ts` — extract the shared fetch/validate block from `rehostWithVariants` into a private helper, then add:

```ts
const THUMBNAIL_WIDTH = 384;

const fetchImageBuffer = async (
  sourceUrl: string
): Promise<{ buffer: Buffer; contentType: string | null }> => {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`Source is not an image: ${contentType}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) throw new Error('Source image exceeds the 50MB limit');
  return { buffer: Buffer.from(arrayBuffer), contentType };
};
```

(`rehostWithVariants` now calls `fetchImageBuffer` — behavior identical.) New method:

```ts
/**
 * Fetches an external image and uploads ONE small webp thumbnail — the cheap
 * generation-time pass that keeps candidate palettes rendering from the CDN
 * (no hotlink 403s) without paying for full variants on images the admin may
 * dismiss. Save-time re-hosting upgrades kept images via rehostWithVariants.
 */
static async rehostThumbnail(
  sourceUrl: string,
  artistId: string,
  index: number
): Promise<RehostedImage> {
  if (shouldSkipRehost()) {
    return { url: sourceUrl, width: null, height: null };
  }
  const { buffer } = await fetchImageBuffer(sourceUrl);
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(buffer)
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const s3Key = `media/artists/${artistId}/bio/thumbs/${index}-${randomUUID().slice(0, 8)}.webp`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3BucketName(),
      Key: s3Key,
      Body: data,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return { url: buildCdnUrl(s3Key), width: info.width, height: info.height };
}
```

(Match the file's existing `sharp` import style — if `generateVariantsFromBuffer`'s module imports sharp statically, import statically here too.)

`bio-generation-service.ts` — `RehostedImage` local type widens (attribution/license/sourceUrl become `string | null`, add `originalUrl: string | null`, `thumbnailUrl: string | null`), and `rehostImages` becomes:

```ts
const rehostImages = async (
  images: BioGenerationData['images'],
  artistId: string
): Promise<Array<RehostedImage | null>> =>
  Promise.all(
    images.map(async (image, index) => {
      try {
        const { url, width, height } = await BioImageService.rehostThumbnail(
          image.url,
          artistId,
          index
        );
        return {
          url,
          thumbnailUrl: url,
          title: image.title ? sanitizeBioText(image.title) : null,
          attribution: image.attribution ? sanitizeBioText(image.attribution) : null,
          license: image.license ?? null,
          sourceUrl: image.sourceUrl ?? null,
          originalUrl: image.url,
          width: width ?? image.width ?? null,
          height: height ?? image.height ?? null,
          isPrimary: image.isPrimary,
        };
      } catch (error) {
        loggers.media.warn('Bio image re-host failed; dropping image', { error });
        return null;
      }
    })
  );
```

Update the comment above the call site (no longer "with sharp variants"). `artist-repository.ts`: widen `replaceBioContent`'s image input type with `originalUrl: string | null` (and attribution/license/sourceUrl if currently typed as `null`), and add `originalUrl: true` to the `bioImages` select in `getBioGenerationState` if it uses an explicit select. `GeneratedBioContent`/wire schema already carry attribution fields — no change needed there (assembleContent's strip of `width/height/sortOrder` keeps the rest).

Also update `bio-generation-fixture.ts`'s stale comment `// Lambda returns attribution metadata; the app drops it on re-host.` → `// Attribution metadata is kept through re-host (PR #547).`

- [ ] **Step 4: Run touched specs, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(bio): ✨ thumb rehost, keep attribution"`

---

### Task 11: Full gates, PR

- [ ] **Step 1: Lambda workspace** — `pnpm --dir bio-generator exec vitest run && pnpm --dir bio-generator exec tsc --noEmit`. Expected: all pass.
- [ ] **Step 2: App gates** — `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. Expected: clean; fix anything that isn't, amend into the relevant commit if trivial or add a `fix`/`test` commit.
- [ ] **Step 3: Coverage** — `pnpm run test:coverage:check`. Expected: no regression vs `COVERAGE_METRICS.md`.
- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/bio-generator-quality-and-volume
gh pr create --base main --title "feat(bio-generator): quality passes, streaming links, volume caps" --body "<summary of decisions 1-4,6,8 + verification notes + link to spec doc>"
```

- [ ] **Step 5: Post-merge manual verification (user-assisted)** — after auto-deploy, deploy the Lambda (existing SAM flow), regenerate a bio for an artist with a middleName and known bornOn (e.g. Ceschi): confirm no pre-birth years, streaming links present with descriptive labels, ≤50 links / ≤30 images, attribution populated on images, lists present in the long bio.
