import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { TrackService } from '@/lib/services/track-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracks/[id]
 * Get a single track by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await TrackService.getTrackById(id);

    if (!result.success) {
      const status =
        result.error === 'Track not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Track GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/tracks/[id]
 * Partially update a track by ID
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = await TrackService.updateTrack(id, body);

    if (!result.success) {
      const status =
        result.error === 'Track not found'
          ? 404
          : result.error === 'Track with this title already exists'
            ? 409
            : result.error === 'Database unavailable'
              ? 503
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Track PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/tracks/[id]
 * Delete a track by ID (hard delete)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await TrackService.deleteTrack(id);

    if (!result.success) {
      const status =
        result.error === 'Track not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: 'Track deleted successfully' });
  } catch (error) {
    console.error('Track DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
