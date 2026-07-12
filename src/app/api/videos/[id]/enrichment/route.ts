/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/[id]/enrichment
 * Admin-only. Returns the async enrichment status for a video — lifecycle,
 * latest progress checkpoint, fresh artist current values, and all suggestion
 * rows. The admin edit page polls this on its own query key (never
 * `videos.detail`, which would reset the edit form).
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const status = await VideoEnrichmentService.getEnrichmentStatus(id);
      if (!status) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      return NextResponse.json(status);
    } catch (error) {
      loggers.media.error('Video enrichment status error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
