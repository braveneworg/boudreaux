/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { isHttpUrl } from '@/lib/utils/is-http-url';

/** A Mongo ObjectId (24 hex chars). */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

// z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
// scheme (same approach as the bio-generation link schemas) so a custom link
// can never become a script-bearing href.
const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');

/**
 * The kinds an admin can tag a custom bio link with. Mirrors the generator's
 * link kinds (`bioGenerationLinkSchema`) — the `release` kind is generator-only.
 */
export const BIO_LINK_KINDS = [
  'wikipedia',
  'official',
  'musicbrainz',
  'social',
  'streaming',
  'press',
  'other',
] as const;

/** One admin-selectable bio link kind. */
export type BioLinkKind = (typeof BIO_LINK_KINDS)[number];

/** Admin input for creating one custom bio link (manual authored addition). */
export const createBioLinkInputSchema = z.object({
  artistId: objectId,
  label: z.string().trim().min(1).max(200),
  url: httpUrl,
  kind: z.enum(BIO_LINK_KINDS).optional(),
});

export type CreateBioLinkInput = z.infer<typeof createBioLinkInputSchema>;
