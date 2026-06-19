/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { USER_AGENT } from './types.js';

type FetchFn = typeof fetch;

/** Minimal shape of the Wikidata EntityData JSON we read. */
interface WikidataEntities {
  entities?: Record<
    string,
    {
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
      sitelinks?: Record<string, { title?: string; url?: string }>;
    }
  >;
}

export interface WikidataData {
  /** Commons file names from the P18 (image) claim, e.g. "Radiohead 2008.jpg". */
  imageFileNames: string[];
  officialUrl?: string;
  wikipediaUrl?: string;
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };

const stringValues = (entries: Claim[] | undefined): string[] =>
  (entries ?? [])
    .map((entry) => entry.mainsnak?.datavalue?.value)
    .filter((value): value is string => typeof value === 'string');

/**
 * Fetches structured data for a Wikidata entity and extracts the artist's
 * image file name(s) (P18), official website (P856), and English Wikipedia URL.
 *
 * @param wikidataId - The entity id, e.g. `Q11649`.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The extracted media/link data; empty arrays when absent.
 */
export const getWikidataData = async (
  wikidataId: string,
  fetchFn: FetchFn = fetch
): Promise<WikidataData> => {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikidataId)}.json`;
  const response = await fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Wikidata request failed (${response.status}) for ${wikidataId}`);
  }

  const body = (await response.json()) as WikidataEntities;
  // The EntityData endpoint returns a single entity keyed by its id; read it
  // without a dynamic key lookup.
  const entity = Object.values(body.entities ?? {})[0];

  const imageFileNames = stringValues(entity?.claims?.P18);
  const officialUrl = stringValues(entity?.claims?.P856)[0];
  const wikipediaUrl = entity?.sitelinks?.enwiki?.url;

  return { imageFileNames, officialUrl, wikipediaUrl };
};
