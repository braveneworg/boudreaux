import { z } from 'zod';

// MongoDB ObjectId regex pattern
const mongoObjectIdPattern = /^[a-f0-9]{24}$/i;

export const createTrackSchema = z.object({
  title: z
    .string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title must be less than 200 characters' }),
  duration: z
    .number()
    .int({ message: 'Duration must be a whole number' })
    .min(1, { message: 'Duration must be at least 1 second' })
    .max(86400, { message: 'Duration must be less than 24 hours' }),
  audioUrl: z
    .string()
    .min(1, { message: 'Audio URL is required' })
    .url({ message: 'Audio URL must be a valid URL' }),
  coverArt: z
    .string()
    .url({ message: 'Cover art must be a valid URL' })
    .optional()
    .or(z.literal('')),
  position: z
    .number()
    .int({ message: 'Position must be a whole number' })
    .min(0, { message: 'Position must be 0 or greater' }),
  artistIds: z
    .array(z.string().regex(mongoObjectIdPattern, { message: 'Invalid artist ID format' }))
    .optional(),
  releaseIds: z
    .array(z.string().regex(mongoObjectIdPattern, { message: 'Invalid release ID format' }))
    .optional(),
  publishedOn: z.string().optional().or(z.literal('')),
  // MongoDB ObjectId is a 24-character hex string
  createdBy: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid MongoDB ObjectId format' })
    .optional(),
});

type schemaType = typeof createTrackSchema & Partial<FormData>;
export type TrackFormData = z.infer<schemaType>;
