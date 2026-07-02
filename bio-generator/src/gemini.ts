/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { bioCritiqueSchema, bioProseSchema, DEFAULT_GEMINI_MODEL } from './types.js';

import type { FetchRetryOptions } from './lib/http.js';
import type { ArtistFacts, BioCritique, BioCritiqueViolation, BioProse } from './types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Backoff between rate-limited attempts: 30s, doubling to 60s — the free-tier
 * Gemini quota window recovers on that scale, and a server `Retry-After` still
 * takes precedence. Two retries keep the ensemble worst case (parallel drafts
 * then synthesis: two sequential phases of three generations plus 90s of waits
 * each) inside the Lambda's 900s timeout.
 */
const GEMINI_RETRY_BASE_DELAY_MS = 30_000;
const GEMINI_RETRIES = 2;

/** Default sampling temperature for a single generation. */
const DEFAULT_TEMPERATURE = 0.6;

/**
 * Per-call knobs layered on the shared retry options: `temperature` varies
 * sampling between ensemble drafts and `styleDirective` appends a per-draft
 * emphasis (facts-first vs narrative-first) to the system prompt.
 */
export interface ProseRequestOptions extends FetchRetryOptions {
  temperature?: number;
  styleDirective?: string;
}

/** Cap on the response-body excerpt echoed into failure messages. */
const ERROR_BODY_SNIPPET_LENGTH = 300;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Allowed inline HTML in the bios — must stay within the web app's sanitizer
 * allowlist. Both semantic (`<strong>`/`<em>`) and presentational (`<b>`/`<i>`)
 * emphasis are permitted so no generated emphasis is ever stripped.
 */
const ALLOWED_TAGS =
  '<p>, <strong>, <b>, <em>, <i>, <ul>, <ol>, <li>, <a>, <img>, <h2>, <h3>, <h4>';

/**
 * Upper bound on completion length. Three bios (a ~2000–3500-word image-rich long
 * bio plus the short and promotional alt bios) need far more headroom than the
 * old 8192; this stays well within the Gemini Flash output ceiling.
 */
const MAX_OUTPUT_TOKENS = 16384;

/** Combines real and display names for the research persona line. */
const artistFullName = (facts: ArtistFacts): string =>
  facts.realName && facts.realName !== facts.displayName
    ? `${facts.realName} (${facts.displayName})`
    : facts.displayName;

/** Output constraints every prose call must obey, drafts and synthesis alike. */
const SHARED_CONSTRAINT_LINES = [
  'NEVER output a "Discovered Links", "Sources", "References", or link-list section anywhere.',
  'NEVER emit an <img> tag unless an Available images list is provided in the facts — reference',
  'images only as <img src="image:N"> with N taken from that list; with no list, write no images.',
  'Respond with a single JSON object and nothing else.',
];

/**
 * When an authoritative birth date is known, appends a hard constraint that
 * outranks any other source and forbids implying activity before that date.
 * Returns an empty string when `bornOn` is absent so `.filter(Boolean)` drops it.
 */
const authoritativeDateLine = (facts: ArtistFacts): string => {
  if (!facts.bornOn) return '';
  return (
    `AUTHORITATIVE FACT: the artist was born ${facts.bornOn}. This outranks any other source. ` +
    'NEVER state or imply the artist was active, performing, recording, or releasing work before this date.'
  );
};

const buildSystemPrompt = (facts: ArtistFacts): string =>
  [
    'You are an exceptional writer across all domains with years of experience researching',
    `musical artists and their backgrounds. Investigate deeply the biography of ${artistFullName(facts)}.`,
    'Ground every claim ONLY in the provided source material and facts; never invent discographies,',
    'dates, awards, members, labels, or URLs, and omit anything unknown rather than guessing.',
    'Rewrite all source material in your own original words — never copy sentences or distinctive phrasing.',
    ...SHARED_CONSTRAINT_LINES,
    authoritativeDateLine(facts),
  ]
    .filter(Boolean)
    .join(' ');

/** Formats the active-years line from MusicBrainz life-span data, if present. */
const activeYears = (facts: ArtistFacts): string => {
  if (!facts.beginDate) return '';
  const end = facts.endDate ? facts.endDate : 'present';
  return `Active: ${facts.beginDate}–${end}`;
};

/** Reference URLs the model may inline, derived from explicit sources or links. */
const referenceUrls = (facts: ArtistFacts): string[] =>
  facts.sourceUrls?.length
    ? facts.sourceUrls
    : [facts.wikipediaUrl, facts.officialUrl].filter((url): url is string => Boolean(url));

/** The available-images line listing 0-indexed image titles, if any. */
const imagesLine = (facts: ArtistFacts): string =>
  facts.imageTitles.length
    ? `Available images (0-indexed): ${facts.imageTitles.map((t, i) => `${i}=${t}`).join('; ')}`
    : '';

/** A `Label: value` line, or an empty string when the value is absent. */
const labeledLine = (label: string, value: string | undefined): string =>
  value ? `${label}: ${value}` : '';

/** The key-value fact summary lines (blank entries are filtered out by the caller). */
const factLines = (facts: ArtistFacts): string[] => [
  `Artist display name: ${facts.displayName}`,
  labeledLine('Real name', facts.realName),
  labeledLine('Also known as', facts.akaNames),
  labeledLine('Type', facts.artistType),
  labeledLine('Origin', facts.area),
  activeYears(facts),
  labeledLine('Born', facts.bornOn),
  labeledLine('Died', facts.diedOn),
  labeledLine('Formed', facts.formedOn),
  labeledLine('Known genres', facts.existingGenres),
  labeledLine('MusicBrainz tags', facts.tags?.length ? facts.tags.join(', ') : undefined),
  labeledLine('MusicBrainz id', facts.musicBrainzId),
  labeledLine('Wikipedia', facts.wikipediaUrl),
  labeledLine('Official site', facts.officialUrl),
  labeledLine('Editor notes', facts.description),
  imagesLine(facts),
];

/** The long-form source-material block, or a notice that none was found. */
const sourceMaterialLine = (facts: ArtistFacts): string =>
  facts.sourceText
    ? [
        'SOURCE MATERIAL (rewrite in your own words — do NOT copy phrasing):',
        '"""',
        facts.sourceText,
        '"""',
      ].join('\n')
    : 'No long-form source material was found; write only what the facts above support.';

/** The reference-URLs line, or a notice that no links are available. */
const referenceUrlsLine = (sourceUrls: string[]): string =>
  sourceUrls.length
    ? `Reference URLs available for inline links (use ONLY these, verbatim): ${sourceUrls.join(', ')}`
    : 'No reference URLs are available; do not add any links.';

/**
 * The requirements for each returned field plus the exact JSON shape — shared
 * verbatim by the draft and synthesis prompts so the final output always meets
 * one spec regardless of which call produced it.
 */
const OUTPUT_SPEC_LINES = [
  'shortBio: a rich, engaging biography of AT LEAST 200 words written as flowing HTML prose',
  'in one or more <p> paragraphs. Requirements:',
  '- Weave SEVERAL inline <a href="..."> links to informative sources from the reference URLs,',
  "  each with VARIED, descriptive anchor text (e.g. the artist's official site, a Wikipedia",
  '  article) — never reuse one phrase and never write "click here".',
  '- Optionally embed ONE inline <img src="image:N" alt="..."> from the Available images list',
  '  above, where N is its 0-indexed position; the app swaps the placeholder for the hosted URL.',
  '- Use <strong>/<em> emphasis where it helps; keep it to prose, never a list of links.',
  '- Do NOT add a "Discovered Links"/"Sources"/"References" section.',
  '',
  'longBio: an extensive, in-depth biography of roughly 2000–3500 words. Requirements:',
  '- Organize into several <h2> sections (e.g. Background, Career, Musical style, Notable works,',
  '  Collaborations, Legacy), each with <h3> subheadings where the material warrants it.',
  '- Weave inline <a href="..."> links to the reference URLs throughout: AT LEAST one link in',
  '  EVERY <h2> section. Reference URLs may be reused across sections with different anchor',
  '  text; VARY the wording around each link and never reuse one phrase.',
  '- Prefer links over bold: when a key name or term is covered by a reference URL, make it an',
  '  inline link instead of bolding it. ADDITIONALLY bold the pivotal unlinkable facts — key',
  '  dates, release titles, collaborators, and turning points — with <strong> so they stand out',
  '  when scanning, and italicize album/song/work titles with <em> wherever they appear.',
  '- Chunk enumerable content into <ul>/<ol> lists for web readability: discographies, timelines,',
  '  collaborator rosters, and similar runs of items belong in lists, not comma prose. Include at',
  '  least one list in the long bio whenever the material supports it.',
  '- Embed 2–3 inline images of the artist using <img src="image:N" alt="...">, where N is the',
  '  0-indexed position from the Available images list above. Place each sparingly and',
  '  tastefully: at most one per major section, between paragraphs near the relevant text, and',
  '  never place two images adjacent. The app swaps each placeholder for the hosted image URL.',
  '- Do NOT add a "Sources", "References", or "Discovered Links" list or tell the reader to visit a link.',
  '- Scale length down gracefully when sources are thin; never pad with invented detail.',
  '',
  'altBio: a punchy, high-energy PROMOTIONAL blurb of roughly 60–100 words — the kind of copy',
  'used on a release page or press one-sheet. Requirements:',
  '- A distinct, confident marketing voice, NOT the neutral tone of the short bio; lead with what',
  '  makes the artist compelling. One or two short <p> paragraphs with <strong>/<em> for punch.',
  '- Weave in ONE inline <a href="..."> link to an informative source from the reference URLs.',
  '- Optionally embed ONE inline <img src="image:N" alt="..."> if a fitting image is available.',
  '- Do NOT add a links/sources section.',
  `Use only these HTML tags: ${ALLOWED_TAGS}.`,
  '',
  'Return JSON with this exact shape:',
  '{',
  '  "shortBio": "the 200+ word rich-HTML short bio with several inline informative links",',
  '  "longBio": "the extensive, image-rich HTML article described above",',
  '  "altBio": "the punchy ~60-100 word promotional blurb described above",',
  '  "genres": "comma-separated genres or empty string",',
  '  "primaryImageIndexes": [indexes of the 2-3 images that best identify the artist]',
  '}',
];

const buildUserPrompt = (facts: ArtistFacts): string =>
  [
    ...factLines(facts),
    '',
    sourceMaterialLine(facts),
    '',
    referenceUrlsLine(referenceUrls(facts)),
    '',
    ...OUTPUT_SPEC_LINES,
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Pulls the raw JSON string out of a Gemini response and parses it.
 * Throws on an empty completion or non-JSON content; the caller is
 * responsible for schema validation.
 */
const parseJsonContent = (body: GeminiResponse): unknown => {
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('Gemini returned an empty completion');
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Gemini returned non-JSON content');
  }
};

/**
 * Builds the non-OK failure message, appending a bounded excerpt of the response
 * body — Google's 429/4xx bodies name the exact quota or key problem, and
 * discarding them made two production incidents needlessly hard to diagnose.
 */
const failureMessage = async (response: Response): Promise<string> => {
  const base = `Gemini request failed (${response.status})`;
  const body = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim();
  return body ? `${base}: ${body.slice(0, ERROR_BODY_SNIPPET_LENGTH)}` : base;
};

/** One fully-assembled Gemini `generateContent` call. */
interface ProseRequest {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
  model: string;
  temperature: number;
}

/**
 * Schema-generic single-call core: posts a system + user prompt pair to Gemini
 * in JSON mode (with 429/503 retry) and validates the completion against the
 * supplied Zod schema. All prose and critique calls route through here so the
 * endpoint, auth, retry pacing, and JSON parsing can never diverge.
 */
const requestJson = async <T>(
  schema: { parse: (value: unknown) => T },
  { systemPrompt, userPrompt, apiKey, model, temperature }: ProseRequest,
  options: FetchRetryOptions = {}
): Promise<T> => {
  const response = await fetchWithRetry(
    `${GEMINI_API_BASE}/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
    },
    { baseDelayMs: GEMINI_RETRY_BASE_DELAY_MS, retries: GEMINI_RETRIES, ...options }
  );

  if (!response.ok) {
    throw new Error(await failureMessage(response));
  }

  return schema.parse(parseJsonContent((await response.json()) as GeminiResponse));
};

/**
 * Thin wrapper that locks {@link requestJson} to the bio-prose schema so
 * call sites inside this module never need to supply the schema explicitly.
 */
const requestProse = (request: ProseRequest, options: FetchRetryOptions = {}): Promise<BioProse> =>
  requestJson(bioProseSchema, request, options);

/**
 * Generates short + long bio prose with the Gemini `generateContent` API in JSON
 * mode. The model writes prose only; it is given the real facts gathered from
 * MusicBrainz/Wikidata/web so the text stays grounded, and it never produces the
 * image/link URLs the caller ultimately returns. Gemini's 1M-token context means
 * the full source material fits without trimming. Rate-limited (429) attempts
 * are retried after a 30s → 60s pause (or the server's `Retry-After`).
 *
 * @param facts - Grounding facts assembled by the handler.
 * @param apiKey - Gemini API key (resolved from SSM), sent via `x-goog-api-key`.
 * @param model - Gemini model id; defaults to {@link DEFAULT_GEMINI_MODEL}.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 * @returns Validated prose plus the model's image ranking.
 */
export const generateProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  options: ProseRequestOptions = {}
): Promise<BioProse> => {
  const { temperature = DEFAULT_TEMPERATURE, styleDirective, ...retryOptions } = options;
  const systemPrompt = styleDirective
    ? `${buildSystemPrompt(facts)} ${styleDirective}`
    : buildSystemPrompt(facts);
  return requestProse(
    { systemPrompt, userPrompt: buildUserPrompt(facts), apiKey, model, temperature },
    retryOptions
  );
};

/**
 * Slightly above the draft default so the editor rewrites in fresh words
 * instead of transcribing whichever draft it likes best, while staying well
 * below the high-variety draft temperature to keep the merge disciplined.
 */
const SYNTHESIS_TEMPERATURE = 0.7;

const buildSynthesisSystemPrompt = (facts: ArtistFacts, draftCount: number): string =>
  [
    'You are an exceptional editor with years of experience synthesizing multiple drafts into',
    `definitive artist biographies. You are given ${draftCount} independently written draft`,
    `biographies of ${artistFullName(facts)} plus the verified facts about the artist.`,
    'Merge the strongest material, structure, and phrasing from the drafts into one original,',
    'cohesive set of bios — rewrite freely in fresh words rather than stitching drafts together',
    'verbatim, and resolve any disagreement between drafts in favor of the verified facts.',
    'Ground every claim ONLY in the drafts and facts provided; never introduce discographies,',
    'dates, awards, members, labels, or URLs that appear in none of them, and omit anything',
    'unknown rather than guessing.',
    ...SHARED_CONSTRAINT_LINES,
    authoritativeDateLine(facts),
  ]
    .filter(Boolean)
    .join(' ');

const buildSynthesisUserPrompt = (facts: ArtistFacts, drafts: BioProse[]): string =>
  [
    ...factLines(facts),
    '',
    referenceUrlsLine(referenceUrls(facts)),
    '',
    ...drafts.map((draft, i) => `DRAFT ${i + 1} (JSON): ${JSON.stringify(draft)}`),
    '',
    'Synthesize the drafts above into one definitive result meeting the spec below. Keep every',
    '<img src="image:N"> index within the Available images list and link ONLY to the reference',
    'URLs listed above. Preserve the inline <a> links and <img> images the drafts wove into',
    'their prose — carry the best of them into the final result rather than dropping them.',
    '',
    ...OUTPUT_SPEC_LINES,
  ]
    .filter(Boolean)
    .join('\n');

/** Inputs for {@link synthesizeProse}, destructured to keep the call site readable. */
export interface SynthesizeProseArgs {
  facts: ArtistFacts;
  drafts: BioProse[];
  apiKey: string;
  model?: string;
}

/**
 * The editor pass of the ensemble pipeline: merges independently generated
 * drafts into one definitive {@link BioProse}. It deliberately receives the
 * drafts and grounding facts but NOT the raw source material — rewriting from
 * drafts alone pushes the final prose further from any source phrasing.
 *
 * @param args - Grounding facts, the drafts to merge, API key, and model id.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 * @returns Validated synthesized prose plus the model's image ranking.
 */
export const synthesizeProse = async (
  { facts, drafts, apiKey, model = DEFAULT_GEMINI_MODEL }: SynthesizeProseArgs,
  options: FetchRetryOptions = {}
): Promise<BioProse> =>
  requestProse(
    {
      systemPrompt: buildSynthesisSystemPrompt(facts, drafts.length),
      userPrompt: buildSynthesisUserPrompt(facts, drafts),
      apiKey,
      model,
      temperature: SYNTHESIS_TEMPERATURE,
    },
    options
  );

/** Sampling temperature for the fact-checker critic pass — low for determinism. */
const CRITIC_TEMPERATURE = 0.2;

/** Sampling temperature for the repair/revision pass — slightly higher for fresh phrasing. */
const REVISE_TEMPERATURE = 0.4;

/**
 * Quality passes use only one retry — they must not blow the Lambda timeout in
 * the worst case where the main ensemble already consumed most of the budget.
 * Callers may override via the `options` argument.
 */
const QUALITY_PASS_RETRIES = 1;

/** Inputs for {@link critiqueProse}, destructured to keep the call site readable. */
export interface CritiqueProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  suspectYears: number[];
  apiKey: string;
  model?: string;
}

/**
 * Fact-checker pass: posts the generated bios plus authoritative facts to
 * Gemini and asks it to report any concrete violations. Returns a
 * {@link BioCritique} with zero or more violations — an empty array is the
 * correct answer for clean bios.
 *
 * @param args - Facts, prose, suspect years, API key, and optional model id.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 */
export const critiqueProse = (
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

/** Inputs for {@link reviseProse}, destructured to keep the call site readable. */
export interface ReviseProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  violations: BioCritiqueViolation[];
  plagiarizedSegments: Array<{ text: string }>;
  apiKey: string;
  model?: string;
}

/**
 * Repair pass: given a set of fact violations and/or plagiarized segments,
 * rewrites only the affected sentences while keeping everything else verbatim.
 * Returns the full corrected {@link BioProse} ready for downstream assembly.
 *
 * @param args - Facts, current prose, violations, plagiarised segments, API key, and model.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 */
export const reviseProse = (
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

/**
 * The ensemble's draft variants: one precision-leaning pass at the default
 * temperature and one higher-variety narrative pass. Two drafts (three Gemini
 * calls per bio with synthesis) balance variety against the free-tier
 * per-day/per-minute quotas and the Lambda timeout.
 */
const DRAFT_VARIANTS: ReadonlyArray<Pick<ProseRequestOptions, 'temperature' | 'styleDirective'>> = [
  {
    temperature: 0.6,
    styleDirective:
      'For this draft, prioritize factual precision and chronology: anchor every section to ' +
      'verifiable milestones, dates, and named works.',
  },
  {
    temperature: 0.95,
    styleDirective:
      'For this draft, prioritize narrative voice and atmosphere: lead with what makes the ' +
      "artist's story and sound distinctive, while staying strictly factual.",
  },
];

/** Narrows a settled result to fulfillment, for use as a type-guard filter. */
const isFulfilled = <T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> =>
  result.status === 'fulfilled';

/**
 * The full draft-and-synthesize pipeline: generates {@link DRAFT_VARIANTS}
 * independent drafts in parallel, then has an editor pass merge them into one
 * definitive result. Degrades gracefully — a failed draft is dropped (any one
 * draft suffices), and a failed synthesis falls back to the first draft so a
 * bio is still produced. Only when every draft fails does the pipeline throw.
 *
 * Signature-compatible with {@link generateProse} so the handler can treat
 * either as its prose dependency.
 *
 * @param facts - Grounding facts assembled by the handler.
 * @param apiKey - Gemini API key (resolved from SSM), sent via `x-goog-api-key`.
 * @param model - Gemini model id; defaults to {@link DEFAULT_GEMINI_MODEL}.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 * @returns Validated synthesized prose plus the model's image ranking.
 */
export const draftAndSynthesizeProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  options: FetchRetryOptions = {}
): Promise<BioProse> => {
  const settled = await Promise.allSettled(
    DRAFT_VARIANTS.map((variant) => generateProse(facts, apiKey, model, { ...options, ...variant }))
  );
  const drafts = settled.filter(isFulfilled).map((result) => result.value);
  if (!drafts.length) {
    const [first] = settled;
    throw first.status === 'rejected' ? first.reason : new Error('All bio drafts failed');
  }
  logEvent('info', 'prose_drafts', { requested: DRAFT_VARIANTS.length, fulfilled: drafts.length });

  try {
    return await synthesizeProse({ facts, drafts, apiKey, model }, options);
  } catch (err) {
    // A lost editor pass must not cost the artist their bio — ship a draft.
    logEvent('warn', 'prose_synthesis_failed', { error: toErrorMessage(err) });
    return drafts[0];
  }
};
