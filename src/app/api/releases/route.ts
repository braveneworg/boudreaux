/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { withAdmin } from '@/lib/decorators/with-auth';
import { ReleaseService } from '@/lib/services/release-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { validateBody } from '@/lib/utils/validate-request';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

/**
 * GET /api/releases
 * Get all releases or search for releases.
 *
 * Query params:
 *   listing    – When "published", returns public published releases via `getPublishedReleases()`.
 *   skip, take, search, artistIds, published – Pagination/filter params for admin listing mode.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const listing = searchParams.get('listing');

    if (listing === 'published') {
      const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
      const take = Math.min(
        Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
        MAX_TAKE
      );
      const search = searchParams.get('search') ?? undefined;

      const result = await ReleaseService.getPublishedReleases({ skip, take, search });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: result.error === 'Database unavailable' ? 503 : 500 }
        );
      }

      return NextResponse.json(
        { rows: result.data, nextSkip: computeNextSkip(result.data.length, skip, take) },
        {
          headers: {
            // Search/offset pages vary per request; do not share-cache them.
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const skipParam = searchParams.get('skip');
    const takeParam = searchParams.get('take');
    const search = searchParams.get('search');
    const artistIds = searchParams.getAll('artistIds');
    const published = searchParams.get('published');
    const deleted = searchParams.get('deleted') === 'true';

    const session = await auth();
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const skip = Math.max(0, parseInt(skipParam ?? '0', 10) || 0);
    const take = Math.min(
      Math.max(1, parseInt(takeParam ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
      MAX_TAKE
    );

    const params = {
      skip,
      take,
      ...(search && { search }),
      ...(artistIds.length > 0 && { artistIds }),
      ...(published !== null && { published: published === 'true' }),
      ...(deleted && { deleted }),
    };

    const result = await ReleaseService.getReleases(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json(
      {
        // The admin listing projection carries no BigInt fields (digital-format
        // files/URLs are not loaded), so the payload is JSON-safe as-is.
        rows: result.data,
        nextSkip: computeNextSkip(result.data.length, skip, take),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Release GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/releases
 * Create a new release (admin only)
 */
export const POST = withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const validation = validateBody(createReleaseSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await ReleaseService.createRelease(validation.data as Prisma.ReleaseCreateInput);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 400 }
      );
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Release POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
