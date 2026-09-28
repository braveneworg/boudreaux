/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

/** Far above any real release's credits; bounds the `in` list a request can send. */
const MAX_DECIDED_ARTISTS = 200;

const artistIds = z
  .array(z.string().regex(OBJECT_ID_REGEX, 'Must be a valid artist id'))
  .max(MAX_DECIDED_ARTISTS)
  .default([]);

/**
 * An admin's decisions for the credits awaiting confirmation (ADR-0015): the
 * artists to publish with the release and the artists to keep hidden. Who
 * decided is taken from the session, never from the request.
 */
export const creditDecisionsSchema = z.object({
  publishArtistIds: artistIds,
  keepHiddenArtistIds: artistIds,
});

export type CreditDecisionsInput = z.input<typeof creditDecisionsSchema>;
