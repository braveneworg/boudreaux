/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { resolveReleaseNotesSuggestion } from './release-notes.js';
import { DEFAULT_GEMINI_MODEL, releaseNotesLookupInputSchema } from './types.js';

import type { ReleaseNotesLookupResult } from './types.js';

/** True when an unknown event is a `task: 'release-notes-lookup'` invoke. */
export const isReleaseNotesLookupTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'release-notes-lookup';

export interface ReleaseNotesLookupDeps {
  getSerperApiKey: typeof getSerperApiKey;
  getGeminiApiKey: typeof getGeminiApiKey;
  resolveReleaseNotesSuggestion: typeof resolveReleaseNotesSuggestion;
}

const defaultDeps: ReleaseNotesLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  resolveReleaseNotesSuggestion,
};

/**
 * Synchronous release-notes synthesis for the admin release form's "Generate
 * notes" button: three release-targeted web searches plus a best-effort read
 * of the top pages, adjudicated by Gemini into two or three paragraphs.
 * Requires a Serper key — without web evidence there is nothing to ground the
 * prose in, so the lookup degrades to `result: null` rather than inventing it.
 */
export const runReleaseNotesLookupLambda = async (
  event: unknown,
  deps: ReleaseNotesLookupDeps = defaultDeps
): Promise<ReleaseNotesLookupResult> => {
  const parsed = releaseNotesLookupInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  const { title, artist, releasedOn, catalogNumber, formats } = parsed.data;

  try {
    const serperKey = await deps.getSerperApiKey();
    if (!serperKey) return { ok: true, result: null };
    const geminiKey = await deps.getGeminiApiKey();

    const suggestion = await deps.resolveReleaseNotesSuggestion({
      title,
      artistDisplay: artist,
      ...(releasedOn ? { releasedOn } : {}),
      ...(catalogNumber ? { catalogNumber } : {}),
      ...(formats && formats.length > 0 ? { formats } : {}),
      serperKey,
      geminiKey,
      model: DEFAULT_GEMINI_MODEL,
    });
    if (!suggestion) return { ok: true, result: null };

    return {
      ok: true,
      result: {
        notes: suggestion.value,
        confidence: suggestion.confidence,
        sources: suggestion.sources.map(({ url }) => url),
      },
    };
  } catch (err) {
    const message = toErrorMessage(err);
    logEvent('warn', 'release_notes_lookup_failed', { error: message });
    return { ok: false, error: message };
  }
};
