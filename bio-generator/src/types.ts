/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/** Descriptive User-Agent required by MusicBrainz / Wikimedia APIs. */
export const USER_AGENT = 'FakeFourRecords-BioGenerator/1.0 ( https://fakefourrecords.com )';

/**
 * Default Gemini model — Gemini 2.5 Flash: a current, GA model id (the bare
 * `gemini-3-flash` is not a valid id and 404s on generateContent) that the
 * free tier can actually call — the free tier grants ZERO `gemini-2.5-pro`
 * quota (`limit: 0` on every metric), so Pro 429s on every request without
 * billing enabled. Flash keeps the 1M-token context window (so source material
 * never needs trimming) and native JSON output. Overridable per environment
 * via `GEMINI_MODEL` (e.g. `gemini-2.5-pro` once the project is billed).
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** ISO calendar-date string in the form YYYY-MM-DD. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

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
  bornOn: isoDate.optional(),
  diedOn: isoDate.optional(),
  formedOn: isoDate.optional(),
  /** Async completion callback URL the Lambda POSTs its result to (absent = synchronous/no callback). */
  callbackUrl: z.string().url().optional(),
  /** Opaque per-job token echoed back in the callback so the web app can match the in-flight job. */
  jobToken: z.string().min(1).optional(),
  /**
   * The label's own published releases for this artist — authoritative
   * chronology anchors AND allow-listed internal link targets
   * (`/releases/<id>` paths) the prose may cite.
   */
  releases: z
    .array(
      z.object({
        title: z.string().min(1),
        releasedOn: isoDate.optional(),
        url: z.string().min(1),
      })
    )
    .max(100)
    .optional(),
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
  /** Subject classification from provenance or the vision pass. */
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  /** Short accessible description, written by the vision pass when available. */
  alt: z.string().nullable().optional(),
});

export type BioImage = z.infer<typeof bioImageSchema>;

/** A discovered external link (Wikipedia, official site, MusicBrainz, social, streaming). */
export const bioLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  kind: z
    .enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'press', 'other'])
    .optional(),
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

/** A single fact-check violation flagged by the critic pass. */
export const bioCritiqueViolationSchema = z.object({
  location: z.enum(['shortBio', 'longBio', 'altBio']),
  quote: z.string().min(1),
  issue: z.string().min(1),
});
export type BioCritiqueViolation = z.infer<typeof bioCritiqueViolationSchema>;

/** The full critic result: zero or more violations detected in the bios. */
export const bioCritiqueSchema = z.object({ violations: z.array(bioCritiqueViolationSchema) });
export type BioCritique = z.infer<typeof bioCritiqueSchema>;

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
   * Authoritative dates from the label's own database — they outrank MusicBrainz
   * life-span. Tasks 4 and 10 rely on `bornOn` for the fact-check pass.
   */
  bornOn?: string;
  diedOn?: string;
  formedOn?: string;
  /**
   * Long-form source material (Wikipedia article body and/or web-search
   * content) the LLM rewrites into an original bio. The single biggest driver
   * of bio quality — without it the model has only sparse facts to work from.
   */
  sourceText?: string;
  /** Provenance of {@link sourceText}, for the model to weave in as inline links. */
  sourceUrls?: string[];
  /**
   * Structured timeline lines ("2015: released \"Broken Bone Ballads\"") built
   * from MusicBrainz release-group dates and the label's own releases. Dates
   * in prose must come from here or the labeled facts — not model recall.
   */
  chronology?: string[];
  /** Site-relative `/releases/<id>` paths the prose may link, labeled by title. */
  internalReleaseUrls?: string[];
}
