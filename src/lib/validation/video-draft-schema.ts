/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { VIDEO_ALLOWED_MIME_TYPES } from '@/lib/constants/video-uploads';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { videoArtistDetailSchema } from './video-artist-detail-schema';

/**
 * Lenient payload for the draft row created at upload-complete: only the
 * upload triple + pre-generated id are required; every display field is an
 * optional snapshot of the in-progress form (the action fills fallbacks).
 */
export const videoDraftSchema = z.object({
  preGeneratedId: z.string().regex(OBJECT_ID_REGEX),
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(500),
  mimeType: z.enum(VIDEO_ALLOWED_MIME_TYPES),
  title: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  category: z.enum(['MUSIC', 'INFORMATIONAL']).default('MUSIC'),
  releasedOn: z.string().max(10).optional(),
  description: z.string().max(2000).optional(),
  durationSeconds: z.union([z.string(), z.number()]).optional(),
  fileSize: z.union([z.string(), z.number()]).optional(),
  artistDetails: z.array(videoArtistDetailSchema).max(20).optional(),
});

export type VideoDraftInput = z.infer<typeof videoDraftSchema>;
