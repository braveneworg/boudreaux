/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { TrackService } from '@/lib/services/track-service';
import { validateBody } from '@/lib/utils/validate-request';
import { createTrackSchema } from '@/lib/validation/create-track-schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracks
 * Get all tracks or search for tracks
 * Query params: skip, take, search, releaseId, artistIds (comma-separated)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');
    const releaseId = searchParams.get('releaseId');
    const artistIdsParam = searchParams.get('artistIds');
    const artistIds = artistIdsParam ? artistIdsParam.split(',').filter(Boolean) : undefined;

    const params = {
      ...(skip && { skip: parseInt(skip, 10) }),
      ...(take && { take: parseInt(take, 10) }),
      ...(search && { search }),
      ...(releaseId && { releaseId }),
      ...(artistIds && artistIds.length > 0 && { artistIds }),
    };

    const result = await TrackService.getTracks(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    // Get total count for pagination
    const totalCountResult = await TrackService.getTracksCount(
      search || undefined,
      releaseId || undefined,
      artistIds && artistIds.length > 0 ? artistIds : undefined
    );

    return NextResponse.json({
      tracks: result.data,
      count: result.data.length,
      totalCount: totalCountResult.success ? totalCountResult.data : result.data.length,
      hasMore: totalCountResult.success
        ? parseInt(skip || '0', 10) + result.data.length < totalCountResult.data
        : false,
    });
  } catch (error) {
    console.error('Track GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/tracks
 * Create a new track (admin only)
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const validation = validateBody(createTrackSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await TrackService.createTrack({
      title: validation.data.title,
      duration: validation.data.duration,
      audioUrl: validation.data.audioUrl,
      coverArt: validation.data.coverArt || undefined,
      position: validation.data.position,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 400 }
      );
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Track POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
