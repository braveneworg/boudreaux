/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { FeaturedArtist } from '@/lib/types/media-models';

import { digitalFormatWithFilesSchema } from './digital-format-schema';
import { date, nullableDate, nullableString } from './shared-schema';

/** `FeaturedArtist` with its nested artists, digital format, and release. */
export const featuredArtistSchema = z.object({
  id: z.string(),
  displayName: nullableString,
  featuredOn: date,
  featuredUntil: nullableDate,
  digitalFormatId: nullableString,
  createdAt: date,
  updatedAt: date,
  publishedOn: nullableDate,
  position: z.number(),
  description: nullableString,
  coverArt: nullableString,
  featuredTrackNumber: z.number().nullable(),
  releaseId: nullableString,
  // Projected to only the fields the carousel/player + display-name/cover-art
  // utils read (see `featuredArtistInclude`), so the schema mirrors the slim
  // payload rather than full Artist/Release documents.
  artists: z.array(
    z.object({
      id: z.string(),
      displayName: nullableString,
      firstName: z.string(),
      surname: z.string(),
      slug: z.string(),
      bioImages: z.array(z.object({ url: z.string() })),
    })
  ),
  digitalFormat: digitalFormatWithFilesSchema.nullable(),
  release: z
    .object({
      id: z.string(),
      title: z.string(),
      coverArt: z.string(),
      images: z.array(z.object({ src: nullableString })),
    })
    .nullable(),
}) satisfies z.ZodType<FeaturedArtist>;
