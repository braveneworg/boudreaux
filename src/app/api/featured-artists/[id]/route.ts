/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * GET /api/featured-artists/[id]
 * Admin-only. The full featured artist the edit form loads: every connected
 * artist whatever its publication state, and the row itself whether or not it
 * is published. It names hidden artists, so it is never public and never
 * shared-cached (ADR-0015). The public reads the active listing instead.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid featured artist ID' }, { status: 400 });
      }

      const result = await FeaturedArtistsService.getFeaturedArtistById(id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(serializeForResponse(result.data), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      loggers.media.error('FeaturedArtist GET by ID error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

/**
 * DELETE /api/featured-artists/[id]
 * Delete a featured artist by ID
 */
export const DELETE = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist(id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json({ message: 'Featured artist deleted successfully' });
    } catch (error) {
      loggers.media.error('FeaturedArtist DELETE error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
