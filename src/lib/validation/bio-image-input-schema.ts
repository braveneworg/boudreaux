/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { objectId } from './primitives';

/** A Mongo ObjectId (24 hex chars). */
/** Admin input for creating one bio image (manual upload / curated addition). */
export const createBioImageInputSchema = z.object({
  artistId: objectId,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  title: z.string().max(300).nullable().optional(),
  attribution: z.string().max(500),
  alt: z.string().max(500).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export type CreateBioImageInput = z.infer<typeof createBioImageInputSchema>;

/** Admin input for editing one bio image's attribution. */
export const updateBioImageAttributionInputSchema = z.object({
  imageId: objectId,
  attribution: z.string().max(500).nullable(),
});

export type UpdateBioImageAttributionInput = z.infer<typeof updateBioImageAttributionInputSchema>;

/** Admin edit of one bio image's alt text (the accessible description). */
export const updateBioImageAltInputSchema = z.object({
  imageId: objectId,
  alt: z.string().max(500).nullable(),
});

export type UpdateBioImageAltInput = z.infer<typeof updateBioImageAltInputSchema>;

/**
 * A request-size guard, not a product cap: the chosen set is uncapped
 * (ADR-0008, second addendum), and no artist's pool approaches this many
 * rows. It only keeps a hostile payload from carrying thousands of ids.
 */
export const MAX_DISPLAY_IMAGE_IDS_PER_REQUEST = 200;

/**
 * The full replacement of an artist's display images: the chosen bio image
 * ids in display order, each at most once. An empty list clears every
 * display image.
 */
export const setDisplayImagesInputSchema = z.object({
  artistId: objectId,
  imageIds: z
    .array(objectId)
    .max(MAX_DISPLAY_IMAGE_IDS_PER_REQUEST, 'Too many display images in one request')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each image can be chosen only once',
    }),
});

export type SetDisplayImagesInput = z.infer<typeof setDisplayImagesInputSchema>;
