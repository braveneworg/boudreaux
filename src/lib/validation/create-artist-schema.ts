/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

// TODO: extract out commonality with update-artist-schema.ts to an object that you can spread into both schemas
export const createArtistSchema = z.object({
  firstName: z
    .string()
    .min(1, { message: 'First name is required' })
    .max(100, { message: 'First name must be less than 100 characters' }),
  middleName: z
    .string()
    .max(100, { message: 'Middle name must be less than 100 characters' })
    .optional()
    .or(z.literal('')),
  surname: z
    .string()
    .min(1, { message: 'Surname is required' })
    .max(100, { message: 'Surname must be less than 100 characters' }),
  akaNames: z
    .string()
    .max(500, { message: 'AKA names must be less than 500 characters' })
    .optional()
    .or(z.literal('')),
  displayName: z
    .string()
    .max(200, { message: 'Display name must be less than 200 characters' })
    .optional()
    .or(z.literal('')),
  title: z
    .string()
    .max(50, { message: 'Title must be less than 50 characters' })
    .optional()
    .or(z.literal('')),
  suffix: z
    .string()
    .max(50, { message: 'Suffix must be less than 50 characters' })
    .optional()
    .or(z.literal('')),
  slug: z
    .string()
    .min(1, { message: 'Slug is required' })
    .max(200, { message: 'Slug must be less than 200 characters' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: 'Slug must be lowercase, alphanumeric, and dash-separated (e.g., "john-doe")',
    }),
  bio: z
    .string()
    .max(5000, { message: 'Bio must be less than 5000 characters' })
    .optional()
    .or(z.literal('')),
  shortBio: z
    .string()
    .max(500, { message: 'Short bio must be less than 500 characters' })
    .optional()
    .or(z.literal('')),
  altBio: z
    .string()
    .max(5000, { message: 'Alternative bio must be less than 5000 characters' })
    .optional()
    .or(z.literal('')),
  genres: z
    .string()
    .max(500, { message: 'Genres must be less than 500 characters' })
    .optional()
    .or(z.literal('')),
  tags: z
    .string()
    .max(500, { message: 'Tags must be less than 500 characters' })
    .optional()
    .or(z.literal('')),
  bornOn: z.string().optional().or(z.literal('')),
  diedOn: z.string().optional().or(z.literal('')),
  publishedOn: z.string().optional().or(z.literal('')),
  // MongoDB ObjectId is a 24-character hex string, not a standard UUID
  createdBy: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid MongoDB ObjectId format' })
    .optional(),
});

type schemaType = typeof createArtistSchema & Partial<FormData>;
export type ArtistFormData = z.infer<schemaType>;
