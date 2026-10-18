/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { after } from 'next/server';

import { gateAction } from '@/lib/auth/action-gate';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import {
  VideoEnrichmentService,
  videoEnrichmentJob,
} from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { loggers } from '@/lib/utils/logger';
import { objectIdSchema } from '@/lib/validation/bio-generation-schema';
import type { RunVideoEnrichmentActionResult } from '@/lib/validation/video-enrichment-schema';
import { logSecurityEvent } from '@/utils/audit-log';

const logger = loggers.media;

/**
 * The heavy probe → enrich flow, run via `after()` once the response is sent.
 * The probe is best-effort — a failure is logged and never blocks enrichment
 * (probe errors persist on the video row for the admin to see). The service
 * re-checks eligibility (a named artist, any category) and records its own
 * terminal status; neither call throws.
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  const parsedId = objectIdSchema.safeParse(videoId);
  if (!parsedId.success) {
    return { success: false, error: 'Invalid video id.', code: 'INVALID_INPUT' };
  }

  try {
    // The job runner refuses a missing or ineligible video before any status
    // write, and echoes a run genuinely in flight instead of starting another.
    const triggered = await jobRunner.trigger(videoEnrichmentJob, videoId);
    if (!triggered.success) {
      return { success: false, error: triggered.error, code: triggered.code };
    }
    if (!triggered.data.started) {
      return { success: true, status: triggered.data.status };
    }

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
    return {
      success: false,
      error: 'Video enrichment failed to start. Please try again.',
      code: 'UNKNOWN',
    };
  }
};
