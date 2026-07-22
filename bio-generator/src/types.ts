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
 * live status. This list AND its order are a wire contract — single-sourced in
 * `@fakefour/job-contract` and re-exported here under the Lambda's existing
 * names so `handler.ts` / `progress.ts` import sites are unchanged. The web app
 * consumes the same definitions, so the two projects can no longer drift.
 */
export { BIO_PROGRESS_STAGES as PROGRESS_STAGES } from '@fakefour/job-contract';
export type { BioProgressStage as ProgressStage } from '@fakefour/job-contract';

/**
 * Bio-generation wire shapes — the invoke input, the discovered image/link
 * shapes, the generation-data payload, its result envelope, and the completion
 * callback body — are single-sourced in `@fakefour/job-contract` and re-exported
 * here under the Lambda's existing names, so handler.ts / gemini.ts / callback.ts
 * import sites are unchanged. `bioGenerationInputSchema` caps `releases` at the
 * shared `MAX_LAMBDA_RELEASES`.
 */
export {
  MAX_LAMBDA_RELEASES,
  bioGenerationInputSchema,
  bioImageSchema,
  bioLinkSchema,
  bioGenerationDataSchema,
  bioGenerationResultSchema,
  bioGenerationCallbackSchema,
  type BioGenerationInput,
  type BioImage,
  type BioLink,
  type BioGenerationData,
  type BioGenerationResult,
  type BioGenerationCallback,
} from '@fakefour/job-contract';

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
 * Video-enrichment wire shapes — the progress stages, the invoke input, and the
 * suggestion/result shapes — are single-sourced in `@fakefour/job-contract` and
 * re-exported here under the Lambda's existing names (handler.ts /
 * video-enrichment.ts import sites unchanged). The shared schemas carry the
 * STRICTER of the two projects' validators (http(s)-only source URLs, ObjectId
 * artist ids); the Lambda uses them only for typing — it never runtime-parses
 * its own output — so the added strictness is a no-op at runtime here and lives
 * where it matters: the web's callback-boundary parse.
 */
export {
  VIDEO_PROGRESS_STAGES,
  videoKnownIdentitySchema,
  videoEnrichmentInputSchema,
  videoSuggestionSourceSchema,
  videoSuggestionSchema,
  videoEnrichmentDataSchema,
  videoEnrichmentResultSchema,
  type VideoProgressStage,
  type VideoEnrichmentInput,
  type VideoSuggestion,
  type VideoEnrichmentData,
  type VideoEnrichmentResult,
} from '@fakefour/job-contract';

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
