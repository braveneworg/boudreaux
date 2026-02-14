import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { TrackService } from '@/lib/services/track-service';
import { extractFieldsWithValues } from '@/lib/utils/data-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracks
 * Get all tracks or search for tracks
 * Query params: skip, take, search, releaseId
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');
    const releaseId = searchParams.get('releaseId');

    const params = {
      ...(skip && { skip: parseInt(skip, 10) }),
      ...(take && { take: parseInt(take, 10) }),
      ...(search && { search }),
      ...(releaseId && { releaseId }),
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
      releaseId || undefined
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
    const body = await extractFieldsWithValues(request.json());

    if (!body.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (body.duration === undefined || body.duration === null) {
      return NextResponse.json({ error: 'Duration is required' }, { status: 400 });
    }

    if (!body.audioUrl) {
      return NextResponse.json({ error: 'Audio URL is required' }, { status: 400 });
    }

    const result = await TrackService.createTrack({
      title: body.title as string,
      duration: body.duration as number,
      audioUrl: body.audioUrl as string,
      coverArt: (body.coverArt as string) || undefined,
      position: (body.position as number) || 0,
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
