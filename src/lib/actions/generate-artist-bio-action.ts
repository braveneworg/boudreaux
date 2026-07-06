/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { after } from 'next/server';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  generateArtistBioInputSchema,
  STALE_JOB_MS,
  type GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';
import { logSecurityEvent } from '@/utils/audit-log';

import {
  resolveInFlightBioStatus,
  runBioGenerationAfterResponse,
} from './generate-artist-bio-action-helpers';

const logger = loggers.media;

/**
 * Triggers (or re-triggers) async generation of an artist's bio. Admin-only.
 *
 * Generation can take minutes, so this no longer blocks: it marks the job
 * `pending`, schedules the heavy read → generate → re-host → persist flow via
 * Next.js `after()` (which runs after the response on our long-lived server),
 * and returns immediately. The client polls the status endpoint for completion.
 * A run already in flight (and not stale) is not duplicated.
 *
 * @param input - `{ artistId, links?, description? }`.
 * @returns `{ success, status }` once the job is accepted, or a typed error.
 */
export const generateArtistBioAction = async (
  input: unknown
): Promise<GenerateArtistBioActionResult> => {
  const session = await requireRole('admin');

  const parsed = generateArtistBioInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid bio generation request.' };
  }

  const { artistId, links, description } = parsed.data;

  try {
    const state = await ArtistRepository.getBioGenerationState(artistId);
    if (!state) {
      return { success: false, error: 'Artist not found.' };
    }

    // Don't start a second run while one is genuinely in flight.
    const inFlightStatus = resolveInFlightBioStatus(state, STALE_JOB_MS);
    if (inFlightStatus) {
      return { success: true, status: inFlightStatus };
    }

    await ArtistRepository.setBioStatus(artistId, 'pending', {
      error: null,
      startedAt: new Date(),
    });

    // Run the heavy work after the response is sent. `runGenerationJob` records
    // its own succeeded/failed status and never throws; the after-response helper
    // only revalidates the public pages once a completed outcome finishes.
    after(() =>
      runBioGenerationAfterResponse({
        artistId,
        links,
        description,
      })
    );

    // Audit the accepted trigger here — under async the job returns after DISPATCH,
    // so completion is not observable in-process; the trigger is what we can log.
    logSecurityEvent({
      event: 'media.artist.updated',
      userId: session.user.id,
      metadata: { artistId, action: 'bio-generation-triggered' },
    });

    return { success: true, status: 'pending' };
  } catch (error) {
    logger.error('Unexpected error triggering artist bio generation', {
      artistId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Bio generation failed to start. Please try again.' };
  }
};
