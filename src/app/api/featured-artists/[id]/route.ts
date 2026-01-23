import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

/**
 * GET /api/featured-artists/[id]
 * Get a single featured artist by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await FeaturedArtistsService.getFeaturedArtistById(id);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('FeaturedArtist GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/featured-artists/[id]
 * Update a featured artist by ID
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = await FeaturedArtistsService.updateFeaturedArtist(id, body);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('FeaturedArtist PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/featured-artists/[id]
 * Delete a featured artist by ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await FeaturedArtistsService.hardDeleteFeaturedArtist(id);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: 'Featured artist deleted successfully' });
  } catch (error) {
    console.error('FeaturedArtist DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
