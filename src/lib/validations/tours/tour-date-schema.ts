/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Validation schema for creating a new tour date entry
 */
export const tourDateCreateSchema = z
  .object({
    tourId: z.string({ message: 'Tour ID is required' }).min(1, 'Tour ID is required'),
    startDate: z.coerce.date({ message: 'Start date is required' }),
    endDate: z.coerce.date().optional().nullable(),
    showStartTime: z.coerce.date({
      message: 'Show start time is required',
    }),
    showEndTime: z.coerce.date().optional().nullable(),
    venueId: z.string({ message: 'Venue is required' }).min(1, 'Venue is required'),
    ticketPrices: z
      .string()
      .max(100, 'Ticket prices must be 100 characters or less')
      .optional()
      .nullable(),
    ticketsUrl: z.string().url('Invalid URL format').or(z.literal('')).optional().nullable(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
    headlinerIds: z.array(z.string()).min(1, 'At least one headliner is required'),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  })
  .refine((data) => !data.showEndTime || data.showEndTime > data.showStartTime, {
    message: 'Show end time must be after show start time',
    path: ['showEndTime'],
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
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable(),
    showStartTime: z.coerce.date().optional().nullable(),
    showEndTime: z.coerce.date().optional().nullable(),
    venueId: z.string().min(1, 'Venue cannot be empty').optional(),
    ticketPrices: z
      .string()
      .max(100, 'Ticket prices must be 100 characters or less')
      .optional()
      .nullable(),
    ticketsUrl: z.string().url('Invalid URL format').or(z.literal('')).optional().nullable(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
    headlinerIds: z.array(z.string()).min(1, 'At least one headliner is required').optional(),
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
  )
  .refine(
    (data) => {
      // If both times provided, showEndTime must be after showStartTime
      if (data.showStartTime && data.showEndTime) {
        return data.showEndTime > data.showStartTime;
      }
      return true;
    },
    {
      message: 'Show end time must be after show start time',
      path: ['showEndTime'],
    }
  );

/**
 * Infer TypeScript type from update schema
 */
export type TourDateUpdateInput = z.infer<typeof tourDateUpdateSchema>;
