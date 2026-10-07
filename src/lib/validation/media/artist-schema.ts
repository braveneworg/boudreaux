/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistDetail, ArtistListItem } from '@/lib/types/domain/artist';
import type { Artist, ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { RELEASE_CREDITS } from '@/lib/utils/artist-release-credits';
import { artistListingNewestReleaseSchema } from '@/lib/validation/artist-listing-schema';

import { publicArtistReleaseSchema } from './release-schema';
import {
  artistCreditScalarSchema,
  artistPublicScalarSchema,
  artistScalarSchema,
  date,
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
  // Absent from payloads serialized before the hashes existed — read as null.
  contentHash: nullableString.default(null),
  perceptualHash: nullableString.default(null),
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
  member: artistCreditScalarSchema,
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
 * Artist with full published release data, for the public artist detail page.
 * Each release row carries the credit the service derived for it (own release,
 * featured appearance, or band release) so the page can order and label rows.
 *
 * Public by construction: the page artist is parsed through
 * {@link artistPublicScalarSchema}, and every nested artist — its band members
 * and each credited artist on a release — through
 * {@link artistCreditScalarSchema}, which also drops the bio (a bio is shown
 * only on its artist's own page). Zod strips unknown keys, so the server also
 * runs a payload through this as the response guard (#765): a private or
 * nested bio field a future query re-selects is dropped before it is
 * serialised.
 */
export const artistWithPublishedReleasesSchema = artistPublicScalarSchema.extend({
  labels: z.array(artistLabelSchema),
  urls: z.array(urlSchema),
  bioImages: z.array(artistBioImageSchema),
  bioLinks: z.array(artistBioLinkSchema),
  members: z.array(artistMemberSchema),
  newestRelease: artistListingNewestReleaseSchema,
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      position: z.number().int(),
      release: publicArtistReleaseSchema,
      credit: z.enum(RELEASE_CREDITS),
      albumArtist: artistCreditScalarSchema.nullable(),
    })
  ),
}) satisfies z.ZodType<ArtistWithPublishedReleases>;
