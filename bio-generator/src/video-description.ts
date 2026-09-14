/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { readUrl } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getScrapeApiKey } from './lib/secrets.js';
import { adjudicate, boundedProse, boundedRationale, enforceSourceSubset } from './release-date.js';
import { DEFAULT_GEMINI_MODEL } from './types.js';

import type { AdjudicationDeps, AdjudicationRun } from './release-date.js';
import type { SerperWebResult } from './serper.js';
import type { VideoEnrichmentCategory, VideoSuggestion } from './types.js';

/** The hard ceiling the system prompt states; enforced here by truncation. */
const MAX_DESCRIPTION_CHARS = 900;

/**
 * Gemini's JSON synthesis of an editorial description. No confidence field
 * exists here — description prose is always emitted at fixed medium confidence.
 * An overlong description is truncated rather than rejected: the prose is
 * sound, only its length overshoots what the prompt asked for.
 */
export const descriptionAdjudicationSchema = z.object({
  description: boundedProse({
    cap: MAX_DESCRIPTION_CHARS,
    event: 'description_truncated',
  }).nullable(),
  sourceUrls: z.array(z.string().url()),
  rationale: boundedRationale('description'),
});

type DescriptionAdjudication = z.infer<typeof descriptionAdjudicationSchema>;

/** Arguments for {@link resolveDescriptionSuggestion}. */
export interface VideoDescriptionArgs {
  title: string;
  artistDisplay: string;
  /** Selects the prompt strategy; absent means MUSIC (a pre-category invoke). */
  category?: VideoEnrichmentCategory;
  releasedOn?: string;
  /** Structured facts gathered earlier this run, one plain line each. */
  facts: string[];
  serperKey: string;
  geminiKey: string;
  model?: string;
}

/** Description deps: the shared adjudication seams plus the page reader tier. */
export interface VideoDescriptionDeps extends AdjudicationDeps {
  readPage?: typeof readUrl;
  getScrapeKey?: typeof getScrapeApiKey;
}

/** How many top evidence pages are read for verbatim quote material. */
const MAX_EXCERPT_PAGES = 2;
/** Per-page excerpt cap, bounding the prompt size. */
const MAX_EXCERPT_CHARS = 2000;

const descriptionSystemPrompt = [
  'You write a factual editorial description of a music video page from web',
  'search evidence, page excerpts, and verified facts.',
  'Aim for about 500 characters of prose (roughly 450-550; never exceed 900).',
  "Always mention the artist's name in the description.",
  'Describe the song, its artists, and its release context only.',
  'NEVER describe visuals or events in the video itself.',
  'When the evidence or excerpts contain a short, notable direct quote about',
  'the song or artist, include the best one or two, copied verbatim inside',
  'double quotation marks and attributed inline to the named publication or',
  'speaker (for example: "…" — Pitchfork). Never invent, alter, or extend a',
  'quote; omit quotes entirely when the material offers none.',
  'Use ONLY the evidence, excerpts, and facts provided; never invent facts,',
  'dates, or URLs.',
  'State when the song or video was released ONLY when the "Release date:" line',
  'supplies a date. When it reads "unknown", say nothing about when it came',
  'out — never call it new, recent, upcoming, or from any year, and never',
  'treat the current date as its release.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/**
 * The release-date line of the user prompt. A release date is never inferred
 * (ADR-0004 in the web app): a dateless draft says so explicitly rather than
 * omitting the line, so the model cannot fill the gap with "today".
 */
const releaseDateLine = (releasedOn: string | undefined): string =>
  releasedOn
    ? `Release date: ${releasedOn}.`
    : 'Release date: unknown (do not state or infer one).';

/** Builds the description user prompt from the evidence block (+ excerpts). */
const buildDescriptionPrompt =
  ({ title, artistDisplay, releasedOn, facts }: VideoDescriptionArgs) =>
  (evidence: string, excerpts?: string | null): string =>
    [
      `Video: "${title}" by ${artistDisplay}.`,
      releaseDateLine(releasedOn),
      facts.length > 0 ? `VERIFIED FACTS:\n${facts.map((fact) => `- ${fact}`).join('\n')}` : '',
      'EVIDENCE:',
      evidence,
      excerpts
        ? `PAGE EXCERPTS (quote ONLY from this verbatim page text or the evidence snippets):\n${excerpts}`
        : '',
      '',
      'Return JSON: {"description": "about 500 characters" or null,',
      '"sourceUrls": [evidence links used], "rationale": "<= 300 chars"}',
    ]
      .filter(Boolean)
      .join('\n');

/**
 * INFORMATIONAL prompt: the named artist is the video's creator (a person or
 * organisation), the prose covers the topic, and — with no release-date
 * adjudication in that flow — nothing may be said about when it was released.
 */
const informationalSystemPrompt = [
  'You write a factual editorial description of an informational video page',
  'from web search evidence.',
  'Aim for about 500 characters of prose (roughly 450-550; never exceed 900).',
  "Always name the video's creator — the person or organisation it is credited",
  'to — and frame them as its creator or subject, never as a musical artist.',
  'Describe what the video covers: its topic, the questions or ideas it takes',
  'up, and why the creator is a relevant voice on it.',
  'NEVER describe visuals or events in the video itself.',
  'Say nothing about when it was released — never call it new, recent,',
  'upcoming, or from any year, and never treat the current date as its release.',
  'Do not include quotations.',
  'Use ONLY the evidence provided; never invent facts, dates, names, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Builds the INFORMATIONAL user prompt: creator framing, evidence, no date line. */
const buildInformationalPrompt =
  ({ title, artistDisplay, facts }: VideoDescriptionArgs) =>
  (evidence: string): string =>
    [
      `Video: "${title}", an informational video by ${artistDisplay}.`,
      facts.length > 0 ? `VERIFIED FACTS:\n${facts.map((fact) => `- ${fact}`).join('\n')}` : '',
      'EVIDENCE:',
      evidence,
      '',
      'Return JSON: {"description": "about 500 characters" or null,',
      '"sourceUrls": [evidence links used], "rationale": "<= 300 chars"}',
    ]
      .filter(Boolean)
      .join('\n');

/**
 * Best-effort read of the top evidence pages (Jina Reader) for verbatim quote
 * material. A failed key lookup or page read skips that page; returns null
 * when nothing readable survived so the prompt omits the block entirely.
 */
const gatherQuoteExcerpts = async (
  evidence: SerperWebResult[],
  deps: VideoDescriptionDeps
): Promise<string | null> => {
  const readPage = deps.readPage ?? readUrl;
  const getKey = deps.getScrapeKey ?? getScrapeApiKey;
  const apiKey = await getKey().catch(() => null);

  const blocks: string[] = [];
  for (const { link } of evidence.slice(0, MAX_EXCERPT_PAGES)) {
    const page = await readPage(link, apiKey, undefined, deps.fetchOptions ?? {}).catch(() => null);
    if (page?.content) blocks.push(`[${link}]\n${page.content.slice(0, MAX_EXCERPT_CHARS)}`);
  }
  return blocks.length > 0 ? blocks.join('\n---\n') : null;
};

/** The category-specific parts of one description adjudication run. */
type DescriptionStrategy = Pick<
  AdjudicationRun<DescriptionAdjudication>,
  'queries' | 'systemPrompt' | 'buildUserPrompt' | 'augmentEvidence'
>;

/** MUSIC: three searches (incl. press reviews) plus page excerpts for quotes. */
const musicStrategy = (
  args: VideoDescriptionArgs,
  deps: VideoDescriptionDeps
): DescriptionStrategy => ({
  queries: [
    `"${args.artistDisplay}" "${args.title}"`,
    `${args.artistDisplay} ${args.title} song`,
    `${args.artistDisplay} ${args.title} review`,
  ],
  systemPrompt: descriptionSystemPrompt,
  buildUserPrompt: buildDescriptionPrompt(args),
  augmentEvidence: (evidence) => gatherQuoteExcerpts(evidence, deps),
});

/** INFORMATIONAL: two searches, no review sweep, no page reads (no quotes wanted). */
const informationalStrategy = (args: VideoDescriptionArgs): DescriptionStrategy => ({
  queries: [`"${args.artistDisplay}" "${args.title}"`, `${args.artistDisplay} ${args.title} video`],
  systemPrompt: informationalSystemPrompt,
  buildUserPrompt: buildInformationalPrompt(args),
});

/** Picks the strategy for the video's category; absent = MUSIC (pre-category invoke). */
const descriptionStrategy = (
  args: VideoDescriptionArgs,
  deps: VideoDescriptionDeps
): DescriptionStrategy =>
  args.category === 'INFORMATIONAL' ? informationalStrategy(args) : musicStrategy(args, deps);

/**
 * Synthesizes an editorial description (~500 characters, always naming the
 * artist). MUSIC weaves in verbatim press quotes with inline attribution when
 * the material offers them, from gathered facts, three web searches, and a
 * best-effort read of the top result pages; INFORMATIONAL frames the artist
 * as the video's creator from two web searches, with no quotes and no
 * release-date claim. Confidence is FIXED at medium (LLM-synthesized prose).
 * Never throws — failures degrade to null and the run continues.
 */
export const resolveDescriptionSuggestion = async (
  args: VideoDescriptionArgs,
  deps: VideoDescriptionDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null> => {
  try {
    const outcome = await adjudicate(
      {
        ...descriptionStrategy(args, deps),
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: descriptionAdjudicationSchema,
      },
      deps
    );
    if (!outcome) return null;
    const sourceUrls = enforceSourceSubset(outcome.parsed.sourceUrls, outcome.provided);
    const description = outcome.parsed.description?.trim();
    if (!description || sourceUrls.length === 0) return null;
    return {
      value: description,
      confidence: 'medium',
      sources: sourceUrls.map((url) => ({ url })),
      note: outcome.parsed.rationale,
    };
  } catch (err) {
    logEvent('warn', 'video_description_failed', { error: toErrorMessage(err) });
    return null;
  }
};
