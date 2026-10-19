/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import {
  ARTIST_PAGE_SCALAR_MASK,
  type ArtistDetail,
  type ArtistDisplayImage,
  type ArtistListItem,
  type ArtistPageModel,
} from '@/lib/types/domain/artist';
import type { Artist } from '@/lib/types/media-models';
import { latestReleaseSchema } from '@/lib/validation/artist-listing-schema';

import {
  artistPublicScalarSchema,
  artistScalarSchema,
  nullableString,
  releaseScalarSchema,
  urlSchema,
} from './shared-schema';

/**
 * A display image as the artist page renders and credits it. A plain object
 * strips unknown keys, so no pool internal (original URL, face signal,
 * hashes, display position) survives a parse.
 */
const artistDisplayImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: nullableString,
  alt: nullableString,
  title: nullableString,
  attribution: nullableString,
  license: nullableString,
  sourceUrl: nullableString,
  width: z.number().nullable(),
  height: z.number().nullable(),
}) satisfies z.ZodType<ArtistDisplayImage>;

/** `ArtistLabel` join-row scalars (the shape produced by `labels: true`). */
const artistLabelSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  labelId: z.string(),
});

/** `Artist` with the relations selected by the `Artist` domain type. */
export const artistSchema = artistScalarSchema.extend({
  labels: z.array(artistLabelSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      position: z.number().int(),
      release: releaseScalarSchema,
    })
  ),
  urls: z.array(urlSchema),
}) satisfies z.ZodType<Artist>;

/**
 * An admin listing row as returned by `GET /api/artists`: the admin `Artist`
 * plus whether a display image is chosen (ADR-0019).
 */
export const artistListItemSchema = artistSchema.extend({
  hasDisplayImage: z.boolean(),
}) satisfies z.ZodType<ArtistListItem>;

/**
 * `Artist` as returned by `GET /api/artists/[id]` — scalars only (see
 * `ArtistRepository.findById`). Narrower than `artistSchema`, which also pulls
 * labels/urls/releases the by-id route omits.
 */
export const artistDetailSchema = artistScalarSchema satisfies z.ZodType<ArtistDetail>;

/**
 * The artist page model, as the public artist page and the artist-filtered
 * listings read it: the page scalars, the display images, the latest release
 * and whether any listed release exists. Public by construction — the page
 * scalars are picked from {@link artistPublicScalarSchema} — and Zod strips
 * unknown keys, so the server runs the model through this as the response
 * guard (#765): a private field or pool internal a future change lets through
 * is dropped before the page renders it.
 */
export const artistPageModelSchema = artistPublicScalarSchema.pick(ARTIST_PAGE_SCALAR_MASK).extend({
  displayImages: z.array(artistDisplayImageSchema),
  latestRelease: latestReleaseSchema,
  hasListedRelease: z.boolean(),
}) satisfies z.ZodType<ArtistPageModel>;
