/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Optional date field that gracefully handles empty strings from form inputs.
 * Converts '' to null so that z.coerce.date().nullable() skips coercion,
 * while .optional() on the outside keeps the field optional in the parent object.
 */
const optionalDate = () =>
  z.preprocess((val) => (val === '' ? null : val), z.coerce.date().nullable()).optional();

/**
 * Validation schema for creating a new tour date entry
 */
export const tourDateCreateSchema = z
  .object({
    tourId: z.string({ message: 'Tour ID is required' }).min(1, 'Tour ID is required'),
    startDate: z.coerce.date({ message: 'Start date is required' }),
    endDate: optionalDate(),
    showStartTime: z.coerce.date({
      message: 'Show start time is required',
    }),
    showEndTime: optionalDate(),
    doorsOpenAt: optionalDate(),
    venueId: z.string({ message: 'Venue is required' }).min(1, 'Venue is required'),
    ticketPrices: z
      .string()
      .max(100, 'Ticket prices must be 100 characters or less')
      .optional()
      .nullable(),
    ticketsUrl: z.url('Invalid URL format').or(z.literal('')).optional().nullable(),
    ticketIconUrl: z.url('Invalid icon URL format').or(z.literal('')).optional().nullable(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
    headlinerIds: z.array(z.string()).min(1, 'At least one headliner is required'),
    timeZone: z.string().min(1).max(100).optional().nullable(),
    utcOffset: z.coerce.number().int().min(-840).max(840).optional().nullable(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

/**
 * Infer TypeScript type from create schema
 */
export type TourDateCreateInput = z.infer<typeof tourDateCreateSchema>;

/**
 * Validation schema for updating an existing tour date
 * All fields are optional to support partial updates
 */
export const tourDateUpdateSchema = z
  .object({
    startDate: optionalDate(),
    endDate: optionalDate(),
    showStartTime: optionalDate(),
    showEndTime: optionalDate(),
    doorsOpenAt: optionalDate(),
    venueId: z.string().min(1, 'Venue cannot be empty').optional(),
    ticketPrices: z
      .string()
      .max(100, 'Ticket prices must be 100 characters or less')
      .optional()
      .nullable(),
    ticketsUrl: z.url('Invalid URL format').or(z.literal('')).optional().nullable(),
    ticketIconUrl: z.url('Invalid icon URL format').or(z.literal('')).optional().nullable(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
    headlinerIds: z.array(z.string()).min(1, 'At least one headliner is required').optional(),
    timeZone: z.string().min(1).max(100).optional().nullable(),
    utcOffset: z.coerce.number().int().min(-840).max(840).optional().nullable(),
  })
  .refine(
    (data) => {
      // If both dates provided, endDate must be after startDate
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'End date must be after start date',
      path: ['endDate'],
    }
  );

/**
 * Infer TypeScript type from update schema
 */
export type TourDateUpdateInput = z.infer<typeof tourDateUpdateSchema>;
