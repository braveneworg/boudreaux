/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { TourWithRelations } from '@/lib/repositories/tours/tour-repository';
import { artistScalarSchema } from '@/lib/validation/media-models-schema';

/**
 * Strict Zod schema mirroring the serialized `TourWithRelations` row returned
 * by `GET /api/tours` (tour + dates with venue and headliners + images).
 * `DateTime` fields arrive as ISO strings, so `z.coerce.date()` rebuilds `Date`.
 */

const date = z.coerce.date();
const nullableDate = z.coerce.date().nullable();
const nullableString = z.string().nullable();

/** `TourImage` scalars (`images: { orderBy }`). */
const tourImageSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  s3Key: z.string(),
  s3Url: z.string(),
  s3Bucket: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  displayOrder: z.number(),
  altText: nullableString,
  createdAt: date,
  uploadedBy: nullableString,
});

/** `Venue` scalars (`tourDates.venue: true`). */
const venueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: nullableString,
  city: z.string(),
  state: nullableString,
  postalCode: nullableString,
  country: nullableString,
  capacity: z.number().nullable(),
  notes: nullableString,
  timeZone: nullableString,
  createdAt: date,
  updatedAt: date,
  createdBy: nullableString,
  updatedBy: nullableString,
});

/** `TourDateHeadliner` with its optional artist (`headliners.artist: true`). */
const tourDateHeadlinerSchema = z.object({
  id: z.string(),
  tourDateId: z.string(),
  artistId: nullableString,
  sortOrder: z.number(),
  setTime: nullableDate,
  createdAt: date,
  artist: artistScalarSchema.nullable(),
});

/** `TourDate` with its venue and headliners. */
const tourDateSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  startDate: date,
  endDate: nullableDate,
  showStartTime: date,
  showEndTime: nullableDate,
  doorsOpenAt: nullableDate,
  venueId: z.string(),
  timeZone: nullableString,
  utcOffset: z.number().nullable(),
  ticketsUrl: nullableString,
  ticketIconUrl: nullableString,
  ticketPrices: nullableString,
  notes: nullableString,
  createdAt: date,
  updatedAt: date,
  venue: venueSchema,
  headliners: z.array(tourDateHeadlinerSchema),
});

/** `Tour` with all relations, matching the `GET /api/tours` row shape. */
export const tourWithRelationsSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: nullableString,
  subtitle2: nullableString,
  description: nullableString,
  notes: nullableString,
  createdAt: date,
  updatedAt: date,
  createdBy: nullableString,
  updatedBy: nullableString,
  tourDates: z.array(tourDateSchema),
  images: z.array(tourImageSchema),
}) satisfies z.ZodType<TourWithRelations>;
