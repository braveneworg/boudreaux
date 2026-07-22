/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Whether `value` is a well-formed absolute http(s) URL. Uses the URL parser
 * (not a prefix regex) so it rejects schemes like `javascript:`/`data:` and
 * requires a host. The shared contract carries the STRICTER of the web/Lambda
 * validators (never the looser) so the boundary check can't silently weaken.
 */
const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol, host } = new URL(value.trim());
    return host.length > 0 && (protocol === 'http:' || protocol === 'https:');
  } catch {
    return false;
  }
};

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Ordered enrichment stages the video-enrichment Lambda checkpoints through.
 * The array order is also the admin timeline's display order.
 */
export const VIDEO_PROGRESS_STAGES = [
  'musicbrainz',
  'wikidata',
  'web-search',
  'adjudicating',
  'finalizing',
] as const;

export type VideoProgressStage = (typeof VIDEO_PROGRESS_STAGES)[number];

/** Fielded suggestion targets (artist-level and video-level). */
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

/** Video-level suggestion fields (persisted with `artistId: null`). */
export const VIDEO_LEVEL_SUGGESTION_FIELDS = [
  'releasedOn',
  'description',
  'featuredArtist',
] as const;

export type VideoLevelSuggestionField = (typeof VIDEO_LEVEL_SUGGESTION_FIELDS)[number];

/** Confidence rubric for a suggestion. */
export const SUGGESTION_CONFIDENCES = ['high', 'medium', 'low'] as const;

export type SuggestionConfidence = (typeof SUGGESTION_CONFIDENCES)[number];

/** Identity fields the web app already holds for a linked artist. */
export const videoKnownIdentitySchema = z.object({
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  surname: z.string().optional(),
  displayName: z.string().optional(),
  akaNames: z.string().optional(),
  bornOn: isoDate.optional(),
});

/** Invoke event the web app sends to the video-enrichment Lambda. */
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
 * One provenance link backing a suggestion. The URL is persisted and later
 * rendered as an admin-UI href, so it is length-bounded on top of the strict
 * http(s)-scheme check (rejects `javascript:` etc — never rendered raw).
 */
export const videoSuggestionSourceSchema = z.object({
  url: httpUrl.max(2048),
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

/** A video-level suggestion — the fielded shape without its `field` discriminator. */
const videoLevelSuggestionSchema = videoSuggestionSchema.omit({ field: true });

/** A synthesized video description (2–4 sentences) — widens the value cap to 2000. */
const videoDescriptionSuggestionSchema = videoLevelSuggestionSchema.extend({
  value: z.string().min(1).max(2000),
});

/** The successful video-enrichment payload the Lambda returns. */
export const videoEnrichmentDataSchema = z.object({
  artists: z
    .array(
      z.object({
        artistId: objectId,
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

/** Body the Lambda POSTs to the async completion callback route. */
export const videoEnrichmentCallbackSchema = z.object({
  jobToken: z.string().min(1).max(200),
  result: videoEnrichmentResultSchema,
});

export type VideoEnrichmentCallback = z.infer<typeof videoEnrichmentCallbackSchema>;

/**
 * Body the Lambda POSTs to the progress route. `at` is accepted for forward
 * compatibility but IGNORED — the server stamps its own time on write.
 */
export const videoEnrichmentProgressPostSchema = z.object({
  jobToken: z.string().min(1).max(200),
  stage: z.enum(VIDEO_PROGRESS_STAGES),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
  at: z.string().datetime().optional(),
});

export type VideoEnrichmentProgressPost = z.infer<typeof videoEnrichmentProgressPostSchema>;
