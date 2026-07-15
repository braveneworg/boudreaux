/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { resolveReleaseDateSuggestion } from './release-date.js';
import { DEFAULT_GEMINI_MODEL, releaseDateLookupInputSchema } from './types.js';

import type { ReleaseDateLookupResult } from './types.js';

/** True when an unknown event is a `task: 'release-date-lookup'` invoke. */
export const isReleaseDateLookupTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'release-date-lookup';

export interface ReleaseDateLookupDeps {
  getSerperApiKey: typeof getSerperApiKey;
  getGeminiApiKey: typeof getGeminiApiKey;
  resolveReleaseDateSuggestion: typeof resolveReleaseDateSuggestion;
}

const defaultDeps: ReleaseDateLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  resolveReleaseDateSuggestion,
};

/**
 * Synchronous release-date lookup for the admin video form. Reuses the video
 * enrichment adjudicator (two Serper searches + one Gemini JSON call) and maps
 * its suggestion to a flat `{ releasedOn, confidence, sources }`. Never throws —
 * a missing Serper key, an adjudication miss, or any failure degrades to
 * `result: null`.
 */
export const runReleaseDateLookupLambda = async (
  event: unknown,
  deps: ReleaseDateLookupDeps = defaultDeps
): Promise<ReleaseDateLookupResult> => {
  const parsed = releaseDateLookupInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  try {
    const serperKey = await deps.getSerperApiKey();
    if (!serperKey) return { ok: true, result: null };
    const geminiKey = await deps.getGeminiApiKey();

    const suggestion = await deps.resolveReleaseDateSuggestion({
      title: parsed.data.title,
      artistDisplay: parsed.data.artist ?? '',
      serperKey,
      geminiKey,
      model: DEFAULT_GEMINI_MODEL,
    });
    if (!suggestion) return { ok: true, result: null };

    return {
      ok: true,
      result: {
        releasedOn: suggestion.value,
        confidence: suggestion.confidence,
        sources: suggestion.sources.map(({ url }) => url),
      },
    };
  } catch (err) {
    logEvent('warn', 'release_date_lookup_failed', { error: toErrorMessage(err) });
    return { ok: false, error: err instanceof Error ? err.message : 'Release date lookup failed' };
  }
};
