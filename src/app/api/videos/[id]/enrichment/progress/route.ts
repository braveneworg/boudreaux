/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  VIDEO_ENRICHMENT_PROGRESS_LIMIT,
  videoEnrichmentProgressLimiter,
} from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { loggers } from '@/lib/utils/logger';
import { videoEnrichmentProgressPostSchema } from '@/lib/validation/video-enrichment-schema';

export const dynamic = 'force-dynamic';

// A checkpoint is a stage + a small counts map — kilobytes at most.
const MAX_BODY_BYTES = 4 * 1024;

/**
 * POST /api/videos/[id]/enrichment/progress
 * The out-of-band channel the bio-generator Lambda POSTs per-stage
 * video-enrichment checkpoints to. Mirrors the completion callback route,
 * with one crucial difference: it VERIFIES the per-job token but NEVER
 * claims it (claiming stays exclusive to the callback), so a stream of
 * progress POSTs can never consume the single-use token. Only an oversized
 * body is rejected (413); every other rejection — malformed JSON, schema
 * failure, bad token, non-processing status — answers 202 with no write
 * (anti-enumeration parity with the callback route).
 */
export const POST = withRateLimit<{ id: string }>(
  videoEnrichmentProgressLimiter,
  VIDEO_ENRICHMENT_PROGRESS_LIMIT
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
    // Silently accept — never reveal a parse failure (anti-enumeration).
    return new NextResponse(null, { status: 202 });
  }

  const parsed = videoEnrichmentProgressPostSchema.safeParse(json);
  if (parsed.success) {
    const { jobToken, stage, counts } = parsed.data;
    // recordProgress verifies the token and no-ops on any gate failure; it
    // never throws, never claims the job, and stamps `at` server-side.
    await VideoEnrichmentService.recordProgress(id, jobToken, {
      stage,
      ...(counts ? { counts } : {}),
    });
  } else {
    // Log the Zod issue summary (code + path + message only — never the raw
    // body) so drifted Lambda payloads surface without leaking input data.
    loggers.media.warn('video_enrichment_progress_schema_rejected', {
      issues: parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })),
    });
  }

  // Always 202 — never reveal whether the checkpoint was recorded.
  return new NextResponse(null, { status: 202 });
});
