/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { after } from 'next/server';

import { VideoRepository } from '@/lib/repositories/video-repository';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { objectIdSchema } from '@/lib/validation/bio-generation-schema';
import {
  enrichmentIneligibilityReason,
  type EnrichmentIneligibilityReason,
  type EnrichmentStatus,
  type RunVideoEnrichmentActionResult,
} from '@/lib/validation/video-enrichment-schema';
import { blocksNewTrigger, toAsyncJobStatus } from '@/utils/async-job-lifecycle';
import { logSecurityEvent } from '@/utils/audit-log';

const logger = loggers.media;

/** Actionable copy per failing half of the eligibility rule. */
const ineligibleCopyFor = (reason: EnrichmentIneligibilityReason): string => {
  switch (reason) {
    case 'category':
      return 'Enrichment runs only on videos in the MUSIC category.';
    case 'artist':
      return 'Add an artist or creator and save before running enrichment.';
    default: {
      // Unreachable while every reason has a case above; a new reason added
      // to the union stops compiling here.
      const unhandled: never = reason;
      return unhandled;
    }
  }
};

/**
 * If an enrichment job blocks a new trigger ({@link blocksNewTrigger}:
 * genuinely in flight and not yet stale), return that status so the caller
 * echoes it instead of starting a duplicate run; otherwise null (mirrors
 * `resolveInFlightBioStatus`).
 */
const resolveInFlightEnrichmentStatus = (state: {
  enrichmentStatus: string | null;
  enrichmentStartedAt: Date | null;
}): EnrichmentStatus | null => {
  const status = toAsyncJobStatus(state.enrichmentStatus);

  if (blocksNewTrigger(status, state.enrichmentStartedAt)) {
    return status === 'processing' ? 'processing' : 'pending';
  }
  return null;
};

/**
 * The heavy probe → enrich flow, run via `after()` once the response is sent.
 * The probe is best-effort — a failure is logged and never blocks enrichment
 * (probe errors persist on the video row for the admin to see). The service
 * gates MUSIC-only and records its own terminal status; neither call throws.
 */
const runEnrichmentAfterResponse = async (videoId: string): Promise<void> => {
  try {
    await VideoProbeService.probeAndPersist(videoId);
  } catch (error) {
    logger.warn('video_probe_rerun_failed', { videoId, error: String(error) });
  }
  await VideoEnrichmentService.runEnrichmentJob(videoId);
};

/**
 * Triggers (or re-triggers) async probe + web enrichment for a video.
 * Admin-only. Marks the job `pending`, schedules the heavy work via `after()`,
 * and returns immediately; the admin page polls the enrichment endpoint. A
 * run already in flight (and not stale) is not duplicated, and a video whose
 * persisted artist is blank is refused before any status write.
 *
 * @param videoId - The video to probe and enrich.
 * @returns `{ success, status }` once accepted, or a typed error.
 */
export const runVideoEnrichmentAction = async (
  videoId: string
): Promise<RunVideoEnrichmentActionResult> => {
  const session = await requireRole('admin');

  const parsedId = objectIdSchema.safeParse(videoId);
  if (!parsedId.success) {
    return { success: false, error: 'Invalid video id.' };
  }

  try {
    const state = await VideoRepository.getEnrichmentState(videoId);
    if (!state) {
      return { success: false, error: 'Video not found.' };
    }

    // Eligibility gate — checked BEFORE any status write, so an ineligible
    // video can never be stranded at `pending` awaiting a dispatch that the
    // service would refuse.
    const ineligibleReason = enrichmentIneligibilityReason(state);
    if (ineligibleReason) {
      return { success: false, error: ineligibleCopyFor(ineligibleReason) };
    }

    // Don't start a second run while one is genuinely in flight.
    const inFlightStatus = resolveInFlightEnrichmentStatus(state);
    if (inFlightStatus) {
      return { success: true, status: inFlightStatus };
    }

    await VideoRepository.setEnrichmentStatus(videoId, 'pending');

    after(() => runEnrichmentAfterResponse(videoId));

    // Audit the accepted trigger — completion is out-of-band (Lambda callback).
    logSecurityEvent({
      event: 'media.video.updated',
      userId: session.user.id,
      metadata: { videoId, action: 'enrichment-triggered' },
    });

    return { success: true, status: 'pending' };
  } catch (error) {
    logger.error('Unexpected error triggering video enrichment', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Video enrichment failed to start. Please try again.' };
  }
};
