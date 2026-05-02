/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseService } from '@/lib/services/release-service';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { validateBody } from '@/lib/utils/validate-request';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { updateReleaseSchema } from '@/lib/validation/update-schemas';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Convert BigInt values to Number so NextResponse.json() can serialize them. */
function serializeRelease<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * GET /api/releases/[id]
 * Get a single release by ID.
 *
 * Query params:
 *   withTracks – When "true", returns the release with tracks via `getReleaseWithTracks()`.
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid release ID' }, { status: 400 });
    }

    const withTracks = request.nextUrl.searchParams.get('withTracks') === 'true';

    const result = withTracks
      ? await ReleaseService.getReleaseWithTracks(id)
      : await ReleaseService.getReleaseById(id);

    if (!result.success) {
      const status =
        result.error === 'Release not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    const responseData = withTracks
      ? attachStreamUrls(serializeRelease(result.data))
      : serializeRelease(result.data);

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Release GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * PATCH /api/releases/[id]
 * Partially update a release by ID
 */
export const PATCH = withAdmin(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const validation = validateBody(updateReleaseSchema, body);

      if (!validation.success) {
        return validation.response;
      }

      const result = await ReleaseService.updateRelease(
        id,
        validation.data as unknown as Prisma.ReleaseUpdateInput
      );

      if (!result.success) {
        const status =
          result.error === 'Release not found'
            ? 404
            : result.error === 'Release with this title already exists'
              ? 409
              : result.error === 'Database unavailable'
                ? 503
                : 500;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json(serializeRelease(result.data));
    } catch (error) {
      console.error('Release PATCH error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

/**
 * DELETE /api/releases/[id]
 * Delete a release by ID (hard delete)
 */
export const DELETE = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const result = await ReleaseService.deleteRelease(id);

      if (!result.success) {
        const status =
          result.error === 'Release not found'
            ? 404
            : result.error === 'Database unavailable'
              ? 503
              : 500;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({ message: 'Release deleted successfully' });
    } catch (error) {
      console.error('Release DELETE error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
