/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { MAX_TRACKS_PER_FORMAT } from '@/lib/constants/digital-formats';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { digitalFormatTypeSchema } from './digital-format-type-schema';

/**
 * Zod schemas for the format upload Server Actions. They check the shape of
 * the arguments; the format upload module then applies the per-format rules
 * (`digitalFormatConfirmationSchema`, `multiTrackConfirmationSchema`).
 */

const releaseIdSchema = z
  .string({ error: 'Invalid release ID' })
  .regex(OBJECT_ID_REGEX, 'Invalid release ID');

const albumTitleSchema = z
  .string()
  .trim()
  .min(1, 'Album name is required to find or create a release');

export const newReleaseTitleCheckSchema = z.object({
  releaseId: releaseIdSchema,
  title: albumTitleSchema,
});

export const formatUploadConfirmationSchema = z.object({
  releaseId: releaseIdSchema,
  formatType: digitalFormatTypeSchema,
  files: z
    .array(
      z.object({
        s3Key: z.string(),
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        title: z.string().optional(),
        duration: z.number().optional(),
      })
    )
    .min(1, 'At least one file is required')
    .max(MAX_TRACKS_PER_FORMAT, `Maximum ${MAX_TRACKS_PER_FORMAT} tracks per format`),
  newRelease: z
    .object({
      album: albumTitleSchema,
      artist: z.string().optional(),
      albumArtist: z.string().optional(),
      year: z.number().optional(),
      label: z.string().optional(),
      coverArt: z.string().optional(),
    })
    .optional(),
});

export const formatUploadDiscardSchema = z.object({
  releaseId: releaseIdSchema,
  formatType: digitalFormatTypeSchema,
  s3Keys: z
    .array(z.string())
    .max(MAX_TRACKS_PER_FORMAT, `Maximum ${MAX_TRACKS_PER_FORMAT} tracks per format`),
});
