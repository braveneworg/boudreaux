/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Ordered generation stages the bio-generator Lambda checkpoints through as it
 * works, POSTed best-effort to the web app's progress endpoint so the admin
 * timeline can show live status.
 *
 * This list AND its order are the wire contract: the array order is also the
 * admin timeline's display order. Defined once here and consumed by BOTH the
 * web app (`src/lib/validation/bio-generation-schema.ts` re-exports it) and the
 * Lambda (`bio-generator/src/types.ts` re-exports it as `PROGRESS_STAGES`), so
 * the two can no longer drift.
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

/** A single generation checkpoint stage name (see {@link BIO_PROGRESS_STAGES}). */
export type BioProgressStage = (typeof BIO_PROGRESS_STAGES)[number];

/**
 * Body the bio-generator Lambda POSTs to the web progress route. Carries the
 * per-job token (verified, never claimed) and the checkpoint fields; the server
 * stamps `at` on write, so it is intentionally absent here.
 */
export const bioProgressPostSchema = z.object({
  jobToken: z.string().min(1),
  stage: z.enum(BIO_PROGRESS_STAGES),
  detail: z.string().max(300).optional(),
  counts: z.record(z.string(), z.number().int().min(0)).optional(),
});

export type BioProgressPost = z.infer<typeof bioProgressPostSchema>;
