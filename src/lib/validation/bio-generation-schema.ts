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
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  alt: z.string().nullable().optional(),
});

export const bioGenerationLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  kind: z
    .enum(['wikipedia', 'official', 'musicbrainz', 'social', 'streaming', 'press', 'other'])
    .optional(),
});

/**
 * A link URL as persisted: absolute http(s) or a site-relative path
 * (injected release links use `/releases/<id>` paths).
 * Rejects `javascript:`, `data:`, and protocol-relative `//` URLs.
 * Also reused by the palette drag-payload schema (`bio-dnd-schema.ts`).
 */
export const bioStatusLinkUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => /^https?:\/\//.test(value) || (value.startsWith('/') && !value.startsWith('//')),
    { message: 'Must be an http(s) URL or a site-relative path' }
  );

/** Row provenance: AI-discovered (`generated`) or admin-authored (`custom`). */
export const bioOriginSchema = z.enum(['generated', 'custom']).nullable().optional();

/** Persisted bio image row as returned by the status endpoint (DB row id included). */
export const bioStatusImageSchema = bioGenerationImageSchema.extend({
  id: z.string(),
  attribution: z.string().nullable(),
  origin: bioOriginSchema,
});

/** Persisted bio link row as returned by the status endpoint (DB row id included). */
export const bioStatusLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: bioStatusLinkUrlSchema,
  kind: z
    .enum([
      'wikipedia',
      'official',
      'musicbrainz',
      'social',
      'streaming',
      'press',
      'release',
      'other',
    ])
    .nullable()
    .optional(),
  origin: bioOriginSchema,
});

/** Inferred type for a persisted bio image row (has DB id). */
export type BioStatusImage = z.infer<typeof bioStatusImageSchema>;

/** Inferred type for a persisted bio link row (has DB id). */
export type BioStatusLink = z.infer<typeof bioStatusLinkSchema>;

export const bioGenerationDataSchema = z.object({
  shortBio: z.string(),
  longBio: z.string(),
  altBio: z.string(),
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

/** Body the bio-generator Lambda POSTs to the async completion callback route. */
export const bioGenerationCallbackSchema = z.object({
  jobToken: z.string().min(1),
  result: bioGenerationResultSchema,
});

export type BioGenerationCallback = z.infer<typeof bioGenerationCallbackSchema>;

/**
 * Ordered generation stages the Lambda checkpoints through. This exact order is
 * the admin timeline's display order AND the Lambda's wire contract — keep the
 * two projects in lockstep (they cannot share a module).
 */
export const BIO_PROGRESS_STAGES = [
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

export type BioProgressStage = (typeof BIO_PROGRESS_STAGES)[number];

/**
 * A single generation progress checkpoint as persisted on the artist and served
 * by the status endpoint. `at` is a server-stamped ISO datetime; `counts` maps
 * arbitrary labels (e.g. `images`, `candidates`) to non-negative integers.
 */
export const bioProgressSchema = z.object({
  stage: z.enum(BIO_PROGRESS_STAGES),
  detail: z.string().max(300).optional(),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
  at: z.string().datetime(),
});

export type BioProgress = z.infer<typeof bioProgressSchema>;

/** The progress payload minus the server-stamped `at` — what a recorder supplies. */
export type BioProgressPayload = Omit<BioProgress, 'at'>;

/**
 * Body the bio-generator Lambda POSTs to the progress route. Carries the per-job
 * token (verified, never claimed) and the checkpoint fields; the server stamps
 * `at` on write, so it is intentionally absent here.
 */
export const bioProgressPostSchema = z.object({
  jobToken: z.string().min(1),
  stage: z.enum(BIO_PROGRESS_STAGES),
  detail: z.string().max(300).optional(),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
});

export type BioProgressPost = z.infer<typeof bioProgressPostSchema>;

/** Sanitized content the Server Action returns to the admin form for preview. */
export interface GeneratedBioContent {
  shortBio: string;
  longBio: string;
  altBio: string;
  genres: string | null;
  images: Array<{
    /** DB row id — present when content comes from the status endpoint; absent on the lambda path. */
    id?: string;
    url: string;
    thumbnailUrl?: string | null;
    title?: string | null;
    attribution?: string | null;
    license?: string | null;
    sourceUrl?: string | null;
    isPrimary: boolean;
    kind?: string | null;
    alt?: string | null;
    /** Provenance from the status endpoint (`generated`/`custom`); absent on the lambda path. */
    origin?: string | null;
  }>;
  links: Array<{
    /** DB row id — present when content comes from the status endpoint; absent on the lambda path. */
    id?: string;
    label: string;
    url: string;
    /** `null` when the lambda did not classify the link; absent when the link has no kind field. */
    kind?: string | null;
    /** Provenance from the status endpoint (`generated`/`custom`); absent on the lambda path. */
    origin?: string | null;
  }>;
  model: string;
}

/** Async bio-generation lifecycle states (null = never generated). */
export const BIO_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export type BioStatus = (typeof BIO_STATUSES)[number];

/** In-flight states — polling continues only while the job is one of these. */
export const isInFlightBioStatus = (status: BioStatus | null | undefined): boolean =>
  status === 'pending' || status === 'processing';

/**
 * A job is considered stale (abandoned — the server restarted mid-run, the
 * Lambda was killed at its 15-minute timeout, or the completion callback was
 * lost) once it has been `pending`/`processing` longer than this. Must exceed
 * the Lambda's 15-minute timeout so a healthy in-flight job is never treated as
 * dead. Used both to let a new trigger supersede an abandoned run and to resolve
 * the polling UI — the status read coerces a job older than this to `failed`.
 */
export const STALE_JOB_MS = 17 * 60 * 1000;

/**
 * Client-side poll deadline: how long the admin form keeps polling a triggered
 * run before giving up and surfacing a timeout. Must exceed {@link STALE_JOB_MS}
 * so the server's stale-job coercion (which flips the job to `failed`) resolves
 * the UI first in normal operation; this is the last-resort stop for when the
 * status endpoint never returns a terminal status at all (e.g. it is
 * unreachable and every poll fails).
 */
export const CLIENT_POLL_DEADLINE_MS = 20 * 60 * 1000;

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
  /**
   * Latest progress checkpoint. The service sets it on every read — the newest
   * checkpoint while the job is in flight, `null` once terminal. Optional so
   * existing consumers/fixtures need not construct it, mirroring the wire schema.
   */
  progress?: BioProgress | null;
}

/** Wire schema for the bio-generation status route, validated on the client. */
export const bioGenerationStatusResponseSchema = z.object({
  status: z.enum(BIO_STATUSES).nullable(),
  error: z.string().nullable(),
  content: z
    .object({
      shortBio: z.string(),
      longBio: z.string(),
      altBio: z.string(),
      genres: z.string().nullable(),
      images: z.array(bioStatusImageSchema),
      links: z.array(bioStatusLinkSchema),
      model: z.string(),
    })
    .nullable(),
  progress: bioProgressSchema.nullable().optional(),
});

/**
 * Client-side type of the parsed status payload. Unlike
 * {@link BioGenerationStatusResult} (the server-side shape, whose content rows
 * may lack ids on the lambda path), content rows here always carry their DB
 * row ids — the admin palettes need them for per-row deletes.
 */
export type BioGenerationStatusResponse = z.infer<typeof bioGenerationStatusResponseSchema>;
