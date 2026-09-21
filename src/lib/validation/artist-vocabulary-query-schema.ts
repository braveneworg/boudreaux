/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { ARTIST_VOCABULARY_FIELDS } from '@/lib/types/domain/artist';

/** Longest query forwarded to the service; longer input is truncated, not rejected. */
export const ARTIST_VOCABULARY_MAX_QUERY_LENGTH = 100;

/**
 * `/api/artists/vocabulary` query params.
 *
 * `field` is STRICT — no `.catch()`, no default. Unlike the public listing
 * query, which degrades every param so a hand-edited URL still renders, this
 * is an admin endpoint and a bad `field` is a bug in our own caller: it should
 * surface as a 400, not silently return genres and look like it worked.
 *
 * `q` truncates rather than rejects, per
 * `docs/lessons/validation/model-output-caps-truncate-never-reject.md` — a cap
 * is a bound on our tolerance, and a too-long typeahead query should still
 * search on its first 100 characters.
 */
export const artistVocabularyQuerySchema = z.object({
  field: z.enum(ARTIST_VOCABULARY_FIELDS),
  q: z
    .string()
    .transform((value) => value.trim().slice(0, ARTIST_VOCABULARY_MAX_QUERY_LENGTH))
    .default(''),
});

/** The parsed vocabulary query — exactly what the service accepts. */
export type ArtistVocabularyQuery = z.infer<typeof artistVocabularyQuerySchema>;
