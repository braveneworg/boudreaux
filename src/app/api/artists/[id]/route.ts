/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';
import type { UpdateArtistData } from '@/lib/types/domain/artist';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { validateBody } from '@/lib/utils/validate-request';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { updateArtistSchema } from '@/lib/validation/update-schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artist/[id]
 * Get a single artist by ID
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
    }

    const result = await ArtistService.getArtistById(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(result.data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    loggers.media.error('Artist GET by ID error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * PUT /api/artist/[id]
 * Update an artist by ID
 */
export const PUT = withAdmin(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const validation = validateBody(updateArtistSchema, body);

      if (!validation.success) {
        return validation.response;
      }

      const result = await ArtistService.updateArtist(
        id,
        validation.data as unknown as UpdateArtistData
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(result.data);
    } catch (error) {
      loggers.media.error('Artist PUT error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

/**
 * PATCH /api/artist/[id]
 * Partially update an artist by ID
 */
export const PATCH = withAdmin(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const validation = validateBody(updateArtistSchema, body);

      if (!validation.success) {
        return validation.response;
      }

      const result = await ArtistService.updateArtist(
        id,
        validation.data as unknown as UpdateArtistData
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(result.data);
    } catch (error) {
      loggers.media.error('Artist PATCH error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

/**
 * DELETE /api/artist/[id]
 * Delete an artist by ID (hard delete)
 */
export const DELETE = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const result = await ArtistService.deleteArtist(id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json({ message: 'Artist deleted successfully', data: result.data });
    } catch (error) {
      loggers.media.error('Artist DELETE error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
