/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  VIDEO_ENRICHMENT_CALLBACK_LIMIT,
  videoEnrichmentCallbackLimiter,
} from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { videoEnrichmentCallbackSchema } from '@/lib/validation/video-enrichment-schema';

export const dynamic = 'force-dynamic';

// Suggestions are small rows (≤10 artists × ≤12 facts), but keep parity with
// the bio callback cap so a drifted Lambda payload is rejected, not truncated.
const MAX_BODY_BYTES = 512 * 1024;

/**
 * POST /api/videos/[id]/enrichment/callback
 * The out-of-band completion endpoint the bio-generator Lambda POSTs its
 * video-enrichment result to. Verifies the single-use job token, then runs
 * the suggestion persistence post-response via `after()`. Always answers 202
 * — never revealing whether the token matched — so the endpoint cannot be
 * used to enumerate jobs. No cache revalidation: the admin page polls the
 * enrichment query key, and touching `videos.detail` would reset the form.
 */
export const POST = withRateLimit<{ id: string }>(
  videoEnrichmentCallbackLimiter,
  VIDEO_ENRICHMENT_CALLBACK_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = videoEnrichmentCallbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  }

  const claimed = await VideoEnrichmentService.verifyAndClaimCallback(id, parsed.data.jobToken);
  if (claimed) {
    // Suggestion filtering/persistence runs post-response; the admin poll
    // surfaces completion.
    after(async () => {
      await VideoEnrichmentService.completeCallback(id, parsed.data.result);
    });
  }

  // Always 202 — never reveal whether the token matched (anti-enumeration).
  return new NextResponse(null, { status: 202 });
});
