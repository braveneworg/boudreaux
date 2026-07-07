/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { VideoCategory } from '@/lib/types/domain/video';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';

/**
 * Strict Zod schemas mirroring the serialized JSON shape of the `Video` model
 * returned by the `/api/videos` route handlers.
 *
 * Two wire-format facts are handled so runtime values match the Prisma-derived
 * TypeScript types (see `media-models-schema`):
 * - `DateTime` fields arrive as ISO strings → `z.coerce.date()` rebuilds `Date`.
 * - the `BigInt` `fileSize` is serialized to `number` → `z.coerce.bigint()`
 *   restores `bigint`.
 */

const date = z.coerce.date();
const nullableDate = z.coerce.date().nullable();
const nullableString = z.string().nullable();

/** Video category enum — matches the Prisma `VideoCategory` enum. */
export const videoCategorySchema = z.enum([
  'MUSIC',
  'INFORMATIONAL',
]) satisfies z.ZodType<VideoCategory>;

/**
 * Wire shape of a `Video` row after `serializeForResponse`, parsed client-side
 * by `fetchAndParse`. `streamUrl` is a runtime-only field the route attaches
 * (a signed CloudFront URL, or `null` when signing is unconfigured); it is not
 * part of the Prisma scalar type, so it is optional/nullable here.
 */
export const videoRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  category: videoCategorySchema,
  description: nullableString,
  releasedOn: date,
  durationSeconds: z.number().nullable(),
  s3Key: z.string(),
  fileName: z.string(),
  fileSize: z.coerce.bigint().nullable(),
  mimeType: z.string(),
  posterUrl: nullableString,
  publishedAt: nullableDate,
  archivedAt: nullableDate,
  // Internal audit ObjectIds — stripped from the public listing/SSR payloads, so
  // they are optional here (the admin detail route may still include them).
  createdBy: nullableString.optional(),
  updatedBy: nullableString.optional(),
  createdAt: date,
  updatedAt: date,
  streamUrl: z.string().nullable().optional(),
});

/** Strict schema for one `/api/videos` page (`{ rows, nextSkip }`). */
export const videoPageSchema = paginatedResponseSchema(videoRowSchema);

/** A single validated `Video` row as it arrives over the wire. */
export type VideoRow = z.infer<typeof videoRowSchema>;
