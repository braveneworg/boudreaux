/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

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
  digitalFormatId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid digital format ID format' })
    .min(1, { message: 'Digital format is required' }),
  releaseId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid release ID format' })
    .min(1, { message: 'Release is required' }),
});

export type FeaturedArtistFormData = z.infer<typeof createFeaturedArtistSchema>;
