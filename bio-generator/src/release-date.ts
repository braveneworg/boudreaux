/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { requestGeminiJson } from './gemini.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { searchSerperWeb } from './serper.js';
import { DEFAULT_GEMINI_MODEL } from './types.js';

import type { FetchRetryOptions } from './lib/http.js';
import type { SerperWebResult } from './serper.js';
import type { VideoSuggestion } from './types.js';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** Gemini's JSON adjudication of the web evidence for a release date. */
export const releaseDateAdjudicationSchema = z.object({
  releaseDate: isoDay.nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
});
export type ReleaseDateAdjudication = z.infer<typeof releaseDateAdjudicationSchema>;

/** Gemini's JSON adjudication of web evidence for artist identity facts. */
export const identityFallbackSchema = z.object({
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  surname: z.string().nullable(),
  bornOn: isoDay.nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
});

/** Identity facts recovered from the web when structured sources miss. */
export interface IdentityFallbackFacts {
  firstName?: string;
  middleName?: string;
  surname?: string;
  bornOn?: string;
  sources: Array<{ url: string }>;
  note: string;
}

/** Injectable collaborators shared by both adjudications. */
export interface AdjudicationDeps {
  searchWeb?: typeof searchSerperWeb;
  requestJson?: typeof requestGeminiJson;
  fetchOptions?: FetchRetryOptions;
}

/** Low temperature: adjudication extracts, it must not get creative. */
const ADJUDICATION_TEMPERATURE = 0.2;

/** Dedupe results by link across queries (first occurrence wins). */
const dedupeByLink = (results: SerperWebResult[]): SerperWebResult[] => {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.link.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Run both queries sequentially and merge/dedupe the evidence pool. */
const gatherEvidence = async (
  queries: string[],
  serperKey: string,
  searchWeb: typeof searchSerperWeb
): Promise<SerperWebResult[]> => {
  const results: SerperWebResult[] = [];
  for (const query of queries) {
    results.push(...(await searchWeb(query, serperKey)));
  }
  return dedupeByLink(results);
};

/** Numbered evidence block for the user prompt. */
const evidenceLines = (results: SerperWebResult[]): string =>
  results
    .map(
      (result, i) =>
        `${i + 1}. ${result.title} — ${result.snippet}${result.date ? ` (${result.date})` : ''} [${result.link}]`
    )
    .join('\n');

/** Keep only URLs Gemini was actually shown (subset enforcement, post-parse). */
export const enforceSourceSubset = (urls: string[], provided: Set<string>): string[] =>
  urls.filter((url) => provided.has(url));

const SHARED_SYSTEM_LINES = [
  'Use ONLY the evidence provided; never invent facts, dates, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
];

/** A Zod schema that parses an adjudication body of type `T`. */
export interface AdjudicationSchema<T> {
  parse: (value: unknown) => T;
}

/** One adjudication run's inputs: its schema, prompts, and Gemini config. */
export interface AdjudicationRun<T> {
  queries: string[];
  serperKey: string;
  geminiKey: string;
  model: string;
  schema: AdjudicationSchema<T>;
  systemPrompt: string;
  /** Builds the user prompt from the (non-empty) numbered evidence block. */
  buildUserPrompt: (evidence: string) => string;
}

/** The parsed adjudication plus the evidence-link allowlist for subset checks. */
export interface AdjudicationOutcome<T> {
  parsed: T;
  provided: Set<string>;
}

/**
 * Shared adjudication core: gather two-query evidence, and — when any exists —
 * run one low-temperature Gemini JSON call against the supplied schema. Returns
 * the parsed body plus the evidence-link allowlist, or `null` when no evidence
 * was found. Keeps the endpoint/auth/retry/JSON parsing identical across both
 * adjudications and holds each public entry point under the complexity cap.
 */
export const adjudicate = async <T>(
  run: AdjudicationRun<T>,
  { searchWeb = searchSerperWeb, requestJson = requestGeminiJson, fetchOptions }: AdjudicationDeps
): Promise<AdjudicationOutcome<T> | null> => {
  const evidence = await gatherEvidence(run.queries, run.serperKey, searchWeb);
  if (evidence.length === 0) return null;

  const provided = new Set(evidence.map((result) => result.link));
  const parsed = await requestJson(
    run.schema,
    {
      systemPrompt: run.systemPrompt,
      userPrompt: run.buildUserPrompt(evidenceLines(evidence)),
      apiKey: run.geminiKey,
      model: run.model,
      temperature: ADJUDICATION_TEMPERATURE,
      purpose: 'adjudication',
    },
    fetchOptions ?? {}
  );
  return { parsed, provided };
};

/** Arguments for {@link resolveReleaseDateSuggestion}. */
export interface ReleaseDateArgs {
  title: string;
  artistDisplay: string;
  /** The admin-entered date (YYYY-MM-DD); a matching adjudication is suppressed. */
  adminReleasedOn?: string;
  serperKey: string;
  geminiKey: string;
  model?: string;
}

/**
 * Adjudicates the video's release date from two targeted web searches and one
 * Gemini flash JSON call. Emits a suggestion only when a date was found, at
 * least one cited source survives subset enforcement, and the date differs
 * from the admin-entered one. Web/LLM-derived, so confidence is capped at
 * medium. Never throws — any failure degrades to null.
 */
const releaseDateSystemPrompt = [
  'You adjudicate music-video release dates from web search evidence.',
  ...SHARED_SYSTEM_LINES,
].join(' ');

/** The two-query evidence sweep — title-only when no artist is known. */
const releaseDateQueries = (title: string, artist: string): string[] =>
  artist
    ? [`"${artist}" "${title}" video release date`, `${artist} ${title} premiere`]
    : [`"${title}" video release date`, `${title} premiere`];

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

/** True when the adjudicated date merely echoes the admin-entered one. */
const matchesAdmin = (releaseDate: string, adminReleasedOn: string | undefined): boolean =>
  Boolean(adminReleasedOn && releaseDate === adminReleasedOn.slice(0, 10));

export const resolveReleaseDateSuggestion = async (
  args: ReleaseDateArgs,
  deps: AdjudicationDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null> => {
  const { title, artistDisplay, adminReleasedOn, serperKey, geminiKey } = args;
  const artist = artistDisplay.trim();
  try {
    const outcome = await adjudicate(
      {
        queries: releaseDateQueries(title, artist),
        serperKey,
        geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: releaseDateAdjudicationSchema,
        systemPrompt: releaseDateSystemPrompt,
        buildUserPrompt: buildReleaseDatePrompt(title, artist, adminReleasedOn),
      },
      deps
    );
    if (!outcome) return null;

    const { parsed, provided } = outcome;
    const sourceUrls = enforceSourceSubset(parsed.sourceUrls, provided);
    if (!parsed.releaseDate || sourceUrls.length === 0) return null;
    if (matchesAdmin(parsed.releaseDate, adminReleasedOn)) return null;

    return {
      value: parsed.releaseDate,
      // Web/LLM-derived — never high (spec: web-only facts stay below high).
      confidence: parsed.confidence === 'high' ? 'medium' : parsed.confidence,
      sources: sourceUrls.map((url) => ({ url })),
      note: parsed.rationale,
    };
  } catch (err) {
    logEvent('warn', 'video_release_date_failed', { error: toErrorMessage(err) });
    return null;
  }
};

/** Arguments for {@link resolveIdentityFallback}. */
export interface IdentityFallbackArgs {
  name: string;
  serperKey: string;
  geminiKey: string;
  model?: string;
}

/** Builds the identity-adjudication system prompt for one artist name. */
const identitySystemPrompt = (name: string): string =>
  [
    `You adjudicate identity facts about the musician "${name}" from web search evidence.`,
    ...SHARED_SYSTEM_LINES,
  ].join(' ');

/** The identity-adjudication user prompt from the numbered evidence block. */
const buildIdentityPrompt = (evidence: string): string =>
  [
    'EVIDENCE:',
    evidence,
    '',
    'Return JSON: {"firstName": string or null, "middleName": string or null,',
    '"surname": string or null, "bornOn": "YYYY-MM-DD" or null,',
    '"sourceUrls": [evidence links that support the facts], "rationale": "<= 300 chars"}',
  ].join('\n');

/** The identity adjudication body parsed from Gemini's JSON. */
type IdentityAdjudication = z.infer<typeof identityFallbackSchema>;

/** Maps the parsed identity facts onto the output shape, dropping empty fields. */
const toIdentityFacts = (
  facts: IdentityAdjudication,
  sourceUrls: string[]
): IdentityFallbackFacts | null => {
  const out: IdentityFallbackFacts = {
    sources: sourceUrls.map((url) => ({ url })),
    note: facts.rationale,
    ...(facts.firstName ? { firstName: facts.firstName } : {}),
    ...(facts.middleName ? { middleName: facts.middleName } : {}),
    ...(facts.surname ? { surname: facts.surname } : {}),
    ...(facts.bornOn ? { bornOn: facts.bornOn } : {}),
  };
  const hasFact = Boolean(out.firstName || out.middleName || out.surname || out.bornOn);
  return hasFact ? out : null;
};

/**
 * Web-only identity fallback for when MusicBrainz/Wikidata miss: two targeted
 * searches plus one Gemini flash JSON adjudication. The caller maps every
 * returned fact to LOW confidence (web/LLM-only). Never throws.
 */
export const resolveIdentityFallback = async (
  args: IdentityFallbackArgs,
  deps: AdjudicationDeps = {}
): Promise<IdentityFallbackFacts | null> => {
  const { name, serperKey, geminiKey } = args;
  try {
    const outcome = await adjudicate(
      {
        queries: [`${name} musician real name`, `${name} musician date of birth`],
        serperKey,
        geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: identityFallbackSchema,
        systemPrompt: identitySystemPrompt(name),
        buildUserPrompt: buildIdentityPrompt,
      },
      deps
    );
    if (!outcome) return null;

    const sourceUrls = enforceSourceSubset(outcome.parsed.sourceUrls, outcome.provided);
    if (sourceUrls.length === 0) return null;

    return toIdentityFacts(outcome.parsed, sourceUrls);
  } catch (err) {
    logEvent('warn', 'video_identity_fallback_failed', { error: toErrorMessage(err) });
    return null;
  }
};
