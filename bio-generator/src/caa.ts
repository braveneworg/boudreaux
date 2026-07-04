/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { USER_AGENT } from './types.js';

import type { ReleaseGroupSummary } from './musicbrainz.js';
import type { BioImage } from './types.js';

type FetchFn = typeof fetch;

const CAA_BASE = 'https://coverartarchive.org/release-group';
/** Simultaneous CAA lookups — the archive is slow but tolerant. */
const CAA_CONCURRENCY = 4;

/** Subset of the CAA release-group response we rely on. */
interface CaaResponse {
  images?: Array<{
    front?: boolean;
    image?: string;
    thumbnails?: Record<string, string>;
  }>;
}

const toCoverImage = (body: CaaResponse, group: ReleaseGroupSummary): BioImage | null => {
  const front = (body.images ?? []).find((image) => image.front) ?? body.images?.[0];
  const url = front?.thumbnails?.['500'] ?? front?.image;
  if (!url) return null;
  return {
    url,
    thumbnailUrl: front?.thumbnails?.['250'] ?? null,
    title: group.title,
    attribution: 'Cover Art Archive',
    license: null,
    sourceUrl: `https://musicbrainz.org/release-group/${group.rgMbid}`,
    width: null,
    height: null,
    isPrimary: false,
    kind: 'cover',
    alt: `${group.title} album cover`,
  };
};

const fetchCover = async (
  group: ReleaseGroupSummary,
  fetchFn: FetchFn
): Promise<BioImage | null> => {
  try {
    const response = await fetchFn(`${CAA_BASE}/${group.rgMbid}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return toCoverImage((await response.json()) as CaaResponse, group);
  } catch (err) {
    logEvent('warn', 'caa_lookup_failed', { rgMbid: group.rgMbid, error: toErrorMessage(err) });
    return null;
  }
};

/**
 * Resolves front cover art for the artist's release groups via the Cover Art
 * Archive — album art with clean provenance (the release group IS the
 * artist's), so no vision verification is needed. Best-effort per group;
 * stops once `maxCovers` covers are collected.
 */
export const getCoverArtImages = async (
  groups: ReleaseGroupSummary[],
  maxCovers: number,
  fetchFn: FetchFn = fetch
): Promise<BioImage[]> => {
  const covers: BioImage[] = [];
  for (let i = 0; i < groups.length && covers.length < maxCovers; i += CAA_CONCURRENCY) {
    const batch = groups.slice(i, i + CAA_CONCURRENCY);
    const resolved = await Promise.all(batch.map((group) => fetchCover(group, fetchFn)));
    for (const image of resolved) {
      if (image && covers.length < maxCovers) covers.push(image);
    }
  }
  return covers;
};
