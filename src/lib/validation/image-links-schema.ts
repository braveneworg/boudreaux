/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  imageLinksCallbackSchema,
  type ImageLinksCallback,
  type ImageLinksData,
  type ImageLinksInput,
  type ImageLinksResult,
  MAX_IMAGE_LINKS,
} from '@fakefour/job-contract';
import { z } from 'zod';

import { isHttpUrl } from '@/lib/utils/is-http-url';
import { ASYNC_JOB_STATUSES } from '@/utils/async-job-lifecycle';

import { objectIdSchema } from './bio-generation-schema';

// Re-export the shared wire contract so web code imports one module.
export {
  imageLinksCallbackSchema,
  MAX_IMAGE_LINKS,
  type ImageLinksCallback,
  type ImageLinksData,
  type ImageLinksInput,
  type ImageLinksResult,
};

/** Longest URL an admin may store as an image source (a generous page-URL bound). */
export const MAX_IMAGE_SOURCE_URL_LENGTH = 2048;

// z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
// scheme + host (docs/lessons/validation/zod-url-fields-use-is-http-url.md).
const httpUrl = z
  .string()
  .trim()
  .max(MAX_IMAGE_SOURCE_URL_LENGTH, 'Link is too long')
  .refine(isHttpUrl, 'Links must start with http:// or https://');

/** Server Action input: flag one URL as an image source for an artist. */
export const addImageSourceLinkInputSchema = z.object({
  artistId: objectIdSchema,
  url: httpUrl,
});

export type AddImageSourceLinkInput = z.infer<typeof addImageSourceLinkInputSchema>;

/** Server Action input: drop the image-source role from one of the artist's links. */
export const removeImageSourceLinkInputSchema = z.object({
  artistId: objectIdSchema,
  linkId: objectIdSchema,
});

export type RemoveImageSourceLinkInput = z.infer<typeof removeImageSourceLinkInputSchema>;

/** Server Action input: start an images-from-links job for an artist. */
export const generateImagesFromLinksInputSchema = z.object({
  artistId: objectIdSchema,
});

export type GenerateImagesFromLinksInput = z.infer<typeof generateImagesFromLinksInputSchema>;

/** One image-source link as the status endpoint returns it (DB row id included). */
export const imageSourceLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
});

export type ImageSourceLink = z.infer<typeof imageSourceLinkSchema>;

/**
 * Wire schema for `GET /api/artists/[id]/image-links`, validated on the client:
 * the artist's image-source links plus the async job's lifecycle view.
 * `addedCount` is the last succeeded run's pool additions (drives the toast).
 */
export const imageLinksStatusResponseSchema = z.object({
  status: z.enum(ASYNC_JOB_STATUSES).nullable(),
  error: z.string().nullable(),
  addedCount: z.number().int().min(0).nullable(),
  links: z.array(imageSourceLinkSchema),
});

export type ImageLinksStatusResponse = z.infer<typeof imageLinksStatusResponseSchema>;

/** Result of triggering an images-from-links job (mirrors the bio trigger). */
export type GenerateImagesFromLinksActionResult =
  { success: true; status: 'pending' | 'processing' } | { success: false; error: string };
