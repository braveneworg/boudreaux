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
 * Gemini's JSON synthesis of a release blurb. Like the video description
 * schema there is no confidence field — synthesized prose is always medium.
 */
export const releaseDescriptionAdjudicationSchema = z.object({
  description: z.string().max(1200).nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
});

/** Arguments for {@link resolveReleaseDescriptionSuggestion}. */
export interface ReleaseDescriptionArgs {
  title: string;
  artistDisplay: string;
  releasedOn?: string;
  catalogNumber?: string;
  /** Prisma `Format` enum values; humanized before they reach the prompt. */
  formats?: string[];
  /**
   * The label's own release notes — authoritative context the blurb is built
   * from and must never contradict. Also seeds an extra corroborating search.
   */
  labelNotes: string[];
  serperKey: string;
  geminiKey: string;
  model?: string;
}

/** Blurb deps: the shared adjudication seams plus the page reader tier. */
export interface ReleaseDescriptionDeps extends AdjudicationDeps {
  readPage?: typeof readUrl;
  getScrapeKey?: typeof getScrapeApiKey;
}

/** A synthesized blurb with the sources it came from. */
export interface ReleaseDescriptionSuggestion {
  value: string;
  confidence: 'medium';
  sources: Array<{ url: string }>;
  note: string;
}

/** How many top evidence pages are read for verbatim quote material. */
const MAX_EXCERPT_PAGES = 2;
/** Per-page excerpt cap, bounding the prompt size. */
const MAX_EXCERPT_CHARS = 2000;
/** Words of the label's first note used to seed the corroborating search. */
const LABEL_SEED_WORDS = 10;

/** `VINYL_12_INCH` → `Vinyl 12 Inch`, so the prompt reads as prose. */
const humanizeFormat = (format: string): string =>
  format
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Builds a search query from the label's first note so the web is asked about
 * what the label actually knows, not just the release title. Returns null when
 * the label has nothing on file.
 */
const buildLabelSeedQuery = (artistDisplay: string, labelNotes: string[]): string | null => {
  const firstNote = labelNotes.map((note) => note.trim()).find(Boolean);
  if (!firstNote) return null;

  const [sentence = firstNote] = firstNote.split(/(?<=[.!?])\s+/);
  const seed = sentence
    .replace(/["']/g, '')
    .split(/\s+/)
    .slice(0, LABEL_SEED_WORDS)
    .join(' ')
    .trim();

  return seed ? `${artistDisplay} ${seed}` : null;
};

const releaseDescriptionSystemPrompt = [
  'You write a short editorial blurb for a music record (album, EP, or single)',
  "from the label's own notes, web search evidence, and page excerpts.",
  'Aim for about 500 characters of prose (roughly 450-550; never exceed 900).',
  "Always mention the artist's name in the blurb.",
  'The LABEL NOTES are authoritative: never contradict them, prefer their',
  'facts over anything found on the web, and build the blurb around them when',
  'they are present.',
  'When the evidence or excerpts contain a short, notable direct quote about',
  'the record or artist, include the best one, copied verbatim inside double',
  'quotation marks and attributed inline to the named publication or speaker',
  '(for example: "…" — Pitchfork). Never invent, alter, or extend a quote;',
  'omit quotes entirely when the material offers none.',
  'Use ONLY the label notes, evidence, and excerpts provided; never invent',
  'facts, dates, personnel, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Builds the blurb user prompt from the label notes + evidence (+ excerpts). */
const buildReleaseDescriptionPrompt =
  ({
    title,
    artistDisplay,
    releasedOn,
    catalogNumber,
    formats,
    labelNotes,
  }: ReleaseDescriptionArgs) =>
  (evidence: string, excerpts?: string | null): string =>
    [
      `Release: "${title}" by ${artistDisplay}.`,
      releasedOn ? `Release date: ${releasedOn}.` : '',
      catalogNumber ? `Catalog number: ${catalogNumber}.` : '',
      formats && formats.length > 0 ? `Formats: ${formats.map(humanizeFormat).join(', ')}.` : '',
      labelNotes.length > 0
        ? `LABEL NOTES (authoritative — from the label's own files):\n${labelNotes
            .map((note) => `- ${note}`)
            .join('\n')}`
        : '',
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
  deps: ReleaseDescriptionDeps
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
 * Synthesizes the short listing blurb (~500 characters, always naming the
 * artist) from the label's own release notes, three release-targeted web
 * searches plus a fourth seeded from those notes, and a best-effort read of
 * the top result pages. The label notes win any disagreement with the web.
 *
 * Confidence is FIXED at medium (LLM-synthesized prose). Never throws —
 * failures degrade to null. A blurb with no citable sources survives only
 * when the label notes are grounding it.
 */
export const resolveReleaseDescriptionSuggestion = async (
  args: ReleaseDescriptionArgs,
  deps: ReleaseDescriptionDeps = {}
): Promise<ReleaseDescriptionSuggestion | null> => {
  try {
    const labelQuery = buildLabelSeedQuery(args.artistDisplay, args.labelNotes);
    const outcome = await adjudicate(
      {
        queries: [
          `"${args.artistDisplay}" "${args.title}" album`,
          `${args.artistDisplay} ${args.title} album review`,
          `${args.artistDisplay} ${args.title} liner notes`,
          ...(labelQuery ? [labelQuery] : []),
        ],
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: releaseDescriptionAdjudicationSchema,
        systemPrompt: releaseDescriptionSystemPrompt,
        buildUserPrompt: buildReleaseDescriptionPrompt(args),
        augmentEvidence: (evidence) => gatherQuoteExcerpts(evidence, deps),
      },
      deps
    );
    if (!outcome) return null;

    const sourceUrls = enforceSourceSubset(outcome.parsed.sourceUrls, outcome.provided);
    const description = outcome.parsed.description?.trim();
    // Sources are the grounding when the label has nothing on file; when it
    // does, its notes are, so a source-less blurb is still anchored.
    if (!description) return null;
    if (sourceUrls.length === 0 && args.labelNotes.length === 0) return null;

    return {
      value: description,
      confidence: 'medium',
      sources: sourceUrls.map((url) => ({ url })),
      note: outcome.parsed.rationale,
    };
  } catch (err) {
    logEvent('warn', 'release_description_failed', { error: toErrorMessage(err) });
    return null;
  }
};
