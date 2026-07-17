/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { logEvent, toErrorMessage } from './lib/log.js';
import { adjudicate, enforceSourceSubset } from './release-date.js';
import { DEFAULT_GEMINI_MODEL } from './types.js';

import type { AdjudicationDeps } from './release-date.js';
import type { VideoSuggestion } from './types.js';

/**
 * Gemini's JSON synthesis of a short editorial description. No confidence field
 * exists here — description prose is always emitted at fixed medium confidence.
 */
export const descriptionAdjudicationSchema = z.object({
  description: z.string().max(1200).nullable(),
  sourceUrls: z.array(z.string().url()).max(10),
  rationale: z.string().max(300),
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

const descriptionSystemPrompt = [
  'You write a short, factual editorial description (2-4 sentences) of a music',
  'video page from web search evidence and verified facts.',
  'Describe the song, its artists, and its release context only.',
  'NEVER describe visuals or events in the video itself.',
  'Use ONLY the evidence and facts provided; never invent facts, dates, or URLs.',
  'sourceUrls MUST be copied verbatim from the evidence links.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Builds the description user prompt from the numbered evidence block. */
const buildDescriptionPrompt =
  ({ title, artistDisplay, releasedOn, facts }: VideoDescriptionArgs) =>
  (evidence: string): string =>
    [
      `Video: "${title}" by ${artistDisplay}.`,
      releasedOn ? `Release date: ${releasedOn}.` : '',
      facts.length > 0 ? `VERIFIED FACTS:\n${facts.map((fact) => `- ${fact}`).join('\n')}` : '',
      'EVIDENCE:',
      evidence,
      '',
      'Return JSON: {"description": "2-4 sentences" or null,',
      '"sourceUrls": [evidence links used], "rationale": "<= 300 chars"}',
    ]
      .filter(Boolean)
      .join('\n');

/**
 * Synthesizes a short editorial description from gathered facts + two web
 * searches. Confidence is FIXED at medium (LLM-synthesized prose). Never
 * throws — failures degrade to null and the run continues.
 */
export const resolveDescriptionSuggestion = async (
  args: VideoDescriptionArgs,
  deps: AdjudicationDeps = {}
): Promise<Omit<VideoSuggestion, 'field'> | null> => {
  try {
    const outcome = await adjudicate(
      {
        queries: [
          `"${args.artistDisplay}" "${args.title}"`,
          `${args.artistDisplay} ${args.title} song`,
        ],
        serperKey: args.serperKey,
        geminiKey: args.geminiKey,
        model: args.model ?? DEFAULT_GEMINI_MODEL,
        schema: descriptionAdjudicationSchema,
        systemPrompt: descriptionSystemPrompt,
        buildUserPrompt: buildDescriptionPrompt(args),
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
