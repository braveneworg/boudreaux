/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { VideoService } from '@/lib/services/video-service';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/** Signed URLs are per-user; never share-cache the payload. */
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/** Map a detail-route service error to its HTTP status. */
const errorStatus = (error: string): number => {
  if (error === 'Video not found') return 404;
  if (error === 'Database unavailable') return 503;
  return 500;
};

/**
 * GET /api/videos/[id]
 *
 * Admin-only single video fetch feeding the admin edit form. Attaches a signed
 * stream URL and BigInt-serializes the payload before responding.
 */
export const GET = withAdmin<{ id: string }>(async (_request, context) => {
  try {
    const { id } = await context.params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const result = await VideoService.getVideoById(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
    }

    const video = serializeForResponse({
      ...result.data,
      streamUrl: signStreamUrl(result.data.s3Key),
    });

    return NextResponse.json(video, { headers: CACHE_HEADERS });
  } catch (error) {
    loggers.media.error('Video detail GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
