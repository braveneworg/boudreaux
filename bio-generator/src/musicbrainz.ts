/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fetchWithRetry, sleep } from './lib/http.js';
import { logEvent } from './lib/log.js';
import { USER_AGENT } from './types.js';

import type { FetchRetryOptions } from './lib/http.js';
import type { BioLink } from './types.js';

const MB_BASE = 'https://musicbrainz.org/ws/2';

/** MusicBrainz asks for ≤1 request/second per IP; space the search + lookup. */
const MB_RATE_LIMIT_MS = 1100;

/** Subset of the MusicBrainz artist search response we rely on. */
interface MbSearchResponse {
  artists?: Array<{ id: string; name: string; score?: number }>;
}

/** Subset of the artist lookup (with url-rels + tags) response. */
interface MbLookupResponse {
  type?: string;
  area?: { name?: string };
  'life-span'?: { begin?: string; end?: string };
  tags?: Array<{ name?: string; count?: number }>;
  relations?: Array<{ type: string; url?: { resource: string } }>;
}

export interface MusicBrainzMatch {
  mbid: string;
  name: string;
  wikidataId?: string;
  links: BioLink[];
  /** Structured grounding facts, best-effort from the lookup response. */
  artistType?: string;
  area?: string;
  beginDate?: string;
  endDate?: string;
  tags: string[];
}

/** Most-used tags first, capped — MusicBrainz tags are folksonomic and noisy. */
const MAX_TAGS = 8;

const topTags = (tags: MbLookupResponse['tags']): string[] =>
  (tags ?? [])
    .filter((tag): tag is { name: string; count?: number } => Boolean(tag.name))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, MAX_TAGS)
    .map((tag) => tag.name);

type FetchFn = typeof fetch;

const request = async <T>(url: string, options: FetchRetryOptions): Promise<T> => {
  const response = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    options
  );
  if (!response.ok) {
    logEvent('warn', 'musicbrainz_request_failed', { url, status: response.status });
    throw new Error(`MusicBrainz request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
};

/** MusicBrainz relation types that map to streaming/purchasing services. */
const STREAMING_RELATION_TYPES = new Set(['streaming', 'free streaming', 'purchase for download']);

/**
 * MusicBrainz relation types that map to a named service. Previously dropped
 * entirely; surfaced now so the palette can offer Discogs/YouTube/etc. links
 * with descriptive labels instead of nothing.
 */
const SERVICE_RELATIONS = new Map<string, { label: string; kind: NonNullable<BioLink['kind']> }>([
  ['discogs', { label: 'Discogs', kind: 'other' }],
  ['youtube', { label: 'YouTube', kind: 'social' }],
  ['video channel', { label: 'YouTube', kind: 'social' }],
  ['soundcloud', { label: 'SoundCloud', kind: 'streaming' }],
  ['bandcamp', { label: 'Bandcamp', kind: 'streaming' }],
  ['allmusic', { label: 'AllMusic', kind: 'press' }],
  ['last.fm', { label: 'Last.fm', kind: 'other' }],
]);

/** Maps a MusicBrainz relation type to our link taxonomy. */
const classifyRelation = (type: string): BioLink['kind'] => {
  if (type === 'wikipedia') return 'wikipedia';
  if (type === 'official homepage') return 'official';
  if (type === 'social network') return 'social';
  if (STREAMING_RELATION_TYPES.has(type)) return 'streaming';
  return 'other';
};

const extractWikidataId = (resource: string): string | undefined => {
  const match = resource.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i);
  return match?.[1];
};

/** Returns the hostname from a URL string, or `null` if the URL is unparseable. */
const hostnameFromUrl = (resource: string): string | null => {
  try {
    return new URL(resource).hostname;
  } catch {
    return null;
  }
};

/**
 * Maps a single MusicBrainz url-relation to a {@link BioLink}, or `null` when
 * the relation type is not surfaced in the UI (e.g. purchase links, other).
 * Streaming links use the hostname as the label instead of the raw type string.
 */
const relationToLink = (type: string, resource: string): BioLink | null => {
  const service = SERVICE_RELATIONS.get(type);
  if (service) {
    return { label: service.label, url: resource, kind: service.kind };
  }
  const kind = classifyRelation(type);
  if (kind === 'wikipedia' || kind === 'official' || kind === 'social') {
    return { label: type, url: resource, kind };
  }
  if (kind === 'streaming') {
    const hostname = hostnameFromUrl(resource);
    if (!hostname) return null;
    return { label: hostname.replace(/^www\./, ''), url: resource, kind };
  }
  return null;
};

/**
 * Walks the artist's url-relations once, collecting the Wikidata id and the
 * Wikipedia/official/social links (other kinds are dropped).
 */
const collectRelations = (
  relations: MbLookupResponse['relations']
): { wikidataId?: string; links: BioLink[] } => {
  let wikidataId: string | undefined;
  const links: BioLink[] = [];

  for (const relation of relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;

    if (relation.type === 'wikidata') {
      wikidataId = extractWikidataId(resource);
    }

    const link = relationToLink(relation.type, resource);
    if (link) links.push(link);
  }

  return { wikidataId, links };
};

/** One release group from the browse endpoint — chronology + cover-art seed. */
export interface ReleaseGroupSummary {
  rgMbid: string;
  title: string;
  firstReleaseDate: string | null;
  primaryType: string | null;
}

/** Subset of the release-group browse response we rely on. */
interface MbReleaseGroupResponse {
  'release-groups'?: Array<{
    id?: string;
    title?: string;
    'first-release-date'?: string;
    'primary-type'?: string | null;
  }>;
}

const MAX_RELEASE_GROUPS = 50;

/**
 * Browses the artist's release groups (albums, EPs, singles) — the titles and
 * first-release dates anchor the chronology table, and the MBIDs seed Cover
 * Art Archive lookups. Sleeps the MusicBrainz rate limit BEFORE requesting so
 * it can safely follow other MB calls. Best-effort: failures return [].
 */
export const listReleaseGroups = async (
  mbid: string,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<ReleaseGroupSummary[]> => {
  await (options.sleep ?? sleep)(MB_RATE_LIMIT_MS);
  const url = `${MB_BASE}/release-group?artist=${encodeURIComponent(mbid)}&limit=${MAX_RELEASE_GROUPS}&fmt=json`;
  try {
    const body = await request<MbReleaseGroupResponse>(url, { ...options, fetchFn });
    return (body['release-groups'] ?? [])
      .filter((group): group is { id: string; title: string } & typeof group =>
        Boolean(group.id && group.title)
      )
      .map((group) => ({
        rgMbid: group.id,
        title: group.title,
        firstReleaseDate: group['first-release-date']?.trim() || null,
        primaryType: group['primary-type'] ?? null,
      }));
  } catch (err) {
    logEvent('warn', 'musicbrainz_release_groups_failed', { mbid, error: String(err) });
    return [];
  }
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
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<MusicBrainzMatch | null> => {
  const requestOptions: FetchRetryOptions = { ...options, fetchFn };
  const searchUrl = `${MB_BASE}/artist?query=${encodeURIComponent(name)}&fmt=json&limit=1`;
  const search = await request<MbSearchResponse>(searchUrl, requestOptions);
  const top = search.artists?.[0];
  if (!top) {
    return null;
  }

  // Respect the per-IP rate limit between the search and the lookup call.
  await (options.sleep ?? sleep)(MB_RATE_LIMIT_MS);

  const relUrl = `${MB_BASE}/artist/${top.id}?inc=url-rels+tags&fmt=json`;
  const relData = await request<MbLookupResponse>(relUrl, requestOptions);

  const { wikidataId, links } = collectRelations(relData.relations);

  links.push({
    label: 'MusicBrainz',
    url: `https://musicbrainz.org/artist/${top.id}`,
    kind: 'musicbrainz',
  });

  return {
    mbid: top.id,
    name: top.name,
    wikidataId,
    links,
    artistType: relData.type,
    area: relData.area?.name,
    beginDate: relData['life-span']?.begin,
    endDate: relData['life-span']?.end,
    tags: topTags(relData.tags),
  };
};
