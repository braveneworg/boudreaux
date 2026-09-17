/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ArtistService } from '@/lib/services/artist-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artists/[id]/bio-images
 * Admin-only. Returns the artist's bio image pool in picker order — display
 * images first, then the suggested images, then the rest — for the cover-art
 * picker on the release and featured-artist forms.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
      }

      const result = await ArtistService.listBioImages(id);
      if (!result.success) {
        const status = result.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json(result.data);
    } catch (error) {
      loggers.media.error('Artist bio images error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
