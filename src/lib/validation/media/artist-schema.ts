/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistDetail } from '@/lib/types/domain/artist';
import type { Artist, ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { RELEASE_CREDITS } from '@/lib/utils/artist-release-credits';

import { publicArtistReleaseSchema } from './release-schema';
import {
  artistPublicScalarSchema,
  artistScalarSchema,
  date,
  imageSchema,
  nullableString,
  releaseScalarSchema,
  urlSchema,
} from './shared-schema';

/** `ArtistBioImage` scalars (the shape produced by `bioImages: true`). */
const artistBioImageSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  url: z.string(),
  thumbnailUrl: nullableString,
  title: nullableString,
  attribution: nullableString,
  license: nullableString,
  licenseUrl: nullableString,
  sourceUrl: nullableString,
  originalUrl: nullableString,
  width: z.number().nullable(),
  height: z.number().nullable(),
  isPrimary: z.boolean(),
  kind: nullableString,
  alt: nullableString,
  hasFace: z.boolean().nullable(),
  faceScore: z.number().nullable(),
  origin: nullableString,
  sortOrder: z.number(),
  displayOrder: z.number().int().nullable(),
  createdAt: date,
});

/** `ArtistBioLink` scalars (the shape produced by `bioLinks: true`). */
const artistBioLinkSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  label: z.string(),
  url: z.string(),
  kind: nullableString,
  origin: nullableString,
  sortOrder: z.number(),
  reference: z.boolean().nullable(),
  imageSource: z.boolean().nullable(),
});

/** `ArtistLabel` join-row scalars (the shape produced by `labels: true`). */
const artistLabelSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  labelId: z.string(),
});

/**
 * `ArtistMember` join row with its member artist, public scalars only
 * (`members: { include: { member: { select } } }`).
 */
const artistMemberSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  memberId: z.string(),
  member: artistPublicScalarSchema,
});

/** `Artist` with the relations selected by the `Artist` domain type. */
export const artistSchema = artistScalarSchema.extend({
  images: z.array(imageSchema),
  labels: z.array(artistLabelSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      release: releaseScalarSchema,
    })
  ),
  urls: z.array(urlSchema),
}) satisfies z.ZodType<Artist>;

/**
 * `Artist` as returned by `GET /api/artists/[id]` — scalars plus the ordered
 * `images` relation only (see `ArtistRepository.findById`). Narrower than
 * `artistSchema`, which also pulls labels/urls/releases the by-id route omits.
 */
export const artistDetailSchema = artistScalarSchema.extend({
  images: z.array(imageSchema),
}) satisfies z.ZodType<ArtistDetail>;

/**
 * Artist with full published release data, for the public artist detail page.
 * Each release row carries the credit the service derived for it (own release,
 * featured appearance, or band release) so the page can order and label rows.
 *
 * Public by construction: every artist on the graph — the artist, its band
 * members, and each credited artist on a release — is parsed through
 * {@link artistPublicScalarSchema}, and Zod strips unknown keys, so the server
 * also runs a payload through this as the response guard (#765): a private
 * field a future query re-selects is dropped before it is serialised.
 */
export const artistWithPublishedReleasesSchema = artistPublicScalarSchema.extend({
  images: z.array(imageSchema),
  labels: z.array(artistLabelSchema),
  urls: z.array(urlSchema),
  bioImages: z.array(artistBioImageSchema),
  bioLinks: z.array(artistBioLinkSchema),
  members: z.array(artistMemberSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      release: publicArtistReleaseSchema,
      credit: z.enum(RELEASE_CREDITS),
    })
  ),
}) satisfies z.ZodType<ArtistWithPublishedReleases>;
