/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import type { AssertExtends } from '@/lib/types/assert';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import { ASYNC_JOB_STATUSES, type AsyncJobStatus } from '@/utils/async-job-lifecycle';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

/** Shared 24-hex Mongo ObjectId schema, reused by sibling validation modules. */
export const objectIdSchema = objectId;

// z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
// scheme so a reference link can never become a script-bearing href.
const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');

/** Shared http(s)-only URL schema, reused by sibling validation modules. */
export const httpUrlSchema = httpUrl;

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
  licenseUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean(),
  kind: z.enum(['photo', 'cover']).nullable().optional(),
  alt: z.string().nullable().optional(),
  hasFace: z.boolean().nullable().optional(),
  faceScore: z.number().min(0).max(100).nullable().optional(),
});

/**
 * Content fields of the persisted bio-image row (`ArtistBioImageRecord`) that
 * the Lambda contract must carry — everything except DB bookkeeping (`id`,
 * `artistId`, `sortOrder`, `createdAt`), repository-stamped provenance
 * (`origin`), and the rehost-only `originalUrl`, none of which the Lambda
 * produces.
 */
type BioImageContentField = keyof Omit<
  ArtistBioImageRecord,
  'artistId' | 'createdAt' | 'id' | 'origin' | 'originalUrl' | 'sortOrder'
>;

// Coverage ties to the domain bio-image row. The runtime schemas here stay
// deliberately stricter than the media-models row mirror (URL formats, kind
// enum, 0-100 faceScore) because they validate the Lambda invoke boundary, so
// they cannot be derived from it — but a field added to the domain row (as
// hasFace/faceScore once were, by hand, in two places) fails typecheck here
// until the wire schemas carry it too.
type _BioImageContentCoverage = AssertExtends<
  BioImageContentField,
  keyof z.infer<typeof bioGenerationImageSchema>
>;
const _bioImageContentCoverage: _BioImageContentCoverage = true;

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

// Same coverage tie for the status wire, which additionally carries the DB row
// `id` and `origin` (still no `artistId`/`sortOrder`/`createdAt`/`originalUrl`).
type _BioStatusImageCoverage = AssertExtends<
  BioImageContentField | 'id' | 'origin',
  keyof z.infer<typeof bioStatusImageSchema>
>;
const _bioStatusImageCoverage: _BioStatusImageCoverage = true;

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
    licenseUrl?: string | null;
    sourceUrl?: string | null;
    isPrimary: boolean;
    kind?: string | null;
    alt?: string | null;
    /** Rekognition face signal; `null`/absent when the image was not analyzed. */
    hasFace?: boolean | null;
    /** Rekognition face-match confidence 0–100; `null`/absent when not analyzed. */
    faceScore?: number | null;
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

/**
 * Async bio-generation lifecycle states (null = never generated) — the shared
 * async-job lifecycle. Decisions (gates, staleness, the client deadline) live
 * in `@/utils/async-job-lifecycle`; this module keeps only the wire shapes.
 */
export type BioStatus = AsyncJobStatus;

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
  status: z.enum(ASYNC_JOB_STATUSES).nullable(),
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
