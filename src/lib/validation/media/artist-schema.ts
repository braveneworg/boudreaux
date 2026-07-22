/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistDetail } from '@/lib/types/domain/artist';
import type { Artist, ArtistWithPublishedReleases } from '@/lib/types/media-models';

import { releaseSchema } from './release-schema';
import {
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
});

/** `ArtistLabel` join-row scalars (the shape produced by `labels: true`). */
const artistLabelSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  labelId: z.string(),
});

/** `ArtistMember` join row with its included member artist (`members: { include: { member } }`). */
const artistMemberSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  memberId: z.string(),
  member: artistScalarSchema,
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

/** Artist with full published release data, for the public artist detail page. */
export const artistWithPublishedReleasesSchema = artistScalarSchema.extend({
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
      release: releaseSchema,
    })
  ),
}) satisfies z.ZodType<ArtistWithPublishedReleases>;
