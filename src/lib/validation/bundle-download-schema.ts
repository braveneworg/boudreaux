/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';

/**
 * Zod schema for validating the `formats` query parameter
 * on the bundle download API route.
 *
 * Expects a comma-separated string of valid digital format types
 * (e.g., "FLAC,WAV,MP3_320KBPS").
 */
export const bundleDownloadQuerySchema = z.object({
  formats: z
    .string()
    .min(1, 'At least one format is required')
    .transform((val) => val.split(','))
    .pipe(
      z
        .array(z.enum(VALID_FORMAT_TYPES as unknown as [string, ...string[]]))
        .min(1, 'Select at least one format')
        .max(8, 'Maximum 8 formats per bundle')
    ),
});

export type BundleDownloadQuery = z.infer<typeof bundleDownloadQuerySchema>;
