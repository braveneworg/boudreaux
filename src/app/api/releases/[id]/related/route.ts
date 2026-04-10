/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/related?artistId=...
 * Returns other published releases by the same artist, excluding the current release.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artistId = request.nextUrl.searchParams.get('artistId');

    if (!artistId) {
      return NextResponse.json({ releases: [] });
    }

    const result = await ReleaseService.getArtistOtherReleases(artistId, id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json({ releases: result.data });
  } catch (error) {
    console.error('Related releases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
