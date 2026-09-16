/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistListingName, ArtistListingRow } from '@/lib/types/domain/artist';
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

/** Primary bio image as rendered by the listing card and search dropdown. */
const artistListingBioImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: nullableString,
  title: nullableString,
  attribution: nullableString,
  license: nullableString,
  licenseUrl: nullableString,
  sourceUrl: nullableString,
});

/** The newest listed release credited to the artist, or `null`. */
const artistListingNewestReleaseSchema = z
  .object({ id: z.string(), title: z.string(), releasedOn: date })
  .nullable();

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
  newestRelease: artistListingNewestReleaseSchema,
}) satisfies z.ZodType<ArtistListingRow>;

/** Strict schema for one `/api/artists?listing=published` page (`{ rows, nextSkip }`). */
export const artistListingPageSchema = paginatedResponseSchema(artistListingRowSchema);
