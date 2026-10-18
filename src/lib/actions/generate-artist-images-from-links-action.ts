/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { after } from 'next/server';

import { gateAction } from '@/lib/auth/action-gate';
import { imageLinksJob } from '@/lib/services/image-links-service';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import { loggers } from '@/lib/utils/logger';
import {
  generateImagesFromLinksInputSchema,
  type GenerateImagesFromLinksActionResult,
} from '@/lib/validation/image-links-schema';
import { logSecurityEvent } from '@/utils/audit-log';

/**
 * Triggers an images-from-links job for an artist. Admin-only. Reading a few
 * pages, face-scoring and re-hosting takes a while, so this does not block:
 * it marks the job `pending`, schedules the dispatch via Next.js `after()`, and
 * returns immediately; the client polls `/api/artists/[id]/image-links`. A run
 * already in flight (and not stale) is not duplicated.
 *
 * @param input - `{ artistId }`.
 * @returns `{ success, status }` once the job is accepted, or a typed error.
 */
export const generateArtistImagesFromLinksAction = async (
  input: unknown
): Promise<GenerateImagesFromLinksActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  const parsed = generateImagesFromLinksInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid image generation request.' };
  }
  const { artistId } = parsed.data;

  try {
    // The job runner refuses a missing artist and echoes a run genuinely in
    // flight instead of starting a second one.
    const triggered = await jobRunner.trigger(imageLinksJob, artistId);
    if (!triggered.success) {
      return { success: false, error: triggered.error };
    }
    if (!triggered.data.started) {
      return { success: true, status: triggered.data.status };
    }

    // The run records its own failed status and never throws; the callback
    // route finishes the job and revalidates the artist pages.
    after(() => jobRunner.run(imageLinksJob, artistId, undefined));

    logSecurityEvent({
      event: 'media.artist.updated',
      userId: session.user.id,
      metadata: { artistId, action: 'images-from-links-triggered' },
    });

    return { success: true, status: 'pending' };
  } catch (error) {
    loggers.media.error('Unexpected error triggering images from links', {
      artistId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Image generation failed to start. Please try again.' };
  }
};
