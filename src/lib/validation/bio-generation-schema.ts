/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { isHttpUrl } from '@/lib/utils/is-http-url';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

// z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
// scheme so a reference link can never become a script-bearing href.
const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');

/**
 * Admin-supplied input for the generate-bio Server Action. Reference links and
 * the description are optional; the artist's names/genres are read server-side
 * from the persisted record, not trusted from the client.
 */
export const generateArtistBioInputSchema = z.object({
  artistId: objectId,
  links: z.array(httpUrl).max(20).optional(),
  description: z.string().max(2000).optional(),
});

export type GenerateArtistBioInput = z.infer<typeof generateArtistBioInputSchema>;

/**
 * Contract the Lambda returns. Kept in lockstep with `bio-generator/src/types.ts`
 * (the two projects cannot share a module). Validated at the invoke boundary so
 * a malformed Lambda response is treated as a failure, not trusted blindly.
 */
export const bioGenerationImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
  attribution: z.string(),
  license: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean(),
});

export const bioGenerationLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  kind: z.enum(['wikipedia', 'official', 'musicbrainz', 'social', 'other']).optional(),
});

export const bioGenerationDataSchema = z.object({
  shortBio: z.string(),
  longBio: z.string(),
  genres: z.string().nullable().optional(),
  images: z.array(bioGenerationImageSchema),
  links: z.array(bioGenerationLinkSchema),
  model: z.string(),
});

export type BioGenerationData = z.infer<typeof bioGenerationDataSchema>;

export const bioGenerationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: bioGenerationDataSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type BioGenerationResult = z.infer<typeof bioGenerationResultSchema>;

/** Sanitized content the Server Action returns to the admin form for preview. */
export interface GeneratedBioContent {
  shortBio: string;
  longBio: string;
  genres: string | null;
  images: Array<{
    url: string;
    thumbnailUrl: string | null;
    title: string | null;
    attribution: string | null;
    license: string | null;
    sourceUrl: string | null;
    isPrimary: boolean;
  }>;
  links: Array<{ label: string; url: string; kind: string | null }>;
  model: string;
}

/** Async bio-generation lifecycle states (null = never generated). */
export const BIO_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export type BioStatus = (typeof BIO_STATUSES)[number];

/** Terminal states — polling stops once the job reaches one of these. */
export const isTerminalBioStatus = (status: BioStatus | null | undefined): boolean =>
  status === 'succeeded' || status === 'failed';

/**
 * Result of *triggering* async bio generation. Generation now runs in the
 * background (Next.js `after()`); the action returns immediately with the job
 * status, and the client polls {@link BioGenerationStatusResult} for completion.
 */
export type GenerateArtistBioActionResult =
  | { success: true; status: BioStatus }
  | { success: false; error: string };

/** Polled status of an artist's async bio generation. */
export interface BioGenerationStatusResult {
  status: BioStatus | null;
  error: string | null;
  /** Persisted, sanitized content — present only when `status` is `'succeeded'`. */
  content: GeneratedBioContent | null;
}

/** Wire schema for the bio-generation status route, validated on the client. */
export const bioGenerationStatusResponseSchema = z.object({
  status: z.enum(BIO_STATUSES).nullable(),
  error: z.string().nullable(),
  content: z
    .object({
      shortBio: z.string(),
      longBio: z.string(),
      genres: z.string().nullable(),
      images: z.array(
        z.object({
          url: z.string(),
          thumbnailUrl: z.string().nullable(),
          title: z.string().nullable(),
          attribution: z.string().nullable(),
          license: z.string().nullable(),
          sourceUrl: z.string().nullable(),
          isPrimary: z.boolean(),
        })
      ),
      links: z.array(z.object({ label: z.string(), url: z.string(), kind: z.string().nullable() })),
      model: z.string(),
    })
    .nullable(),
});
