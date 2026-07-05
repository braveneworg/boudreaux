/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** A Mongo ObjectId (24 hex chars). */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

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
