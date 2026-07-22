/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
} from '@/lib/types/media-models';

import { digitalFormatWithFilesSchema } from './digital-format-schema';
import {
  artistScalarSchema,
  date,
  imageSchema,
  nullableString,
  platformSchema,
  releaseScalarSchema,
  urlSchema,
} from './shared-schema';

/** `Release` with the relations selected by the `Release` domain type. */
export const releaseSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      artist: artistScalarSchema,
    })
  ),
  digitalFormats: z.array(digitalFormatWithFilesSchema),
  releaseUrls: z.array(
    z.object({
      id: z.string(),
      releaseId: z.string(),
      urlId: z.string(),
      url: urlSchema,
    })
  ),
}) satisfies z.ZodType<Release>;

/**
 * Lightweight `Release` for the admin listing — scalars, images, and the
 * artist join rows used to derive the album-artist display name. Excludes the
 * `digitalFormats`/`releaseUrls` relations the grid never renders.
 */
export const releaseListItemSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      artist: artistScalarSchema,
    })
  ),
}) satisfies z.ZodType<ReleaseListItem>;

/** Lightweight `Release` with only images, for the related-releases carousel. */
export const releaseCarouselItemSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
}) satisfies z.ZodType<ReleaseCarouselItem>;

/** Published release listing projection for the public releases grid. */
export const publishedReleaseListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverArt: z.string(),
  releasedOn: date,
  images: z.array(z.object({ src: nullableString, altText: nullableString })),
  artistReleases: z.array(
    z.object({
      artist: z.object({
        id: z.string(),
        firstName: z.string(),
        surname: z.string(),
        displayName: nullableString,
        slug: z.string(),
      }),
    })
  ),
  releaseUrls: z.array(z.object({ url: z.object({ platform: platformSchema, url: z.string() }) })),
}) satisfies z.ZodType<PublishedReleaseListing>;

/** Published release detail (media player page) — the `withTracks` release payload. */
export const publishedReleaseDetailSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      artist: z.object({
        id: z.string(),
        firstName: z.string(),
        middleName: nullableString,
        surname: z.string(),
        displayName: nullableString,
        title: nullableString,
        suffix: nullableString,
      }),
    })
  ),
  digitalFormats: z.array(digitalFormatWithFilesSchema),
  releaseUrls: z.array(
    z.object({
      id: z.string(),
      releaseId: z.string(),
      urlId: z.string(),
      url: urlSchema,
    })
  ),
}) satisfies z.ZodType<PublishedReleaseDetail>;
