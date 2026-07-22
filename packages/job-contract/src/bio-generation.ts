/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Max releases the web sends to the Lambda in one bio-generation invoke, and the
 * cap the Lambda enforces on the `releases` array. Single-sourced so the two
 * can never disagree (a mismatch would hang the job for the full stale window).
 */
export const MAX_LAMBDA_RELEASES = 100;

/** ISO calendar-date string in the form YYYY-MM-DD. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Invoke event the web app sends to the bio-generator Lambda. `callbackUrl` /
 * `jobToken` / `progressUrl` carry the async plumbing; `releases` is capped at
 * {@link MAX_LAMBDA_RELEASES} on both ends.
 */
export const bioGenerationInputSchema = z.object({
  artistId: z.string().min(1),
  displayName: z.string().min(1),
  realName: z.string().optional(),
  akaNames: z.string().optional(),
  links: z.array(z.string().url()).max(20).optional(),
  referenceImageUrls: z.array(z.string().url()).max(5).optional(),
  description: z.string().max(2000).optional(),
  existingGenres: z.string().optional(),
  bornOn: isoDate.optional(),
  diedOn: isoDate.optional(),
  formedOn: isoDate.optional(),
  callbackUrl: z.string().url().optional(),
  jobToken: z.string().min(1).optional(),
  progressUrl: z.string().url().optional(),
  releases: z
    .array(
      z.object({
        title: z.string().min(1),
        releasedOn: isoDate.optional(),
        url: z.string().min(1),
      })
    )
    .max(MAX_LAMBDA_RELEASES)
    .optional(),
});

export type BioGenerationInput = z.infer<typeof bioGenerationInputSchema>;

/** One discovered image the Lambda proposes, validated at the invoke boundary. */
export const bioImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
  attribution: z.string(),
  license: z.string().nullable().optional(),
  licenseUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean(),
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  alt: z.string().nullable().optional(),
  hasFace: z.boolean().nullable().optional(),
  faceScore: z.number().min(0).max(100).nullable().optional(),
});

export type BioImage = z.infer<typeof bioImageSchema>;

/** A discovered external link (Wikipedia, official site, MusicBrainz, social, …). */
export const bioLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  kind: z
    .enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'press', 'other'])
    .optional(),
});

export type BioLink = z.infer<typeof bioLinkSchema>;

/** The successful bio-generation payload the Lambda returns. */
export const bioGenerationDataSchema = z.object({
  shortBio: z.string(),
  longBio: z.string(),
  altBio: z.string(),
  genres: z.string().nullable().optional(),
  images: z.array(bioImageSchema),
  links: z.array(bioLinkSchema),
  model: z.string(),
});

export type BioGenerationData = z.infer<typeof bioGenerationDataSchema>;

/** Discriminated result envelope so the callback can branch cheaply. */
export const bioGenerationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: bioGenerationDataSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type BioGenerationResult = z.infer<typeof bioGenerationResultSchema>;

/** Body the Lambda POSTs to the async completion callback route. */
export const bioGenerationCallbackSchema = z.object({
  jobToken: z.string().min(1),
  result: bioGenerationResultSchema,
});

export type BioGenerationCallback = z.infer<typeof bioGenerationCallbackSchema>;
