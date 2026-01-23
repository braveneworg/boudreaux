import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { extractFieldsWithValues } from '@/lib/utils/data-utils';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/featured-artists
 * Get all featured artists or search for featured artists
 * Query params: skip, take, search
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');

    const params = {
      ...(skip && { skip: parseInt(skip, 10) }),
      ...(take && { take: parseInt(take, 10) }),
      ...(search && { search }),
    };

    const result = await FeaturedArtistsService.getAllFeaturedArtists(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json({
      featuredArtists: result.data,
      count: result.data.length,
    });
  } catch (error) {
    console.error('FeaturedArtist GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/featured-artists
 * Create a new featured artist
 * Requires admin role
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await extractFieldsWithValues(request.json());

    const result = await FeaturedArtistsService.createFeaturedArtist(
      body as Prisma.FeaturedArtistCreateInput
    );

    if (!result.success) {
      const status = result.error === 'Database unavailable' ? 503 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('FeaturedArtist POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
