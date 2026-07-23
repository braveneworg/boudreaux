/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey, getYoutubeApiKey } from './lib/secrets.js';
import { resolveReleaseDateSuggestion } from './release-date.js';
import { DEFAULT_GEMINI_MODEL, releaseDateLookupInputSchema } from './types.js';
import { findYoutubeReleaseDate } from './youtube.js';

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
  getYoutubeApiKey: typeof getYoutubeApiKey;
  resolveReleaseDateSuggestion: typeof resolveReleaseDateSuggestion;
  findYoutubeReleaseDate: typeof findYoutubeReleaseDate;
}

const defaultDeps: ReleaseDateLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  getYoutubeApiKey,
  resolveReleaseDateSuggestion,
  findYoutubeReleaseDate,
};

/** The flat shape the admin form consumes. */
type LookupResult = Extract<ReleaseDateLookupResult, { ok: true }>['result'];

/**
 * Tier 1 — the video's own YouTube upload. The platform's publish date IS the
 * premiere date being asked for, and it covers catalogues the open web never
 * documents. Returns null (so the caller falls through) when no key is
 * configured or nothing matched.
 */
const lookupViaYoutube = async (
  title: string,
  artist: string,
  deps: ReleaseDateLookupDeps
): Promise<LookupResult> => {
  const apiKey = await deps.getYoutubeApiKey();
  if (!apiKey) return null;

  const match = await deps.findYoutubeReleaseDate({ title, artist, apiKey });
  if (!match) return null;

  logEvent('info', 'release_date_from_youtube', { title, matched: match.title });
  return {
    releasedOn: match.releasedOn,
    confidence: match.confidence,
    sources: [match.url],
  };
};

/**
 * Tier 2 — the web adjudicator (two Serper searches + one Gemini JSON call).
 * Finds premiere dates for well-documented videos; returns null for anything
 * the open web does not cover.
 */
const lookupViaWeb = async (
  title: string,
  artist: string,
  deps: ReleaseDateLookupDeps
): Promise<LookupResult> => {
  const serperKey = await deps.getSerperApiKey();
  if (!serperKey) return null;
  const geminiKey = await deps.getGeminiApiKey();

  const suggestion = await deps.resolveReleaseDateSuggestion({
    title,
    artistDisplay: artist,
    serperKey,
    geminiKey,
    model: DEFAULT_GEMINI_MODEL,
  });
  if (!suggestion) return null;

  return {
    releasedOn: suggestion.value,
    confidence: suggestion.confidence,
    sources: suggestion.sources.map(({ url }) => url),
  };
};

/**
 * Synchronous release-date lookup for the admin video form, resolved through a
 * two-tier ladder: the video's own YouTube upload first, then the web
 * adjudicator. Never throws — a missing key, a miss in both tiers, or any
 * failure degrades to `result: null`.
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

  const { title } = parsed.data;
  const artist = parsed.data.artist ?? '';

  try {
    const result =
      (await lookupViaYoutube(title, artist, deps)) ?? (await lookupViaWeb(title, artist, deps));
    return { ok: true, result };
  } catch (err) {
    const message = toErrorMessage(err);
    logEvent('warn', 'release_date_lookup_failed', { error: message });
    return { ok: false, error: message };
  }
};
