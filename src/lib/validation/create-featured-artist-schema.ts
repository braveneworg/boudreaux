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
  // MongoDB ObjectId is a 24-character hex string
  artistIds: z
    .array(z.string().regex(/^[a-f0-9]{24}$/i, { message: 'Invalid artist ID format' }))
    .min(1, { message: 'At least one artist is required' }),
  trackId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid track ID format' })
    .min(1, { message: 'Track is required' }),
  releaseId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid release ID format' })
    .min(1, { message: 'Release is required' }),
  groupId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid group ID format' })
    .optional()
    .or(z.literal('')),
});

export type FeaturedArtistFormData = z.infer<typeof createFeaturedArtistSchema>;
