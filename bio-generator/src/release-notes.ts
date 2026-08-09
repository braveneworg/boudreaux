/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { readUrl } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getScrapeApiKey } from './lib/secrets.js';
import { adjudicate, enforceSourceSubset } from './release-date.js';
import { DEFAULT_GEMINI_MODEL } from './types.js';

import type { AdjudicationDeps } from './release-date.js';
import type { SerperWebResult } from './serper.js';

/**
 * Gemini's JSON synthesis of release notes. Like the video description schema
 * there is no confidence field — synthesized prose is always medium.
 */
export const releaseNotesAdjudicationSchema = z.object({
  notes: z.array(z.string()).max(4).nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
});

/** Arguments for {@link resolveReleaseNotesSuggestion}. */
export interface ReleaseNotesArgs {
  title: string;
  artistDisplay: string;
  releasedOn?: string;
  catalogNumber?: string;
  /** Prisma `Format` enum values; humanized before they reach the prompt. */
  formats?: string[];
  serperKey: string;
  geminiKey: string;
  model?: string;
}

/** Release-notes deps: the shared adjudication seams plus the page reader tier. */
export interface ReleaseNotesDeps extends AdjudicationDeps {
  readPage?: typeof readUrl;
  getScrapeKey?: typeof getScrapeApiKey;
}

/** A synthesized set of note paragraphs with the sources they came from. */
export interface ReleaseNotesSuggestion {
  value: string[];
  confidence: 'medium';
  sources: Array<{ url: string }>;
  note: string;
}

/** How many top evidence pages are read for verbatim quote material. */
const MAX_EXCERPT_PAGES = 2;
/** Per-page excerpt cap, bounding the prompt size. */
const MAX_EXCERPT_CHARS = 2000;

/** `VINYL_12_INCH` → `Vinyl 12 Inch`, so the prompt reads as prose. */
const humanizeFormat = (format: string): string =>
  format
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const releaseNotesSystemPrompt = [
  'You write the release notes for a music record (album, EP, or single) from',
  'web search evidence and page excerpts.',
  'Write two or three short paragraphs, each roughly 300-600 characters.',
  "Always mention the artist's name in the first paragraph.",
  'Cover what the record is, how and when it was made, and how it was received.',
  'When the evidence or excerpts contain a short, notable direct quote about',
  'the record or artist, include the best one or two, copied verbatim inside',
  'double quotation marks and attributed inline to the named publication or',
  'speaker (for example: "…" — Pitchfork). Never invent, alter, or extend a',
  'quote; omit quotes entirely when the material offers none.',
  'Use ONLY the evidence and excerpts provided; never invent facts, dates,',
  'personnel, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Builds the release-notes user prompt from the evidence block (+ excerpts). */
const buildReleaseNotesPrompt =
  ({ title, artistDisplay, releasedOn, catalogNumber, formats }: ReleaseNotesArgs) =>
  (evidence: string, excerpts?: string | null): string =>
    [
      `Release: "${title}" by ${artistDisplay}.`,
      releasedOn ? `Release date: ${releasedOn}.` : '',
      catalogNumber ? `Catalog number: ${catalogNumber}.` : '',
      formats && formats.length > 0 ? `Formats: ${formats.map(humanizeFormat).join(', ')}.` : '',
      'EVIDENCE:',
      evidence,
      excerpts
        ? `PAGE EXCERPTS (quote ONLY from this verbatim page text or the evidence snippets):\n${excerpts}`
        : '',
      '',
      'Return JSON: {"notes": ["paragraph", "paragraph"] or null,',
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
  deps: ReleaseNotesDeps
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
 * Synthesizes release notes as two or three short paragraphs (always naming
 * the artist, weaving in verbatim press quotes with inline attribution when
 * the material offers them) from three release-targeted web searches and a
 * best-effort read of the top result pages. Confidence is FIXED at medium
 * (LLM-synthesized prose). Never throws — failures degrade to null.
 */
export const resolveReleaseNotesSuggestion = async (
  args: ReleaseNotesArgs,
  deps: ReleaseNotesDeps = {}
): Promise<ReleaseNotesSuggestion | null> => {
  try {
    const outcome = await adjudicate(
      {
        queries: [
          `"${args.artistDisplay}" "${args.title}" album`,
          `${args.artistDisplay} ${args.title} album review`,
          `${args.artistDisplay} ${args.title} liner notes`,
        ],
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: releaseNotesAdjudicationSchema,
        systemPrompt: releaseNotesSystemPrompt,
        buildUserPrompt: buildReleaseNotesPrompt(args),
        augmentEvidence: (evidence) => gatherQuoteExcerpts(evidence, deps),
      },
      deps
    );
    if (!outcome) return null;

    const sourceUrls = enforceSourceSubset(outcome.parsed.sourceUrls, outcome.provided);
    const paragraphs = (outcome.parsed.notes ?? [])
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    if (paragraphs.length === 0 || sourceUrls.length === 0) return null;

    return {
      value: paragraphs,
      confidence: 'medium',
      sources: sourceUrls.map((url) => ({ url })),
      note: outcome.parsed.rationale,
    };
  } catch (err) {
    logEvent('warn', 'release_notes_failed', { error: toErrorMessage(err) });
    return null;
  }
};
