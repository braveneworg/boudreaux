/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Validation schema for creating a new tour
 */
export const tourCreateSchema = z.object({
  title: z
    .string({ message: 'Title is required' })
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  subtitle: z.string().max(150, 'Subtitle must be 150 characters or less').optional().nullable(),
  subtitle2: z.string().max(150, 'Subtitle 2 must be 150 characters or less').optional().nullable(),
  description: z
    .string()
    .max(5000, 'Description must be 5000 characters or less')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

/**
 * Infer TypeScript type from create schema
 */
export type TourCreateInput = z.infer<typeof tourCreateSchema>;

/**
 * Validation schema for updating an existing tour
 * All fields are optional to support partial updates
 */
export const tourUpdateSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .optional(),
  subtitle: z.string().max(150, 'Subtitle must be 150 characters or less').optional().nullable(),
  subtitle2: z.string().max(150, 'Subtitle 2 must be 150 characters or less').optional().nullable(),
  description: z
    .string()
    .max(5000, 'Description must be 5000 characters or less')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
});

/**
 * Infer TypeScript type from update schema
 */
export type TourUpdateInput = z.infer<typeof tourUpdateSchema>;

/**
 * Validation schema for tour query parameters
 */
export const tourQuerySchema = z.object({
  search: z.string().optional(),
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
export type TourQueryInput = z.infer<typeof tourQuerySchema>;
