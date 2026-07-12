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
 * Backoff between rate-limited attempts: 4s, doubling to 8s then 16s — on the
 * paid Tier 1 quota a 429 clears in seconds rather than the free tier's minute,
 * and a server `Retry-After` still takes precedence. Three retries ride out a
 * brief burst-limit blip while staying well inside the Lambda's 900s timeout.
 */
const GEMINI_RETRY_BASE_DELAY_MS = 4_000;
const GEMINI_RETRIES = 3;

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

/** Which pipeline stage a Gemini call serves — tags the usage telemetry line. */
type GeminiPurpose = 'draft' | 'synthesis' | 'critic' | 'repair' | 'vision' | 'adjudication';

/** Cap on the response-body excerpt echoed into failure messages. */
const ERROR_BODY_SNIPPET_LENGTH = 300;

/**
 * Token accounting Gemini returns alongside the completion. Every field is
 * optional in practice (the API omits usage on some error-adjacent responses),
 * so cost telemetry must tolerate any of them being absent.
 */
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * Emits a `gemini_usage` telemetry line after a successful call so cost can be
 * tracked per model and pipeline stage. Each token count defaults to `null`
 * when the API omits it — logging must never throw on absent usage metadata.
 */
export const logGeminiUsage = (
  model: string,
  purpose: GeminiPurpose,
  usage: GeminiUsageMetadata | undefined
): void =>
  logEvent('info', 'gemini_usage', {
    model,
    purpose,
    promptTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
    thoughtsTokens: usage?.thoughtsTokenCount ?? null,
  });

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
const referenceUrls = (facts: ArtistFacts): string[] => {
  const external = facts.sourceUrls?.length
    ? facts.sourceUrls
    : [facts.wikipediaUrl, facts.officialUrl].filter((url): url is string => Boolean(url));
  return [...external, ...(facts.internalReleaseUrls ?? [])];
};

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

/** The authoritative-timeline block, or empty when no chronology exists. */
const chronologyLine = (facts: ArtistFacts): string =>
  facts.chronology?.length
    ? [
        'CHRONOLOGY (authoritative — every date and release year in the prose MUST come from',
        'these lines or the labeled facts above, never from memory):',
        ...facts.chronology,
      ].join('\n')
    : '';

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
  '- Do NOT embed any <img> tags in the short bio — it renders as a text-only lede.',
  '- Chunk into 2–3 short <p> paragraphs for web readability — never one long block.',
  '- Use <strong>/<em> emphasis where it helps; keep it to prose, never a list of links.',
  '- Do NOT add a "Discovered Links"/"Sources"/"References" section.',
  '',
  'longBio: an extensive, in-depth biography of roughly 2000–3500 words. Requirements:',
  '- Organize into several <h2> sections (e.g. Background, Career, Musical style, Notable works,',
  '  Collaborations, Legacy), each with <h3> subheadings where the material warrants it.',
  '- Weave inline <a href="..."> links to the reference URLs throughout: AT LEAST one link in',
  '  EVERY <h2> section. Reference URLs may be reused across sections with different anchor',
  '  text; VARY the wording around each link and never reuse one phrase.',
  "- Reference URLs beginning with /releases/ are THIS label's own release pages — link each",
  '  relevant release title to its /releases/ path at first mention.',
  '- Emphasis policy — links first: when a key name or term is covered by a reference URL, make',
  '  it an inline link. Use <em> for album/song/work titles that are NOT linked, and <strong>',
  '  sparingly for pivotal unlinked facts — key dates, collaborators, turning points. One',
  '  treatment per phrase: Never stack <strong>, <em>, and <a> on the same phrase.',
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
    chronologyLine(facts),
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
  purpose: GeminiPurpose;
}

/**
 * Schema-generic single-call core: posts a system + user prompt pair to Gemini
 * in JSON mode (with 429/503 retry) and validates the completion against the
 * supplied Zod schema. All prose and critique calls route through here so the
 * endpoint, auth, retry pacing, and JSON parsing can never diverge.
 */
const requestJson = async <T>(
  schema: { parse: (value: unknown) => T },
  { systemPrompt, userPrompt, apiKey, model, temperature, purpose }: ProseRequest,
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

  const body = (await response.json()) as GeminiResponse;
  logGeminiUsage(model, purpose, body.usageMetadata);
  return schema.parse(parseJsonContent(body));
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
    {
      systemPrompt,
      userPrompt: buildUserPrompt(facts),
      apiKey,
      model,
      temperature,
      purpose: 'draft',
    },
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
    chronologyLine(facts),
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
      purpose: 'synthesis',
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

/**
 * Runs a Gemini call on `primaryModel`, and on failure retries ONCE on
 * `fallbackModel` when one is provided and distinct. This keeps the paid-tier
 * Pro→Flash degradation ladder inside gemini.ts so callers (e.g. factcheck)
 * stay model-agnostic. With no `fallbackModel`, behavior is a single attempt —
 * byte-for-byte the pre-Tier-1 path.
 */
const withModelFallback = async <T>(
  primaryModel: string,
  fallbackModel: string | undefined,
  run: (model: string) => Promise<T>
): Promise<T> => {
  try {
    return await run(primaryModel);
  } catch (err) {
    if (!fallbackModel || fallbackModel === primaryModel) throw err;
    logEvent('warn', 'gemini_model_fallback', {
      from: primaryModel,
      to: fallbackModel,
      error: toErrorMessage(err),
    });
    return run(fallbackModel);
  }
};

/** Inputs for {@link critiqueProse}, destructured to keep the call site readable. */
export interface CritiqueProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  suspectYears: number[];
  apiKey: string;
  model?: string;
  /** Paid-tier fallback: retry once on this model if `model` fails (e.g. Pro→Flash). */
  fallbackModel?: string;
}

/**
 * Fact-checker pass: posts the generated bios plus authoritative facts to
 * Gemini and asks it to report any concrete violations. Returns a
 * {@link BioCritique} with zero or more violations — an empty array is the
 * correct answer for clean bios. Retries once on `fallbackModel` when the
 * primary model fails, if one is supplied.
 *
 * @param args - Facts, prose, suspect years, API key, and optional model ids.
 * @param options - Injectable fetch/sleep and retry tuning for testability.
 */
export const critiqueProse = (
  {
    facts,
    prose,
    suspectYears,
    apiKey,
    model = DEFAULT_GEMINI_MODEL,
    fallbackModel,
  }: CritiqueProseArgs,
  options: FetchRetryOptions = {}
): Promise<BioCritique> => {
  const systemPrompt = [
    'You are a meticulous fact-checker for artist biographies. Compare the bios against the',
    'verified facts, the chronology, and the source material. Report ONLY concrete violations:',
    'claims contradicted by the facts or chronology, dates preceding the authoritative',
    'birth/formation dates, and specific checkable claims (dates, chart positions, label names,',
    'collaborations, awards) with no support in the source material, facts, or chronology.',
    'An empty violations array is the correct answer for clean bios.',
    'Respond with a single JSON object and nothing else.',
  ].join(' ');
  const userPrompt = [
    ...factLines(facts),
    '',
    chronologyLine(facts),
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
    .join('\n');
  return withModelFallback(model, fallbackModel, (activeModel) =>
    requestJson(
      bioCritiqueSchema,
      {
        systemPrompt,
        userPrompt,
        apiKey,
        model: activeModel,
        temperature: CRITIC_TEMPERATURE,
        purpose: 'critic',
      },
      { retries: QUALITY_PASS_RETRIES, ...options }
    )
  );
};

/** Inputs for {@link reviseProse}, destructured to keep the call site readable. */
export interface ReviseProseArgs {
  facts: ArtistFacts;
  prose: BioProse;
  violations: BioCritiqueViolation[];
  plagiarizedSegments: Array<{ text: string }>;
  apiKey: string;
  model?: string;
  /** Paid-tier fallback: retry once on this model if `model` fails (e.g. Pro→Flash). */
  fallbackModel?: string;
}

/**
 * Repair pass: given a set of fact violations and/or plagiarized segments,
 * rewrites only the affected sentences while keeping everything else verbatim.
 * Returns the full corrected {@link BioProse} ready for downstream assembly.
 * Retries once on `fallbackModel` when the primary model fails, if one is supplied.
 *
 * @param args - Facts, current prose, violations, plagiarised segments, API key, and model ids.
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
    fallbackModel,
  }: ReviseProseArgs,
  options: FetchRetryOptions = {}
): Promise<BioProse> => {
  const systemPrompt = [
    buildSystemPrompt(facts),
    'You are repairing existing bios, not writing new ones.',
  ].join(' ');
  const userPrompt = [
    ...factLines(facts),
    '',
    chronologyLine(facts),
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
    .join('\n');
  return withModelFallback(model, fallbackModel, (activeModel) =>
    requestJson(
      bioProseSchema,
      {
        systemPrompt,
        userPrompt,
        apiKey,
        model: activeModel,
        temperature: REVISE_TEMPERATURE,
        purpose: 'repair',
      },
      { retries: QUALITY_PASS_RETRIES, ...options }
    )
  );
};

/**
 * The ensemble's draft variants: a precision-leaning pass at the default
 * temperature, a scene/context-led pass in the middle, and a higher-variety
 * narrative pass. Three drafts (four Gemini calls per bio with synthesis) give
 * the paid Tier-1 editor a wider spread of angles to merge, and the shorter
 * paid-tier backoffs keep the added call inside the Lambda timeout.
 */
const DRAFT_VARIANTS: ReadonlyArray<Pick<ProseRequestOptions, 'temperature' | 'styleDirective'>> = [
  {
    temperature: 0.6,
    styleDirective:
      'For this draft, prioritize factual precision and chronology: anchor every section to ' +
      'verifiable milestones, dates, and named works.',
  },
  {
    temperature: 0.8,
    styleDirective:
      'For this draft, prioritize scene and context: situate the artist within their era, place, ' +
      'movement, and collaborators, tracing how their surroundings shaped the work — staying strictly factual.',
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

/** Retry/injection tuning plus the optional paid-tier synthesis model split. */
export interface DraftAndSynthesizeOptions extends FetchRetryOptions {
  /**
   * When set, the editor synthesis runs on this (typically Pro) model, retrying
   * once on the draft `model` before degrading to the first draft. Unset →
   * synthesis stays on the draft `model`, exactly the pre-Tier-1 behavior.
   */
  synthesisModel?: string;
  /**
   * Best-effort progress hook fired exactly once after the drafts settle and
   * immediately before the synthesis call — the handler uses it to checkpoint
   * the `synthesizing` stage. Awaited if it returns a promise. Never fires when
   * every draft fails, since the pipeline throws before synthesis.
   */
  onPhase?: (phase: 'synthesizing') => Promise<void> | void;
}

/**
 * The editor pass with the paid-tier model ladder: synthesis runs on
 * `synthesisModel` when set, retrying ONCE on the draft `model`; if both fail
 * (or no split was requested and the single pass fails) it degrades to the
 * first draft so the artist always gets a bio.
 */
const synthesizeWithFallback = async (
  args: { facts: ArtistFacts; drafts: BioProse[]; apiKey: string },
  model: string,
  synthesisModel: string | undefined,
  options: FetchRetryOptions
): Promise<BioProse> => {
  const { facts, drafts, apiKey } = args;
  try {
    return await synthesizeProse(
      { facts, drafts, apiKey, model: synthesisModel ?? model },
      options
    );
  } catch (primaryErr) {
    if (synthesisModel && synthesisModel !== model) {
      logEvent('warn', 'prose_synthesis_fallback', {
        from: synthesisModel,
        to: model,
        error: toErrorMessage(primaryErr),
      });
      try {
        return await synthesizeProse({ facts, drafts, apiKey, model }, options);
      } catch (fallbackErr) {
        logEvent('warn', 'prose_synthesis_failed', { error: toErrorMessage(fallbackErr) });
        return drafts[0];
      }
    }
    // A lost editor pass must not cost the artist their bio — ship a draft.
    logEvent('warn', 'prose_synthesis_failed', { error: toErrorMessage(primaryErr) });
    return drafts[0];
  }
};

/**
 * The full draft-and-synthesize pipeline: generates {@link DRAFT_VARIANTS}
 * independent drafts in parallel, then has an editor pass merge them into one
 * definitive result. Degrades gracefully — a failed draft is dropped (any one
 * draft suffices), and a failed synthesis falls back to the first draft so a
 * bio is still produced. Only when every draft fails does the pipeline throw.
 * Drafts always run on `model`; pass `options.synthesisModel` to run the editor
 * pass on a stronger model (with a one-shot fallback to `model`).
 *
 * Signature-compatible with {@link generateProse} so the handler can treat
 * either as its prose dependency.
 *
 * @param facts - Grounding facts assembled by the handler.
 * @param apiKey - Gemini API key (resolved from SSM), sent via `x-goog-api-key`.
 * @param model - Gemini model id; defaults to {@link DEFAULT_GEMINI_MODEL}.
 * @param options - Injectable fetch/sleep, retry tuning, and optional synthesis model.
 * @returns Validated synthesized prose plus the model's image ranking.
 */
export const draftAndSynthesizeProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  options: DraftAndSynthesizeOptions = {}
): Promise<BioProse> => {
  const { synthesisModel, onPhase, ...retryOptions } = options;
  const settled = await Promise.allSettled(
    DRAFT_VARIANTS.map((variant) =>
      generateProse(facts, apiKey, model, { ...retryOptions, ...variant })
    )
  );
  const drafts = settled.filter(isFulfilled).map((result) => result.value);
  if (!drafts.length) {
    const [first] = settled;
    throw first.status === 'rejected' ? first.reason : new Error('All bio drafts failed');
  }
  logEvent('info', 'prose_drafts', { requested: DRAFT_VARIANTS.length, fulfilled: drafts.length });

  await onPhase?.('synthesizing');

  return synthesizeWithFallback({ facts, drafts, apiKey }, model, synthesisModel, retryOptions);
};

/** Public alias of the single-call request shape for sibling modules. */
export type GeminiJsonRequest = ProseRequest;

/**
 * Public alias of the schema-generic JSON core so sibling modules (the
 * video-enrichment adjudications) share the endpoint, auth, retry pacing,
 * and JSON parsing instead of re-implementing them.
 */
export const requestGeminiJson = requestJson;
