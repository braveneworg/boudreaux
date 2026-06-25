/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { logSecurityEvent } from '@/utils/audit-log';

interface BioInFlightState {
  bioStatus: string | null;
  bioStartedAt: Date | null;
}

/**
 * If a bio job is genuinely in flight (status `pending`/`processing`) and not
 * yet stale, return the status to echo back to the caller so a duplicate run is
 * not started; otherwise return `null` to signal the caller may proceed.
 *
 * @param state - The artist's current bio status + start time.
 * @param staleMs - Age past which an in-flight job is treated as abandoned.
 */
export const resolveInFlightBioStatus = (
  state: BioInFlightState,
  staleMs: number
): 'pending' | 'processing' | null => {
  const inFlight = state.bioStatus === 'pending' || state.bioStatus === 'processing';
  const startedAt = state.bioStartedAt?.getTime() ?? 0;
  const isStale = Date.now() - startedAt > staleMs;

  if (inFlight && !isStale) {
    return state.bioStatus === 'processing' ? 'processing' : 'pending';
  }

  return null;
};

interface RunBioGenerationParams {
  artistId: string;
  userId: string;
  links?: string[];
  description?: string;
}

/**
 * The heavy read → generate → re-host → persist flow for an artist bio, run via
 * `after()` once the action response has been sent. `runGenerationJob` records
 * its own succeeded/failed status and never throws, so on success this only
 * audit-logs and revalidates the public artist pages; on failure it no-ops.
 *
 * Extracted verbatim from the prior inline `after()` callback to keep the
 * action's own branching small.
 */
export const runBioGenerationAfterResponse = async ({
  artistId,
  userId,
  links,
  description,
}: RunBioGenerationParams): Promise<void> => {
  const result = await BioGenerationService.runGenerationJob(artistId, { links, description });
  if (!result.success) {
    return;
  }

  logSecurityEvent({
    event: 'media.artist.updated',
    userId,
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
};
