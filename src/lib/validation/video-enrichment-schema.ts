/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import type { VideoCategory } from '@/lib/types/domain/video';

import { httpUrlSchema, objectIdSchema } from './bio-generation-schema';

/**
 * The only artist/video fields a suggestion may target. `suggestion.field`
 * always maps through an explicit whitelist switch downstream — never a
 * dynamic Prisma key.
 */
export const VIDEO_SUGGESTION_FIELDS = [
  'firstName',
  'middleName',
  'surname',
  'akaNames',
  'bornOn',
  'displayName',
  'releasedOn',
  'description',
  'featuredArtist',
] as const;
export type VideoSuggestionField = (typeof VIDEO_SUGGESTION_FIELDS)[number];

/**
 * Video-level fields (persisted with `artistId: null`). These are applied
 * client-side into the RHF edit form — never server-applied — because a
 * `videos.detail` refetch would wipe dirty edits. The apply action rejects an
 * `apply` op for every one of these (dismiss stays allowed).
 */
export const VIDEO_LEVEL_SUGGESTION_FIELDS = [
  'releasedOn',
  'description',
  'featuredArtist',
] as const;
export type VideoLevelSuggestionField = (typeof VIDEO_LEVEL_SUGGESTION_FIELDS)[number];

/**
 * Confidence rubric (see the design spec): high = MusicBrainz ≥95 + Wikidata
 * corroboration of the specific fact + music-occupation gate; medium =
 * structured-source but not fully corroborated; low = web/LLM-only.
 */
export const SUGGESTION_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type SuggestionConfidence = (typeof SUGGESTION_CONFIDENCES)[number];

/** Async enrichment lifecycle states (null = never enriched). */
export const ENRICHMENT_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

/** In-flight states — polling continues only while the job is one of these. */
export const isInFlightEnrichmentStatus = (status: string | null | undefined): boolean =>
  status === 'pending' || status === 'processing';

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
 * Ordered stages the Lambda checkpoints through. Wire contract with
 * `bio-generator/src/types.ts` `VIDEO_PROGRESS_STAGES` — keep in lockstep
 * (the two projects cannot share a module).
 */
export const VIDEO_PROGRESS_STAGES = [
  'musicbrainz',
  'wikidata',
  'web-search',
  'adjudicating',
  'finalizing',
] as const;
export type VideoProgressStage = (typeof VIDEO_PROGRESS_STAGES)[number];

/**
 * One provenance link backing a suggestion. The URL is persisted and later
 * rendered as an admin-UI href, so it is length-bounded on top of the
 * http(s)-scheme check.
 */
export const videoSuggestionSourceSchema = z.object({
  url: httpUrlSchema.max(2048),
  label: z.string().max(200).optional(),
});

/** One reviewable fact the Lambda proposes for an artist (or the video). */
export const videoSuggestionSchema = z.object({
  field: z.enum(VIDEO_SUGGESTION_FIELDS),
  value: z.string().min(1).max(500),
  confidence: z.enum(SUGGESTION_CONFIDENCES),
  sources: z.array(videoSuggestionSourceSchema).max(10),
  note: z.string().max(500).optional(),
});
export type VideoSuggestion = z.infer<typeof videoSuggestionSchema>;

/**
 * A video-level suggestion — the fielded suggestion shape without its `field`
 * discriminator (the `video` object keys it by position instead). Backs the
 * release date and each discovered featured artist.
 */
const videoLevelSuggestionSchema = videoSuggestionSchema.omit({ field: true });

/**
 * A synthesized video description (2–4 sentences). Widens the base 500-char
 * value cap to 2000 — long-form prose, unlike the short fielded facts.
 */
const videoDescriptionSuggestionSchema = videoLevelSuggestionSchema.extend({
  value: z.string().min(1).max(2000),
});

/**
 * The successful payload the Lambda returns. Kept in lockstep with
 * `bio-generator/src/types.ts` `videoEnrichmentResultSchema` — validated at
 * the callback boundary so a malformed Lambda response is never trusted.
 */
export const videoEnrichmentDataSchema = z.object({
  artists: z
    .array(
      z.object({
        artistId: objectIdSchema,
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

/** Discriminated result envelope so the callback can branch cheaply. */
export const videoEnrichmentResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: videoEnrichmentDataSchema }),
  z.object({ ok: z.literal(false), error: z.string().max(2000) }),
]);
export type VideoEnrichmentResult = z.infer<typeof videoEnrichmentResultSchema>;

/**
 * Body the Lambda POSTs to the async completion callback route. The
 * server-minted job token is far shorter than 200 chars — the cap only
 * bounds hostile payloads.
 */
export const videoEnrichmentCallbackSchema = z.object({
  jobToken: z.string().min(1).max(200),
  result: videoEnrichmentResultSchema,
});
export type VideoEnrichmentCallback = z.infer<typeof videoEnrichmentCallbackSchema>;

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

/**
 * Body the Lambda POSTs to the progress route. `at` is accepted for forward
 * compatibility but IGNORED — the server stamps its own time on write (the
 * shared Lambda progress helper does not send it, mirroring the bio channel).
 */
export const videoEnrichmentProgressPostSchema = z.object({
  jobToken: z.string().min(1).max(200),
  stage: z.enum(VIDEO_PROGRESS_STAGES),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
  at: z.string().datetime().optional(),
});
export type VideoEnrichmentProgressPost = z.infer<typeof videoEnrichmentProgressPostSchema>;

/** Wire schema for GET /api/videos/[id]/enrichment — THE pinned status shape. */
export const videoEnrichmentStatusResponseSchema = z.object({
  status: z.enum(ENRICHMENT_STATUSES).nullable(),
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

export { STALE_JOB_MS } from './bio-generation-schema';
