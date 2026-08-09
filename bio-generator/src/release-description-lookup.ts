/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { resolveReleaseDescriptionSuggestion } from './release-description.js';
import { DEFAULT_GEMINI_MODEL, releaseDescriptionLookupInputSchema } from './types.js';

import type { ReleaseDescriptionLookupInput, ReleaseDescriptionLookupResult } from './types.js';

/** True when an unknown event is a `task: 'release-description-lookup'` invoke. */
export const isReleaseDescriptionLookupTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'release-description-lookup';

export interface ReleaseDescriptionLookupDeps {
  getSerperApiKey: typeof getSerperApiKey;
  getGeminiApiKey: typeof getGeminiApiKey;
  resolveReleaseDescriptionSuggestion: typeof resolveReleaseDescriptionSuggestion;
}

const defaultDeps: ReleaseDescriptionLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  resolveReleaseDescriptionSuggestion,
};

/** The optional release facts, omitted entirely when the admin has none. */
const buildOptionalContext = ({
  releasedOn,
  catalogNumber,
  formats,
}: Pick<ReleaseDescriptionLookupInput, 'releasedOn' | 'catalogNumber' | 'formats'>) => ({
  ...(releasedOn ? { releasedOn } : {}),
  ...(catalogNumber ? { catalogNumber } : {}),
  ...(formats && formats.length > 0 ? { formats } : {}),
});

/**
 * Synchronous blurb synthesis for the admin release form's "Generate blurb"
 * button: the label's own notes plus three release-targeted web searches and a
 * fourth seeded from those notes, adjudicated by Gemini into ~500 characters.
 * Requires a Serper key — without web evidence there is nothing to corroborate
 * against, so the lookup degrades to `result: null` rather than inventing it.
 */
export const runReleaseDescriptionLookupLambda = async (
  event: unknown,
  deps: ReleaseDescriptionLookupDeps = defaultDeps
): Promise<ReleaseDescriptionLookupResult> => {
  const parsed = releaseDescriptionLookupInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  const { title, artist, labelNotes } = parsed.data;

  try {
    const serperKey = await deps.getSerperApiKey();
    if (!serperKey) return { ok: true, result: null };
    const geminiKey = await deps.getGeminiApiKey();

    const suggestion = await deps.resolveReleaseDescriptionSuggestion({
      title,
      artistDisplay: artist,
      ...buildOptionalContext(parsed.data),
      labelNotes: labelNotes ?? [],
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
    logEvent('warn', 'release_description_lookup_failed', { error: message });
    return { ok: false, error: message };
  }
};
