/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ReleaseDigitalFormatRecord } from '@/lib/types/domain/release';

import { date, nullableDate, nullableString } from './shared-schema';

/** `ReleaseDigitalFormatFile` scalars (file sizes are serialized BigInts). */
const digitalFormatFileSchema = z.object({
  id: z.string(),
  formatId: z.string(),
  trackNumber: z.number(),
  title: nullableString,
  duration: z.number().nullable(),
  s3Key: z.string(),
  fileName: z.string(),
  fileSize: z.coerce.bigint(),
  mimeType: z.string(),
  checksum: nullableString,
  uploadedAt: date,
  createdAt: date,
  updatedAt: date,
  // Runtime-only: `attachStreamUrls` signs a CloudFront URL for non-public
  // formats. Absent for public (MP3 320) files. Preserved (not stripped) so
  // the media player can read it; not part of the Prisma scalar type.
  streamUrl: z.string().nullish(),
});

/** `ReleaseDigitalFormat` with its child files (`digitalFormats: { include: { files } }`). */
export const digitalFormatWithFilesSchema = z.object({
  id: z.string(),
  releaseId: z.string(),
  formatType: z.string(),
  s3Key: nullableString,
  fileName: nullableString,
  fileSize: z.coerce.bigint().nullable(),
  mimeType: nullableString,
  trackCount: z.number(),
  totalFileSize: z.coerce.bigint().nullable(),
  checksum: nullableString,
  deletedAt: nullableDate,
  uploadedAt: date,
  createdAt: date,
  updatedAt: date,
  files: z.array(digitalFormatFileSchema),
}) satisfies z.ZodType<ReleaseDigitalFormatRecord>;
