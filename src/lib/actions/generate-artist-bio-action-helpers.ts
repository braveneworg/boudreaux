/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { isStaleJob } from '@/lib/utils/job-staleness';
import { isInFlightBioStatus, type BioStatus } from '@/lib/validation/bio-generation-schema';

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
  const inFlight = isInFlightBioStatus(state.bioStatus as BioStatus | null);

  if (inFlight && !isStaleJob(state.bioStartedAt, staleMs)) {
    return state.bioStatus === 'processing' ? 'processing' : 'pending';
  }

  return null;
};

/**
 * Revalidate the four Next.js cache paths a bio change affects: the admin and
 * public artist lists, plus the artist's detail and bio pages. Shared by the
 * synchronous fake path here and the async Lambda callback route (Task B7/B8),
 * so both completion paths invalidate the same set of pages.
 *
 * @param slug - The artist slug whose detail/bio pages should be revalidated.
 */
export const revalidateArtistBioPaths = (slug: string): void => {
  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath(`/artists/${slug}`);
  revalidatePath(`/artists/${slug}/bio`);
};

interface RunBioGenerationParams {
  artistId: string;
  links?: string[];
  description?: string;
}

/**
 * The heavy read → generate → re-host → persist flow for an artist bio, run via
 * `after()` once the action response has been sent. `runGenerationJob` records
 * its own succeeded/failed status and never throws.
 *
 * Nothing is revalidated here: every run now dispatches across the seam and is
 * finished — and revalidated — by the completion callback route, on both the
 * real and local adapters. The accepted trigger is audit-logged by the action.
 */
export const runBioGenerationAfterResponse = async ({
  artistId,
  links,
  description,
}: RunBioGenerationParams): Promise<void> => {
  await BioGenerationService.runGenerationJob(artistId, { links, description });
};
