/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { VideoService } from '@/lib/services/video-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { toAdminVideoDetailRow } from '@/lib/utils/to-public-video-row';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/** Signed URLs are per-user; never share-cache the payload. */
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

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
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    // The canonical detail stripper drops only the always-internal secret fields
    // (raw probe JSON, the per-job callback token, the progress checkpoint) and
    // attaches the signed stream URL — the admin edit page reads the normalized
    // probe columns here and polls job state via the enrichment endpoint instead.
    const payload = serializeForResponse(toAdminVideoDetailRow(result.data));

    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    loggers.media.error('Video detail GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
