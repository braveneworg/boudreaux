/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/** Descriptive User-Agent required by MusicBrainz / Wikimedia APIs. */
export const USER_AGENT = 'FakeFourRecords-BioGenerator/1.0 ( https://fakefourrecords.com )';

/** Default Groq model — fast, free-tier friendly, supports JSON mode. */
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Input the web app sends to the Lambda. Names drive the metadata lookup;
 * `links` and `description` are optional admin-supplied context. The LLM only
 * writes prose — it never invents the image/link URLs returned to the caller.
 */
export const bioGenerationInputSchema = z.object({
  artistId: z.string().min(1),
  displayName: z.string().min(1),
  realName: z.string().optional(),
  akaNames: z.string().optional(),
  links: z.array(z.string().url()).max(20).optional(),
  description: z.string().max(2000).optional(),
  existingGenres: z.string().optional(),
});

export type BioGenerationInput = z.infer<typeof bioGenerationInputSchema>;

/** A discovered image with the attribution/license required to display it. */
export const bioImageSchema = z.object({
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

export type BioImage = z.infer<typeof bioImageSchema>;

/** A discovered external link (Wikipedia, official site, MusicBrainz, social). */
export const bioLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  kind: z.enum(['wikipedia', 'official', 'musicbrainz', 'social', 'other']).optional(),
});

export type BioLink = z.infer<typeof bioLinkSchema>;

/** The successful payload the Lambda returns to the web app. */
export const bioGenerationDataSchema = z.object({
  shortBio: z.string(),
  longBio: z.string(),
  genres: z.string().nullable().optional(),
  images: z.array(bioImageSchema),
  links: z.array(bioLinkSchema),
  model: z.string(),
});

export type BioGenerationData = z.infer<typeof bioGenerationDataSchema>;

/** Discriminated result envelope so the caller can branch on success cheaply. */
export const bioGenerationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: bioGenerationDataSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type BioGenerationResult = z.infer<typeof bioGenerationResultSchema>;

/** Just the prose the LLM is responsible for — validated before assembly. */
export const groqProseSchema = z.object({
  shortBio: z.string().min(1),
  longBio: z.string().min(1),
  genres: z.string().optional(),
  primaryImageIndexes: z.array(z.number().int().nonnegative()).optional(),
});

export type GroqProse = z.infer<typeof groqProseSchema>;

/** Grounding facts gathered from MusicBrainz/Wikidata, passed to the LLM. */
export interface ArtistFacts {
  displayName: string;
  realName?: string;
  akaNames?: string;
  description?: string;
  existingGenres?: string;
  musicBrainzId?: string;
  wikipediaUrl?: string;
  officialUrl?: string;
  imageTitles: string[];
}
