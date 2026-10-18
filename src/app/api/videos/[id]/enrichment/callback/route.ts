/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  VIDEO_ENRICHMENT_CALLBACK_LIMIT,
  videoEnrichmentCallbackLimiter,
} from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { videoEnrichmentJob } from '@/lib/services/video-enrichment-service';
import { videoEnrichmentCallbackSchema } from '@/lib/validation/video-enrichment-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/[id]/enrichment/callback
 * The out-of-band completion endpoint the bio-generator Lambda POSTs its
 * video-enrichment result to. A won claim persists the suggestions
 * post-response. No cache revalidation: the admin page polls the enrichment
 * query key, and touching `videos.detail` would reset the form.
 */
export const POST = signedCallbackRoute({
  job: videoEnrichmentJob,
  channel: 'callback',
  // Suggestions are small rows (≤10 artists × ≤12 facts), but keep parity with
  // the bio callback cap so a drifted Lambda payload is rejected, not truncated.
  maxBodyBytes: 512 * 1024,
  schema: videoEnrichmentCallbackSchema,
  limiter: videoEnrichmentCallbackLimiter,
  limit: VIDEO_ENRICHMENT_CALLBACK_LIMIT,
});
