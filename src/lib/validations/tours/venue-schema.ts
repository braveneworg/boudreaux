/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Validation schema for creating a new venue
 */
export const venueCreateSchema = z.object({
  name: z
    .string({ message: 'Name is required' })
    .min(1, 'Name is required')
    .max(200, 'Name must be 200 characters or less'),
  address: z.string().max(500, 'Address must be 500 characters or less').optional().nullable(),
  city: z
    .string({ message: 'City is required' })
    .min(1, 'City is required')
    .max(100, 'City must be 100 characters or less'),
  state: z.string().max(100, 'State must be 100 characters or less').optional().nullable(),
  country: z.string().max(100, 'Country must be 100 characters or less').optional().nullable(),
  postalCode: z.preprocess(
    (val) => (typeof val === 'number' ? String(val) : val),
    z.string().max(20, 'Postal code must be 20 characters or less').optional().nullable()
  ),
  capacity: z
    .number({ message: 'Capacity must be a number' })
    .int('Capacity must be an integer')
    .positive('Capacity must be a positive number')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  createdBy: z.string().optional().nullable(),
  timeZone: z.string().min(1).max(100).optional().nullable(),
});

/**
 * Infer TypeScript type from create schema
 */
export type VenueCreateInput = z.infer<typeof venueCreateSchema>;

/**
 * Validation schema for updating an existing venue
 * All fields are optional to support partial updates
 */
export const venueUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(200, 'Name must be 200 characters or less')
    .optional(),
  address: z.string().max(500, 'Address must be 500 characters or less').optional().nullable(),
  city: z
    .string()
    .min(1, 'City cannot be empty')
    .max(100, 'City must be 100 characters or less')
    .optional(),
  state: z.string().max(100, 'State must be 100 characters or less').optional().nullable(),
  country: z.string().max(100, 'Country must be 100 characters or less').optional().nullable(),
  postalCode: z.preprocess(
    (val) => (typeof val === 'number' ? String(val) : val),
    z.string().max(20, 'Postal code must be 20 characters or less').optional().nullable()
  ),
  capacity: z
    .number({ message: 'Capacity must be a number' })
    .int('Capacity must be an integer')
    .positive('Capacity must be a positive number')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  timeZone: z.string().min(1).max(100).optional().nullable(),
});

/**
 * Infer TypeScript type from update schema
 */
export type VenueUpdateInput = z.infer<typeof venueUpdateSchema>;

/**
 * Validation schema for venue query parameters
 */
export const venueQuerySchema = z.object({
  search: z.string().optional(),
  city: z.string().optional(),
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(100),
});

/**
 * Infer TypeScript type from query schema
 */
export type VenueQueryInput = z.infer<typeof venueQuerySchema>;
