/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { readUrl } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getScrapeApiKey } from './lib/secrets.js';
import { adjudicate, boundedRationale, enforceSourceSubset } from './release-date.js';
import { DEFAULT_GEMINI_MODEL } from './types.js';

import type { AdjudicationDeps } from './release-date.js';
import type { SerperWebResult } from './serper.js';
import type { VideoSuggestion } from './types.js';

/** The hard ceiling the system prompt states; enforced here by truncation. */
const MAX_DESCRIPTION_CHARS = 900;

/** A sentence terminator, optionally inside a closing quote or bracket. */
const SENTENCE_END = /[.!?]["'’”)\]]?(?=\s|$)/g;

/** A dash-led inline attribution ("…" — Pitchfork) continuing the sentence. */
const LEADS_ATTRIBUTION = /^\s*[—–-]/;

/**
 * Trims an overlong description back to the last whole sentence within the
 * cap. A terminator followed by a dash attribution is not a cut point —
 * stopping there would publish a quote stripped of its source — so the whole
 * quote is dropped instead. Prose offering no boundary at all is hard-cut.
 */
const truncateDescription = (value: string): string => {
  if (value.length <= MAX_DESCRIPTION_CHARS) return value;
  const window = value.slice(0, MAX_DESCRIPTION_CHARS);

  let cut = 0;
  for (const match of window.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    if (!LEADS_ATTRIBUTION.test(window.slice(end))) cut = end;
  }
  const kept = cut > 0 ? window.slice(0, cut) : window;
  // `kept` can fall well short of the cap when the backoff drops a quote —
  // routine truncation means the prompt, not the schema, needs the fix.
  logEvent('warn', 'description_truncated', {
    length: value.length,
    cap: MAX_DESCRIPTION_CHARS,
    kept: kept.length,
  });
  return kept;
};

/**
 * Gemini's JSON synthesis of an editorial description. No confidence field
 * exists here — description prose is always emitted at fixed medium confidence.
 * An overlong description is truncated rather than rejected: the prose is
 * sound, only its length overshoots what the prompt asked for.
 */
export const descriptionAdjudicationSchema = z.object({
  description: z.string().transform(truncateDescription).nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: boundedRationale('description'),
});

/** Arguments for {@link resolveDescriptionSuggestion}. */
export interface VideoDescriptionArgs {
  title: string;
  artistDisplay: string;
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
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Builds the description user prompt from the evidence block (+ excerpts). */
const buildDescriptionPrompt =
  ({ title, artistDisplay, releasedOn, facts }: VideoDescriptionArgs) =>
  (evidence: string, excerpts?: string | null): string =>
    [
      `Video: "${title}" by ${artistDisplay}.`,
      releasedOn ? `Release date: ${releasedOn}.` : '',
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

/**
 * Synthesizes an editorial description (~500 characters, always naming the
 * artist, weaving in verbatim press quotes with inline attribution when the
 * material offers them) from gathered facts, three web searches, and a
 * best-effort read of the top result pages. Confidence is FIXED at medium
 * (LLM-synthesized prose). Never throws — failures degrade to null and the
 * run continues.
 */
export const resolveDescriptionSuggestion = async (
  args: VideoDescriptionArgs,
  deps: VideoDescriptionDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null> => {
  try {
    const outcome = await adjudicate(
      {
        queries: [
          `"${args.artistDisplay}" "${args.title}"`,
          `${args.artistDisplay} ${args.title} song`,
          `${args.artistDisplay} ${args.title} review`,
        ],
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: descriptionAdjudicationSchema,
        systemPrompt: descriptionSystemPrompt,
        buildUserPrompt: buildDescriptionPrompt(args),
        augmentEvidence: (evidence) => gatherQuoteExcerpts(evidence, deps),
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
