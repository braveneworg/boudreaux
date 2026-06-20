/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { USER_AGENT } from './types.js';

import type { BioLink } from './types.js';

const MB_BASE = 'https://musicbrainz.org/ws/2';

/** Subset of the MusicBrainz artist search response we rely on. */
interface MbSearchResponse {
  artists?: Array<{ id: string; name: string; score?: number }>;
}

/** Subset of the artist lookup (with url-rels) response. */
interface MbRelationResponse {
  relations?: Array<{ type: string; url?: { resource: string } }>;
}

export interface MusicBrainzMatch {
  mbid: string;
  name: string;
  wikidataId?: string;
  links: BioLink[];
}

type FetchFn = typeof fetch;

const request = async <T>(url: string, fetchFn: FetchFn): Promise<T> => {
  const response = await fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`MusicBrainz request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
};

/** Maps a MusicBrainz relation type to our link taxonomy. */
const classifyRelation = (type: string): BioLink['kind'] => {
  if (type === 'wikipedia') return 'wikipedia';
  if (type === 'official homepage') return 'official';
  if (type === 'social network') return 'social';
  return 'other';
};

const extractWikidataId = (resource: string): string | undefined => {
  const match = resource.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i);
  return match?.[1];
};

/**
 * Looks up an artist on MusicBrainz by name and resolves its external
 * relations (Wikidata id, official site, Wikipedia, socials).
 *
 * @param name - The artist's display/real name to search for.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The best match with its Wikidata id and discovered links, or `null`
 * when no artist matches (obscure/local acts) so the caller can degrade.
 */
export const lookupArtist = async (
  name: string,
  fetchFn: FetchFn = fetch
): Promise<MusicBrainzMatch | null> => {
  const searchUrl = `${MB_BASE}/artist?query=${encodeURIComponent(name)}&fmt=json&limit=1`;
  const search = await request<MbSearchResponse>(searchUrl, fetchFn);
  const top = search.artists?.[0];
  if (!top) {
    return null;
  }

  const relUrl = `${MB_BASE}/artist/${top.id}?inc=url-rels&fmt=json`;
  const relData = await request<MbRelationResponse>(relUrl, fetchFn);

  let wikidataId: string | undefined;
  const links: BioLink[] = [];

  for (const relation of relData.relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;

    if (relation.type === 'wikidata') {
      wikidataId = extractWikidataId(resource);
    }

    const kind = classifyRelation(relation.type);
    if (kind === 'wikipedia' || kind === 'official' || kind === 'social') {
      links.push({ label: relation.type, url: resource, kind });
    }
  }

  links.push({
    label: 'MusicBrainz',
    url: `https://musicbrainz.org/artist/${top.id}`,
    kind: 'musicbrainz',
  });

  return { mbid: top.id, name: top.name, wikidataId, links };
};
