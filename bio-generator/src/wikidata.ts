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
      labels?: Record<string, { value?: string }>;
      aliases?: Record<string, Array<{ value?: string }>>;
    }
  >;
}

export interface WikidataData {
  /** Commons file names from the P18 (image) claim, e.g. "Radiohead 2008.jpg". */
  imageFileNames: string[];
  officialUrl?: string;
  wikipediaUrl?: string;
  /** Commons category name from P373, e.g. "Ceschi" (no `Category:` prefix). */
  commonsCategory?: string;
  /** P569 date of birth (YYYY-MM-DD) with its precision (11 = day). */
  dateOfBirth?: { value: string; precision: number };
  /** P1477 birth name (monolingual text), when claimed. */
  birthName?: string;
  /** English "also known as" aliases. */
  aliases: string[];
  /** English label of the entity. */
  entityLabel?: string;
  /** P106 occupation entity ids (e.g. Q639669 = musician). */
  occupationIds: string[];
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };

const stringValues = (entries: Claim[] | undefined): string[] =>
  (entries ?? [])
    .map((entry) => entry.mainsnak?.datavalue?.value)
    .filter((value): value is string => typeof value === 'string');

/** A Wikidata time datavalue (`+YYYY-MM-DDT00:00:00Z` + precision). */
interface WikidataTimeValue {
  time: string;
  precision: number;
}

const isTimeValue = (value: unknown): value is WikidataTimeValue => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { time?: unknown; precision?: unknown };
  return typeof candidate.time === 'string' && typeof candidate.precision === 'number';
};

const timeValues = (entries: Claim[] | undefined): Array<{ value: string; precision: number }> =>
  (entries ?? [])
    .map((entry) => entry.mainsnak?.datavalue?.value)
    .filter(isTimeValue)
    .map((value) => ({
      value: value.time.replace(/^\+/, '').slice(0, 10),
      precision: value.precision,
    }));

const isMonolingualValue = (value: unknown): value is { text: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { text?: unknown }).text === 'string';

const monolingualValues = (entries: Claim[] | undefined): string[] =>
  (entries ?? [])
    .map((entry) => entry.mainsnak?.datavalue?.value)
    .filter(isMonolingualValue)
    .map((value) => value.text);

const isEntityIdValue = (value: unknown): value is { id: string } =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

const entityIdValues = (entries: Claim[] | undefined): string[] =>
  (entries ?? [])
    .map((entry) => entry.mainsnak?.datavalue?.value)
    .filter(isEntityIdValue)
    .map((value) => value.id);

/** The single entity in a parsed EntityData body, keyed by its (unknown) id. */
type WikidataEntity = NonNullable<WikidataEntities['entities']>[string];

/** English "also known as" aliases, dropping any without a value. */
const englishAliases = (entity: WikidataEntity | undefined): string[] =>
  (entity?.aliases?.en ?? [])
    .map((alias) => alias.value)
    .filter((value): value is string => Boolean(value));

/** The entity's English label, when present. */
const englishLabel = (entity: WikidataEntity | undefined): string | undefined =>
  entity?.labels?.en?.value;

/** Extracts the P18/P856/P373/etc. claim-derived fields from an entity's claims. */
const extractClaimData = (
  claims: NonNullable<WikidataEntity['claims']>
): Omit<WikidataData, 'wikipediaUrl' | 'aliases' | 'entityLabel'> => ({
  imageFileNames: stringValues(claims.P18),
  officialUrl: stringValues(claims.P856)[0],
  commonsCategory: stringValues(claims.P373)[0],
  dateOfBirth: timeValues(claims.P569)[0],
  birthName: monolingualValues(claims.P1477)[0],
  occupationIds: entityIdValues(claims.P106),
});

/**
 * Extracts the media/link data from a parsed EntityData body. The endpoint
 * returns a single entity keyed by its id, so we read it without a dynamic key
 * lookup.
 */
const extractWikidataData = (body: WikidataEntities): WikidataData => {
  const entity = Object.values(body.entities ?? {})[0];
  return {
    ...extractClaimData(entity?.claims ?? {}),
    wikipediaUrl: entity?.sitelinks?.enwiki?.url,
    aliases: englishAliases(entity),
    entityLabel: englishLabel(entity),
  };
};

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
  return extractWikidataData(body);
};
