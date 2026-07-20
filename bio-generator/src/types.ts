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

/**
 * Higher-reasoning Gemini model — Gemini 2.5 Pro — for the paid-tier synthesis
 * and quality passes, where its stronger merging and fact-checking justify the
 * cost. The free tier grants it ZERO quota (`limit: 0`), so it only runs once
 * billing is enabled; every Pro call falls back to {@link DEFAULT_GEMINI_MODEL}
 * on failure. Overridable per environment once the project is billed.
 */
export const DEFAULT_GEMINI_PRO_MODEL = 'gemini-2.5-pro';

/**
 * Ordered generation stages the Lambda checkpoints through as it works, POSTed
 * best-effort to the web app's progress endpoint so the admin timeline can show
 * live status. This list AND its order are a wire contract: it MUST stay in
 * lockstep with the web counterpart `BIO_PROGRESS_STAGES` in
 * `src/lib/validation/bio-generation-schema.ts` (the two projects cannot share a
 * module).
 */
export const PROGRESS_STAGES = [
  'musicbrainz',
  'wikidata',
  'commons',
  'cover-art',
  'web-search',
  'link-follow',
  'vision-gating',
  'drafting',
  'synthesizing',
  'quality-pass',
  'finalizing',
] as const;

/** A single generation checkpoint stage name (see {@link PROGRESS_STAGES}). */
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

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
  /**
   * Admin-supplied reference photos of the artist — used by the Rekognition
   * face stage to score how strongly a candidate matches the known subject.
   */
  referenceImageUrls: z.array(z.string().url()).max(5).optional(),
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
   * Best-effort progress endpoint the Lambda POSTs stage checkpoints to as it
   * works (verified with the same per-job `jobToken`). Absent → no progress
   * reporting, and generation behaves byte-identically to before.
   */
  progressUrl: z.string().url().optional(),
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

/**
 * The minimum an event must carry for the Lambda to report back at all: the
 * completion URL and the per-job token.
 *
 * Parsed separately from `bioGenerationInputSchema` on purpose. When the full
 * input parse fails there is no parsed output to read the callback details
 * from, and those are exactly the details needed to tell the web app that the
 * job is dead — otherwise it waits out the 17-minute stale sweep.
 */
export const callbackTargetSchema = z.object({
  callbackUrl: z.string().url(),
  jobToken: z.string().min(1),
});

/** A discovered image with the attribution/license required to display it. */
export const bioImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
  attribution: z.string(),
  license: z.string().nullable().optional(),
  /** Machine-readable license page from Commons `extmetadata.LicenseUrl`, when known. */
  licenseUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean(),
  /** Subject classification from provenance or the vision pass. */
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  /** Short accessible description, written by the vision pass when available. */
  alt: z.string().nullable().optional(),
  /**
   * Rekognition face signal: whether a face was detected in the image. `null`
   * means the image was not analyzed. Ranking signal only — never a hard gate.
   */
  hasFace: z.boolean().nullable().optional(),
  /**
   * Rekognition face signal: the max CompareFaces similarity (0..100) against
   * the admin reference images. `null` means not analyzed (or no face detected).
   * Ranking signal only — never a hard gate.
   */
  faceScore: z.number().min(0).max(100).nullable().optional(),
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

/**
 * Ordered stages the video-enrichment mode checkpoints through. Wire contract
 * with the web counterpart `VIDEO_PROGRESS_STAGES` in
 * `src/lib/validation/video-enrichment-schema.ts` — keep in lockstep (the two
 * projects cannot share a module).
 */
export const VIDEO_PROGRESS_STAGES = [
  'musicbrainz',
  'wikidata',
  'web-search',
  'adjudicating',
  'finalizing',
] as const;

/** A single video-enrichment checkpoint stage name. */
export type VideoProgressStage = (typeof VIDEO_PROGRESS_STAGES)[number];

/** Identity fields the web app already holds for a linked artist. */
export const videoKnownIdentitySchema = z.object({
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  surname: z.string().optional(),
  displayName: z.string().optional(),
  akaNames: z.string().optional(),
  bornOn: isoDate.optional(),
});

/**
 * Input the web app sends for `task: 'video-enrichment'`. The `known` block
 * lets the Lambda skip facts the label already has; `callbackUrl`/
 * `progressUrl`/`jobToken` mirror the bio pipeline's async plumbing. The
 * `jobToken` cap (≤200) matches the web callback/progress POST schemas in
 * `src/lib/validation/video-enrichment-schema.ts`.
 */
export const videoEnrichmentInputSchema = z.object({
  task: z.literal('video-enrichment'),
  videoId: z.string().min(1),
  title: z.string().min(1),
  artistDisplay: z.string().min(1),
  releasedOn: isoDate.optional(),
  artists: z
    .array(
      z.object({
        artistId: z.string().min(1),
        name: z.string().min(1),
        role: z.enum(['primary', 'featured']),
        known: videoKnownIdentitySchema.optional(),
      })
    )
    .min(1)
    .max(10),
  callbackUrl: z.string().url().optional(),
  progressUrl: z.string().url().optional(),
  jobToken: z.string().min(1).max(200).optional(),
});

export type VideoEnrichmentInput = z.infer<typeof videoEnrichmentInputSchema>;

/**
 * One provenance link backing a suggestion. The `url` cap (≤2048) and `label`
 * cap (≤200) mirror the web's `videoSuggestionSourceSchema` — keep in lockstep.
 */
export const videoSuggestionSourceSchema = z.object({
  url: z.string().url().max(2048),
  label: z.string().max(200).optional(),
});

/**
 * One reviewable fact. Mirrors the web's `videoSuggestionSchema` in
 * `src/lib/validation/video-enrichment-schema.ts` — keep in lockstep.
 */
export const videoSuggestionSchema = z.object({
  field: z.enum([
    'firstName',
    'middleName',
    'surname',
    'akaNames',
    'bornOn',
    'displayName',
    'releasedOn',
    'description',
    'featuredArtist',
  ]),
  value: z.string().min(1).max(500),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(videoSuggestionSourceSchema).max(10),
  note: z.string().max(500).optional(),
});

export type VideoSuggestion = z.infer<typeof videoSuggestionSchema>;

/**
 * A video-level suggestion — the fielded suggestion shape without its `field`
 * discriminator (the `video` object keys it by position instead). Backs the
 * release date and each discovered featured artist. Mirrors the web's
 * `videoLevelSuggestionSchema` — keep in lockstep.
 */
const videoLevelSuggestionSchema = videoSuggestionSchema.omit({ field: true });

/**
 * A synthesized video description (2–4 sentences). Widens the base 500-char
 * value cap to 2000 — long-form prose, unlike the short fielded facts. Mirrors
 * the web's `videoDescriptionSuggestionSchema` — keep in lockstep.
 */
const videoDescriptionSuggestionSchema = videoLevelSuggestionSchema.extend({
  value: z.string().min(1).max(2000),
});

/** The successful video-enrichment payload (mirrors the web schema). */
export const videoEnrichmentDataSchema = z.object({
  artists: z
    .array(
      z.object({
        artistId: z.string().min(1),
        suggestions: z.array(videoSuggestionSchema).max(12),
      })
    )
    .max(10),
  video: z
    .object({
      releasedOn: videoLevelSuggestionSchema.optional(),
      description: videoDescriptionSuggestionSchema.optional(),
      featuredArtists: z.array(videoLevelSuggestionSchema).max(5).optional(),
    })
    .optional(),
  model: z.string().max(100),
});

export type VideoEnrichmentData = z.infer<typeof videoEnrichmentDataSchema>;

/**
 * Discriminated result envelope for the video-enrichment mode. The failure
 * `error` cap (≤2000) mirrors the web's `videoEnrichmentResultSchema`.
 */
export const videoEnrichmentResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: videoEnrichmentDataSchema }),
  z.object({ ok: z.literal(false), error: z.string().max(2000) }),
]);

export type VideoEnrichmentResult = z.infer<typeof videoEnrichmentResultSchema>;

export const releaseDateLookupInputSchema = z.object({
  task: z.literal('release-date-lookup'),
  title: z.string().min(1),
  artist: z.string().optional(),
});

export type ReleaseDateLookupInput = z.infer<typeof releaseDateLookupInputSchema>;

export type ReleaseDateLookupResult =
  | {
      ok: true;
      result: {
        releasedOn: string;
        confidence: 'high' | 'medium' | 'low';
        sources: string[];
      } | null;
    }
  | { ok: false; error: string };
