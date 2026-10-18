/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  VIDEO_ENRICHMENT_PROGRESS_LIMIT,
  videoEnrichmentProgressLimiter,
} from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { videoEnrichmentJob } from '@/lib/services/video-enrichment-service';
import { videoEnrichmentProgressPostSchema } from '@/lib/validation/video-enrichment-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/[id]/enrichment/progress
 * The out-of-band channel the bio-generator Lambda POSTs per-stage
 * video-enrichment checkpoints to. It verifies the per-job token but never
 * claims it.
 */
export const POST = signedCallbackRoute({
  job: videoEnrichmentJob,
  channel: 'progress',
  // A checkpoint is a stage + a small counts map — kilobytes at most.
  maxBodyBytes: 4 * 1024,
  schema: videoEnrichmentProgressPostSchema,
  limiter: videoEnrichmentProgressLimiter,
  limit: VIDEO_ENRICHMENT_PROGRESS_LIMIT,
});
