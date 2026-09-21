/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { LRUCache } from 'lru-cache';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import {
  ARTIST_VOCABULARY_FIELDS,
  type ArtistVocabularyEntry,
  type ArtistVocabularyField,
} from '@/lib/types/domain/artist';
import { splitList } from '@/lib/utils/split-list';
import { normalizeVocabularyTerm } from '@/lib/utils/vocabulary-term';

/** Most suggestions one search returns. */
export const VOCABULARY_TAKE = 20;

/** How long a derived vocabulary stays warm. Mirrors the client hook's staleTime. */
const VOCABULARY_TTL_MS = 60 * 1000;

/**
 * The DERIVED, ranked vocabulary per field — never the filtered result, so a
 * keystroke is an in-memory filter rather than a scan of every artist row.
 *
 * The cache is per-process. `invalidate()` therefore only clears the instance
 * that served the write; the TTL is what backstops every other instance. That
 * is deliberate and sufficient for an admin-only suggestion list — do not
 * "fix" it with a distributed store it does not need.
 */
const vocabularyCache = new LRUCache<ArtistVocabularyField, ArtistVocabularyEntry[]>({
  max: ARTIST_VOCABULARY_FIELDS.length,
  ttl: VOCABULARY_TTL_MS,
});

/**
 * Turn every artist's raw column value into a usage-ranked vocabulary.
 *
 * Terms are deduped WITHIN a row before counting, so an artist carrying
 * `"Punk, punk"` contributes one to `punk` rather than two. Ranking is count
 * descending, ties broken alphabetically so the order is deterministic.
 */
const deriveVocabulary = async (field: ArtistVocabularyField): Promise<ArtistVocabularyEntry[]> => {
  const rows = await ArtistRepository.listVocabularySource(field);
  const counts = new Map<string, number>();

  for (const row of rows) {
    const terms = new Set(splitList(row).map(normalizeVocabularyTerm).filter(Boolean));

    for (const term of terms) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

/** Read the field's vocabulary from cache, deriving it on a miss. */
const getVocabulary = async (field: ArtistVocabularyField): Promise<ArtistVocabularyEntry[]> => {
  const cached = vocabularyCache.get(field);

  if (cached !== undefined) {
    return cached;
  }

  const derived = await deriveVocabulary(field);
  vocabularyCache.set(field, derived);

  return derived;
};

/**
 * Usage-ranked genre and tag suggestions, derived in memory from the
 * comma-joined artist columns. There is no `Genre` collection to query
 * (ADR-0009), and the roster is admin-scale.
 */
export class ArtistVocabularyService {
  /**
   * Suggestions for one field, ranked by how many artists already use each
   * term and filtered to those containing the query.
   *
   * The query is normalised with the SAME function as the stored terms, so
   * typing `"Hip Hop"` finds `hip-hop`. There is deliberately NO minimum
   * query length — the inverse of `ProducerService.search`, which returns
   * nothing below `MIN_SEARCH_LENGTH`. An empty query here returns the top
   * terms, because the whole point of the dropdown is to show an admin what
   * the roster already uses before they type. Do not "restore consistency"
   * with the producer search.
   *
   * @param field - Which vocabulary column to read.
   * @param query - Raw text as typed; `''` yields the top {@link VOCABULARY_TAKE}.
   * @returns Up to {@link VOCABULARY_TAKE} entries, best match first.
   */
  static async search(
    field: ArtistVocabularyField,
    query: string
  ): Promise<ArtistVocabularyEntry[]> {
    const vocabulary = await getVocabulary(field);
    const needle = normalizeVocabularyTerm(query);
    const matched =
      needle === '' ? vocabulary : vocabulary.filter((entry) => entry.value.includes(needle));

    return matched.slice(0, VOCABULARY_TAKE);
  }

  /**
   * Drop the cached vocabulary so the next search re-derives it. Called after
   * an artist write, which is the only thing that can change the counts.
   *
   * @param field - The field to clear; omit to clear every field.
   */
  static invalidate(field?: ArtistVocabularyField): void {
    if (field === undefined) {
      vocabularyCache.clear();
      return;
    }

    vocabularyCache.delete(field);
  }
}
