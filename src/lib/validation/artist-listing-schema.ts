/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type {
  ArtistListingBioImage,
  ArtistListingName,
  ArtistListingRow,
  LatestRelease,
} from '@/lib/types/domain/artist';
import { date, nullableDate, nullableString } from '@/lib/validation/media/shared-schema';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';

/**
 * Strict Zod schemas mirroring the serialized JSON shape of one public
 * artists-index row returned by `/api/artists?listing=published`. The wire
 * carries ISO strings for every `DateTime`; `z.coerce.date()` rebuilds them so
 * a parsed row satisfies the domain {@link ArtistListingRow}. Unknown keys are
 * stripped, so the client shape can never grow a contact field by accident.
 */

/** Name projection of a band member / band on a listing row. */
const artistListingNameSchema = z.object({
  id: z.string(),
  displayName: nullableString,
  firstName: z.string(),
  middleName: nullableString,
  surname: z.string(),
  title: nullableString,
  suffix: nullableString,
}) satisfies z.ZodType<ArtistListingName>;

/**
 * Bio image as rendered by the listing card and search dropdown, carrying the
 * suggestion flag and the human-chosen display position. A plain object strips
 * unknown keys, so every rendered field must be listed here or it vanishes
 * client-side.
 */
const artistListingBioImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: nullableString,
  title: nullableString,
  attribution: nullableString,
  license: nullableString,
  licenseUrl: nullableString,
  sourceUrl: nullableString,
  alt: nullableString,
  isPrimary: z.boolean(),
  displayOrder: z.number().int().nullable(),
}) satisfies z.ZodType<ArtistListingBioImage>;

/**
 * An artist's latest release, as a listing row and the artist page model
 * carry it: with its first track's stream URL and, for a featured release
 * whose album artist is public, that artist's name and slug; or `null`.
 */
export const latestReleaseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    releasedOn: date,
    playSrc: z.string().nullable(),
    byName: z.string().nullable(),
    albumArtistSlug: z.string().nullable(),
  })
  .nullable() satisfies z.ZodType<LatestRelease | null>;

/** One validated `/api/artists?listing=published` row. */
export const artistListingRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  firstName: z.string(),
  middleName: nullableString,
  surname: z.string(),
  title: nullableString,
  suffix: nullableString,
  displayName: nullableString,
  akaNames: nullableString,
  genres: nullableString,
  instruments: nullableString,
  shortBio: nullableString,
  bornOn: nullableDate,
  diedOn: nullableDate,
  formedOn: nullableDate,
  bioImages: z.array(artistListingBioImageSchema),
  members: z.array(artistListingNameSchema),
  memberOf: z.array(artistListingNameSchema),
  releaseCount: z.number().int().min(0),
  newestRelease: latestReleaseSchema,
}) satisfies z.ZodType<ArtistListingRow>;

/** Strict schema for one `/api/artists?listing=published` page (`{ rows, nextSkip }`). */
export const artistListingPageSchema = paginatedResponseSchema(artistListingRowSchema);
