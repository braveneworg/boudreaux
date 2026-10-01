/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { objectId } from './primitives';

export const createFeaturedArtistSchema = z.object({
  displayName: z
    .string()
    .max(200, { message: 'Display name must be less than 200 characters' })
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(2000, { message: 'Description must be less than 2000 characters' })
    .optional()
    .or(z.literal('')),
  coverArt: z
    .string()
    .url({ message: 'Cover art must be a valid URL' })
    .optional()
    .or(z.literal('')),
  position: z
    .number()
    .int({ message: 'Position must be a whole number' })
    .min(0, { message: 'Position must be 0 or greater' }),
  featuredOn: z.string().optional().or(z.literal('')),
  featuredUntil: z.string().optional().or(z.literal('')),
  digitalFormatId: objectId,
  releaseId: objectId,
  featuredTrackNumber: z
    .number()
    .int({ message: 'Featured track number must be a whole number' })
    .min(1, { message: 'Featured track number must be at least 1' })
    .optional(),
  publishedOn: z.string().optional().or(z.literal('')),
});

export type FeaturedArtistFormData = z.infer<typeof createFeaturedArtistSchema>;
