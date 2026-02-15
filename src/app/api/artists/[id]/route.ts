/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artist/[id]
 * Get a single artist by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await ArtistService.getArtistById(id);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Artist GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/artist/[id]
 * Update an artist by ID
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = await ArtistService.updateArtist(id, body);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Artist with this slug already exists'
            ? 409
            : result.error === 'Database unavailable'
              ? 503
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Artist PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/artist/[id]
 * Partially update an artist by ID
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = await ArtistService.updateArtist(id, body);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Artist with this slug already exists'
            ? 409
            : result.error === 'Database unavailable'
              ? 503
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Artist PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/artist/[id]
 * Delete an artist by ID (hard delete)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await ArtistService.deleteArtist(id);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: 'Artist deleted successfully', data: result.data });
  } catch (error) {
    console.error('Artist DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
