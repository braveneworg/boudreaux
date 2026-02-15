/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/artist/[id]/archive
 * Archive an artist (soft delete)
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await ArtistService.archiveArtist(id);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: 'Artist archived successfully', data: result.data });
  } catch (error) {
    console.error('Artist archive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
