/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { DEFAULT_GEMINI_MODEL, videoDescriptionLookupInputSchema } from './types.js';
import { resolveDescriptionSuggestion } from './video-description.js';

import type { VideoDescriptionLookupResult } from './types.js';

/** True when an unknown event is a `task: 'video-description-lookup'` invoke. */
export const isVideoDescriptionLookupTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'video-description-lookup';

export interface VideoDescriptionLookupDeps {
  getSerperApiKey: typeof getSerperApiKey;
  getGeminiApiKey: typeof getGeminiApiKey;
  resolveDescriptionSuggestion: typeof resolveDescriptionSuggestion;
}

const defaultDeps: VideoDescriptionLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  resolveDescriptionSuggestion,
};

/**
 * Synchronous description synthesis for the admin video form's "Generate
 * description" button: the same web-evidence + page-excerpt + Gemini pipeline
 * the async enrichment uses, minus the MusicBrainz facts (too slow for a
 * request/response invoke). Requires a Serper key — without web evidence
 * there is nothing to ground the prose in, so the lookup degrades to
 * `result: null` rather than inventing text.
 */
export const runVideoDescriptionLookupLambda = async (
  event: unknown,
  deps: VideoDescriptionLookupDeps = defaultDeps
): Promise<VideoDescriptionLookupResult> => {
  const parsed = videoDescriptionLookupInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  const { title, artist, releasedOn } = parsed.data;

  try {
    const serperKey = await deps.getSerperApiKey();
    if (!serperKey) return { ok: true, result: null };
    const geminiKey = await deps.getGeminiApiKey();

    const suggestion = await deps.resolveDescriptionSuggestion({
      title,
      artistDisplay: artist,
      ...(releasedOn ? { releasedOn } : {}),
      facts: [],
      serperKey,
      geminiKey,
      model: DEFAULT_GEMINI_MODEL,
    });
    if (!suggestion) return { ok: true, result: null };

    return {
      ok: true,
      result: {
        description: suggestion.value,
        confidence: suggestion.confidence,
        sources: suggestion.sources.map(({ url }) => url),
      },
    };
  } catch (err) {
    const message = toErrorMessage(err);
    logEvent('warn', 'video_description_lookup_failed', { error: message });
    return { ok: false, error: message };
  }
};
