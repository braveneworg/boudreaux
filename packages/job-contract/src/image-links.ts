/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { bioImageSchema } from './bio-generation';
import { httpUrl } from './http-url';

/** The `task` discriminator the Lambda routes an images-from-links event on. */
export const IMAGE_LINKS_TASK = 'images-from-links' as const;

/**
 * Max admin-supplied image-source links one job reads. Single-sourced so the
 * web's dispatch cap and the Lambda's input cap can never disagree (a mismatch
 * would fail the parse and hang the job for the full stale window).
 */
export const MAX_IMAGE_LINKS = 20;

/**
 * Max face-reference images the web sends for Rekognition matching — the same
 * cap the bio-generation input applies to `referenceImageUrls`.
 */
export const MAX_IMAGE_LINK_REFERENCES = 5;

/**
 * Invoke event the web app sends to the bio-generator Lambda for an
 * images-from-links job: read each link for photos (no vision gate), face-score
 * them against `referenceImageUrls`, and POST the survivors to `callbackUrl`.
 */
export const imageLinksInputSchema = z.object({
  task: z.literal(IMAGE_LINKS_TASK),
  artistId: z.string().min(1),
  displayName: z.string().min(1),
  links: z.array(httpUrl).min(1).max(MAX_IMAGE_LINKS),
  referenceImageUrls: z.array(httpUrl).max(MAX_IMAGE_LINK_REFERENCES).optional(),
  callbackUrl: httpUrl,
  jobToken: z.string().min(1),
});

export type ImageLinksInput = z.infer<typeof imageLinksInputSchema>;

/** The successful images-from-links payload: photos found on the linked pages. */
export const imageLinksDataSchema = z.object({
  images: z.array(bioImageSchema),
});

export type ImageLinksData = z.infer<typeof imageLinksDataSchema>;

/** Discriminated result envelope so the callback can branch cheaply. */
export const imageLinksResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: imageLinksDataSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type ImageLinksResult = z.infer<typeof imageLinksResultSchema>;

/** Body the Lambda POSTs to the images-from-links completion callback route. */
export const imageLinksCallbackSchema = z.object({
  jobToken: z.string().min(1),
  result: imageLinksResultSchema,
});

export type ImageLinksCallback = z.infer<typeof imageLinksCallbackSchema>;
