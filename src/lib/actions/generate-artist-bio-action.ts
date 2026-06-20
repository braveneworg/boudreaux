/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  generateArtistBioInputSchema,
  type GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';
import { logSecurityEvent } from '@/utils/audit-log';

const logger = loggers.media;

/**
 * A job is considered stale (abandoned, e.g. the server restarted mid-run) once
 * it has been `pending`/`processing` longer than this, after which a new trigger
 * is allowed to supersede it. Kept above the Lambda's 10-minute timeout.
 */
const STALE_JOB_MS = 12 * 60 * 1000;

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
    const inFlight = state.bioStatus === 'pending' || state.bioStatus === 'processing';
    const startedAt = state.bioStartedAt?.getTime() ?? 0;
    const isStale = Date.now() - startedAt > STALE_JOB_MS;
    if (inFlight && !isStale) {
      return { success: true, status: state.bioStatus === 'processing' ? 'processing' : 'pending' };
    }

    await ArtistRepository.setBioStatus(artistId, 'pending', {
      error: null,
      startedAt: new Date(),
    });

    // Run the heavy work after the response is sent. `runGenerationJob` records
    // its own succeeded/failed status and never throws, so the only thing left
    // is to revalidate the public pages and audit-log on success.
    after(async () => {
      const result = await BioGenerationService.runGenerationJob(artistId, { links, description });
      if (!result.success) {
        return;
      }

      logSecurityEvent({
        event: 'media.artist.updated',
        userId: session.user.id,
        metadata: {
          artistId,
          action: 'bio-generated',
          model: result.data.model,
          imageCount: result.data.images.length,
          linkCount: result.data.links.length,
        },
      });

      revalidatePath('/admin/artists');
      revalidatePath('/artists');
      revalidatePath(`/artists/${result.slug}`);
      revalidatePath(`/artists/${result.slug}/bio`);
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
