/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ImageLinksService } from '@/lib/services/image-links-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artists/[id]/image-links
 * Admin-only. Returns the artist's image-source links plus the async
 * images-from-links job status (and the last run's added-image count). The
 * client polls this while a job runs.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const status = await ImageLinksService.getStatus(id);
      if (!status) {
        return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
      }

      return NextResponse.json(status);
    } catch (error) {
      loggers.media.error('Image links status error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
