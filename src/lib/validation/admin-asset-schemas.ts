/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

/**
 * Zod schemas for the admin asset Server Actions (cover art, image variants,
 * format-file deletion). Error messages mirror the actions' historical manual
 * checks so callers and specs observe identical failures.
 */

const httpUrlSchema = z
  .string({ error: 'Cover art URL is required' })
  .trim()
  .min(1, 'Cover art URL is required')
  // HTTP(S) only — data: URIs crush SSR HTML payload; everything else is
  // not a CDN URL and has no business in the cover art column.
  .regex(/^https?:\/\//, 'Cover art must be an HTTP(S) URL');

export const updateReleaseCoverArtSchema = z.object({
  releaseId: z.string({ error: 'Invalid release ID' }).regex(OBJECT_ID_REGEX, 'Invalid release ID'),
  coverArt: httpUrlSchema,
});

export const updateFeaturedArtistCoverArtSchema = z.object({
  featuredArtistId: z
    .string({ error: 'Invalid featured artist ID' })
    .regex(OBJECT_ID_REGEX, 'Invalid featured artist ID'),
  coverArt: httpUrlSchema,
});

export const generateImageVariantsSchema = z.object({
  cdnUrl: z
    .string({ error: 'Invalid image key' })
    .trim()
    .min(1, 'Invalid image key')
    .max(2048, 'Invalid image key'),
});

export const deleteFormatFilesSchema = z.object({
  releaseId: z.string({ error: 'Invalid release ID' }).regex(OBJECT_ID_REGEX, 'Invalid release ID'),
  formatType: z
    .string({ error: 'Invalid format type' })
    .refine(
      (value): value is DigitalFormatType =>
        (VALID_FORMAT_TYPES as readonly string[]).includes(value),
      'Invalid format type'
    ),
});
