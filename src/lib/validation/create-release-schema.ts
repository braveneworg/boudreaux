/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { FORMATS } from '@/lib/types/media-models';

const formatValues = Object.values(FORMATS);

// MongoDB ObjectId regex pattern
const mongoObjectIdPattern = /^[a-f0-9]{24}$/i;

export const createReleaseSchema = z
  .object({
    title: z
      .string()
      .min(1, { message: 'Title is required' })
      .max(200, { message: 'Title must be less than 200 characters' }),
    releasedOn: z.string().min(1, { message: 'Release date is required' }),
    coverArt: z
      .string()
      .min(1, { message: 'Cover art URL is required' })
      .url({ message: 'Cover art must be a valid URL' }),
    formats: z
      .array(z.enum(formatValues as [string, ...string[]]))
      .min(1, { message: 'At least one format is required' }),
    artistIds: z
      .array(z.string().regex(mongoObjectIdPattern, { message: 'Invalid artist ID format' }))
      .optional(),
    groupIds: z
      .array(z.string().regex(mongoObjectIdPattern, { message: 'Invalid group ID format' }))
      .optional(),
    labels: z
      .string()
      .max(500, { message: 'Labels must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    catalogNumber: z
      .string()
      .max(100, { message: 'Catalog number must be less than 100 characters' })
      .optional()
      .or(z.literal('')),
    description: z
      .string()
      .max(5000, { message: 'Description must be less than 5000 characters' })
      .optional()
      .or(z.literal('')),
    notes: z
      .string()
      .max(2000, { message: 'Notes must be less than 2000 characters' })
      .optional()
      .or(z.literal('')),
    executiveProducedBy: z
      .string()
      .max(500, { message: 'Executive produced by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    coProducedBy: z
      .string()
      .max(500, { message: 'Co-produced by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    masteredBy: z
      .string()
      .max(500, { message: 'Mastered by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    mixedBy: z
      .string()
      .max(500, { message: 'Mixed by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    recordedBy: z
      .string()
      .max(500, { message: 'Recorded by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    artBy: z
      .string()
      .max(500, { message: 'Art by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    designBy: z
      .string()
      .max(500, { message: 'Design by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    photographyBy: z
      .string()
      .max(500, { message: 'Photography by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    linerNotesBy: z
      .string()
      .max(500, { message: 'Liner notes by must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    publishedAt: z.string().optional().or(z.literal('')),
    featuredOn: z.string().optional().or(z.literal('')),
    featuredUntil: z.string().optional().or(z.literal('')),
    featuredDescription: z
      .string()
      .max(500, { message: 'Featured description must be less than 500 characters' })
      .optional()
      .or(z.literal('')),
    // MongoDB ObjectId is a 24-character hex string
    createdBy: z
      .string()
      .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid MongoDB ObjectId format' })
      .optional(),
  })
  .refine(
    (data) => {
      const hasArtists = data.artistIds && data.artistIds.length > 0;
      const hasGroups = data.groupIds && data.groupIds.length > 0;
      return hasArtists || hasGroups;
    },
    {
      message: 'At least one Artist or one Group is required',
      path: ['artistIds'],
    }
  );

type schemaType = typeof createReleaseSchema & Partial<FormData>;
export type ReleaseFormData = z.infer<schemaType>;
