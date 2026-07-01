/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/** Descriptive User-Agent required by MusicBrainz / Wikimedia APIs. */
export const USER_AGENT = 'FakeFourRecords-BioGenerator/1.0 ( https://fakefourrecords.com )';

/**
 * Default Gemini model — `gemini-flash-latest`, an alias that always resolves to
 * a current Flash model the API key can access. Pinned exact ids proved fragile:
 * both `gemini-3-flash` and `gemini-2.5-pro` returned 404 (`NOT_FOUND`) for this
 * project's key/tier on `generateContent`. The alias is immune to that and to
 * model retirements, with a 1M-token context window and native JSON output.
 * Overridable per environment via `GEMINI_MODEL` (e.g. `gemini-2.5-flash`).
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

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
  altBio: z.string(),
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
export const bioProseSchema = z.object({
  shortBio: z.string().min(1),
  longBio: z.string().min(1),
  /** Optional so a model omission degrades to an empty alt bio, not a failure. */
  altBio: z.string().optional(),
  genres: z.string().optional(),
  primaryImageIndexes: z.array(z.number().int().nonnegative()).optional(),
});

export type BioProse = z.infer<typeof bioProseSchema>;

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
  /** MusicBrainz-derived structured facts (best-effort; omitted when unknown). */
  artistType?: string;
  area?: string;
  beginDate?: string;
  endDate?: string;
  tags?: string[];
  /**
   * Long-form source material (Wikipedia article body and/or web-search
   * content) the LLM rewrites into an original bio. The single biggest driver
   * of bio quality — without it the model has only sparse facts to work from.
   */
  sourceText?: string;
  /** Provenance of {@link sourceText}, for the model to weave in as inline links. */
  sourceUrls?: string[];
}
