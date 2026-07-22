/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  SUGGESTION_CONFIDENCES,
  VIDEO_LEVEL_SUGGESTION_FIELDS,
  VIDEO_PROGRESS_STAGES,
  VIDEO_SUGGESTION_FIELDS,
  videoSuggestionSourceSchema,
} from '@fakefour/job-contract';
import { z } from 'zod';

import type { VideoCategory } from '@/lib/types/domain/video';
import { ASYNC_JOB_STATUSES, type AsyncJobStatus } from '@/utils/async-job-lifecycle';

import { objectIdSchema } from './bio-generation-schema';

// The suggestion field/confidence lists, the enrichment progress stages, and the
// source-link schema are single-sourced in `@fakefour/job-contract` (the Lambda
// carries the same definitions) and re-exported here; the kept schemas below
// still enum over the field lists and reuse the source schema.
export {
  SUGGESTION_CONFIDENCES,
  VIDEO_LEVEL_SUGGESTION_FIELDS,
  VIDEO_PROGRESS_STAGES,
  VIDEO_SUGGESTION_FIELDS,
  videoSuggestionSourceSchema,
};
export type {
  SuggestionConfidence,
  VideoLevelSuggestionField,
  VideoProgressStage,
  VideoSuggestionField,
} from '@fakefour/job-contract';

/**
 * Async enrichment lifecycle states (null = never enriched) — the shared
 * async-job lifecycle. Decisions (gates, staleness, the client deadline) live
 * in `@/utils/async-job-lifecycle`; this module keeps only the wire shapes.
 */
export type EnrichmentStatus = AsyncJobStatus;

/** The one category whose videos carry web enrichment. */
export const isEnrichableCategory = (category: VideoCategory | null | undefined): boolean =>
  category === 'MUSIC';

/** A video can only be enriched when its artist/creator field names someone. */
export const hasEnrichableArtist = (artist: string | null | undefined): boolean =>
  (artist ?? '').trim() !== '';

/** The two facts enrichment eligibility is decided on. */
export interface EnrichmentEligibilityInput {
  category: VideoCategory | null | undefined;
  artist: string | null | undefined;
}

/** Which half of the eligibility rule a video fails, for per-half copy. */
export type EnrichmentIneligibilityReason = 'category' | 'artist';

/**
 * The single authority on enrichment eligibility: a MUSIC video that names an
 * artist. The conjunction of the two halves exists only here — every gate
 * (the post-save planner, the enrichment service's execution backstop, the
 * manual trigger action, and the admin UI) consumes this, the boolean
 * `isEnrichmentEligible`, or a single half above. Never restate the rule
 * inline: the halves drifting apart is exactly how a video gets stranded at
 * `pending` (a trigger accepts what dispatch later refuses).
 *
 * @returns The failing half, or `null` when the video is eligible.
 */
export const enrichmentIneligibilityReason = ({
  category,
  artist,
}: EnrichmentEligibilityInput): EnrichmentIneligibilityReason | null => {
  if (!isEnrichableCategory(category)) return 'category';
  if (!hasEnrichableArtist(artist)) return 'artist';
  return null;
};

/** Boolean view of {@link enrichmentIneligibilityReason} for yes/no gates. */
export const isEnrichmentEligible = (input: EnrichmentEligibilityInput): boolean =>
  enrichmentIneligibilityReason(input) === null;

/**
 * The suggestion, generation-data, result-envelope, and callback shapes are
 * single-sourced in `@fakefour/job-contract` and re-exported here. The web's
 * boundary strictness (http(s)-only source URLs, ObjectId artist ids) is now
 * the shared contract — the Lambda types against the same definitions, so drift
 * is impossible and a malformed Lambda response is still rejected here.
 */
export {
  videoSuggestionSchema,
  videoEnrichmentDataSchema,
  videoEnrichmentResultSchema,
  videoEnrichmentCallbackSchema,
  type VideoSuggestion,
  type VideoEnrichmentData,
  type VideoEnrichmentResult,
  type VideoEnrichmentCallback,
} from '@fakefour/job-contract';

/**
 * A single progress checkpoint as persisted on the video and served by the
 * status endpoint. `at` is server-stamped on write.
 */
export const videoEnrichmentProgressSchema = z.object({
  stage: z.enum(VIDEO_PROGRESS_STAGES),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
  at: z.string().datetime(),
});
export type VideoEnrichmentProgress = z.infer<typeof videoEnrichmentProgressSchema>;

// The progress-route POST body is single-sourced in `@fakefour/job-contract`
// and re-exported here (the persisted `videoEnrichmentProgressSchema` above,
// which requires a server-stamped `at`, stays web-only).
export {
  videoEnrichmentProgressPostSchema,
  type VideoEnrichmentProgressPost,
} from '@fakefour/job-contract';

/** Wire schema for GET /api/videos/[id]/enrichment — THE pinned status shape. */
export const videoEnrichmentStatusResponseSchema = z.object({
  status: z.enum(ASYNC_JOB_STATUSES).nullable(),
  error: z.string().nullable(),
  progress: videoEnrichmentProgressSchema.nullable(),
  enrichedAt: z.string().nullable(),
  /** The admin-entered release date, day precision (YYYY-MM-DD). */
  currentReleasedOn: z.string(),
  artists: z.array(
    z.object({
      artistId: z.string(),
      displayName: z.string(),
      role: z.enum(['PRIMARY', 'FEATURED']),
      current: z.object({
        firstName: z.string(),
        middleName: z.string().nullable(),
        surname: z.string(),
        akaNames: z.string().nullable(),
        displayName: z.string().nullable(),
        bornOn: z.string().nullable(),
      }),
    })
  ),
  suggestions: z.array(
    z.object({
      id: z.string(),
      artistId: z.string().nullable(),
      field: z.enum(VIDEO_SUGGESTION_FIELDS),
      value: z.string(),
      confidence: z.enum(SUGGESTION_CONFIDENCES),
      sources: z.array(videoSuggestionSourceSchema),
      note: z.string().nullable(),
      status: z.enum(['pending', 'applied', 'dismissed']),
    })
  ),
});
export type VideoEnrichmentStatusResult = z.infer<typeof videoEnrichmentStatusResponseSchema>;

/** Admin input for the apply/dismiss Server Action. */
export const applyVideoSuggestionInputSchema = z.object({
  suggestionId: objectIdSchema,
  op: z.enum(['apply', 'dismiss']),
  /**
   * Optimistic-concurrency guard: the current value the admin saw (dates as
   * YYYY-MM-DD, strings trimmed; null = "field was empty"). Omitted = skip
   * the drift check.
   */
  expectedCurrent: z.string().max(500).nullable().optional(),
});
export type ApplyVideoSuggestionInput = z.infer<typeof applyVideoSuggestionInputSchema>;

/** Result of triggering async enrichment (mirrors GenerateArtistBioActionResult). */
export type RunVideoEnrichmentActionResult =
  | { success: true; status: EnrichmentStatus }
  | { success: false; error: string };

/** Result of applying/dismissing one suggestion. */
export type ApplyVideoSuggestionActionResult =
  | { success: true; op: 'apply' | 'dismiss' }
  | { success: false; error: string };
