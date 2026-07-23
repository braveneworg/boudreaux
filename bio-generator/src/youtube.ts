/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';

type FetchFn = typeof fetch;

/** YouTube Data API v3 search endpoint. */
const YOUTUBE_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

/** Hits pulled per lookup — deep enough to see past covers and reuploads. */
const MAX_CANDIDATES = 10;

/** Score at or above which the artist appeared in the upload's own title. */
const STRONG_MATCH_SCORE = 3;

/**
 * One matched YouTube upload. The platform's own publish date IS the video's
 * premiere date, which is the fact the admin form is asking for — unlike a
 * song/album release date, which dates the recording rather than the video.
 */
export interface YoutubeReleaseDateMatch {
  /** Premiere day, YYYY-MM-DD. */
  releasedOn: string;
  confidence: 'high' | 'medium';
  /** Watch URL of the matched upload — the citation shown to the admin. */
  url: string;
  /** The upload's YouTube title, so a wrong match is obvious on review. */
  title: string;
}

/** Subset of the search response we read. */
interface YoutubeSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
  }>;
}

/** Google's error envelope, when the response carries one. */
interface YoutubeErrorResponse {
  error?: { message?: string; errors?: Array<{ reason?: string }> };
}

/**
 * Google's own reason for refusing the request — `keyInvalid`,
 * `accessNotConfigured`, `quotaExceeded`, and so on. Worth the extra read:
 * logging only the status makes a rejected key look identical to a search that
 * legitimately found nothing, which is precisely how a broken lookup hides.
 * Never throws, and the body carries no credential.
 */
const readErrorReason = async (response: Response): Promise<string | undefined> => {
  try {
    const body = (await response.json()) as YoutubeErrorResponse;
    return body.error?.errors?.[0]?.reason ?? body.error?.message;
  } catch {
    return undefined;
  }
};

/**
 * Comparable form of a title or name: bracketed decorations are dropped, so
 * "(Animated Video)" / "[HD]" never defeat a match, and the rest is reduced to
 * single-spaced alphanumerics.
 */
export const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * How well one search hit matches the video being dated. Zero rejects it: with
 * the song title absent from the upload's own title there is no reason to
 * believe it is the same video, and dating a video from someone else's upload
 * is worse than returning nothing. Above that, the artist appearing in the
 * title outranks it merely appearing on the channel.
 */
export const scoreYoutubeCandidate = (
  candidate: { title: string; channelTitle: string },
  target: { title: string; artist: string }
): number => {
  const title = normalizeForMatch(target.title);
  const artist = normalizeForMatch(target.artist);
  const candidateTitle = normalizeForMatch(candidate.title);
  if (!title || !candidateTitle.includes(title)) return 0;

  const inTitle = Boolean(artist) && candidateTitle.includes(artist);
  const onChannel = Boolean(artist) && normalizeForMatch(candidate.channelTitle).includes(artist);
  return 1 + (inTitle ? 2 : 0) + (onChannel ? 1 : 0);
};

/** A scored, citable candidate built from one search hit. */
interface ScoredCandidate {
  score: number;
  releasedOn: string;
  url: string;
  title: string;
}

/** `publishedAt` reduced to its UTC day, or null when it is not a date. */
const toDay = (publishedAt: string): string | null => {
  const day = publishedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

/** Map one search hit to a scored candidate, or null when it is unusable. */
const toScoredCandidate = (
  item: NonNullable<YoutubeSearchResponse['items']>[number],
  target: { title: string; artist: string }
): ScoredCandidate | null => {
  const videoId = item.id?.videoId;
  const snippet = item.snippet;
  if (!videoId || !snippet?.title || !snippet.publishedAt) return null;

  const releasedOn = toDay(snippet.publishedAt);
  if (!releasedOn) return null;

  const score = scoreYoutubeCandidate(
    { title: snippet.title, channelTitle: snippet.channelTitle ?? '' },
    target
  );
  if (score === 0) return null;

  return {
    score,
    releasedOn,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title,
  };
};

/** Arguments for {@link findYoutubeReleaseDate}. */
export interface YoutubeReleaseDateArgs {
  title: string;
  artist: string;
  apiKey: string;
}

/**
 * Date a music video from its YouTube upload. Searches the Data API for the
 * artist + title, keeps only hits whose own title carries the song title, and
 * returns the best one's publish date.
 *
 * Best-effort: a quota error, a miss, or a thrown fetch all degrade to `null`
 * so the caller can fall through to the web adjudication. Never throws, and
 * never logs the request URL (it carries the API key).
 */
export const findYoutubeReleaseDate = async (
  { title, artist, apiKey }: YoutubeReleaseDateArgs,
  fetchFn: FetchFn = fetch
): Promise<YoutubeReleaseDateMatch | null> => {
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(MAX_CANDIDATES),
      q: [artist, title].filter(Boolean).join(' ').trim(),
      key: apiKey,
    });
    const response = await fetchFn(`${YOUTUBE_SEARCH_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      const reason = await readErrorReason(response);
      logEvent('warn', 'youtube_search_failed', {
        status: response.status,
        ...(reason ? { reason } : {}),
      });
      return null;
    }

    const body = (await response.json()) as YoutubeSearchResponse;
    const scored = (body.items ?? [])
      .map((item) => toScoredCandidate(item, { title, artist }))
      .filter((candidate): candidate is ScoredCandidate => candidate !== null);
    if (scored.length === 0) return null;

    // Best match wins; ties go to the earliest upload, since a reupload can
    // only be later than the premiere actually being looked for.
    scored.sort((a, b) => b.score - a.score || a.releasedOn.localeCompare(b.releasedOn));
    const [best] = scored;

    return {
      releasedOn: best.releasedOn,
      confidence: best.score >= STRONG_MATCH_SCORE ? 'high' : 'medium',
      url: best.url,
      title: best.title,
    };
  } catch (err) {
    logEvent('warn', 'youtube_search_failed', { error: toErrorMessage(err) });
    return null;
  }
};
