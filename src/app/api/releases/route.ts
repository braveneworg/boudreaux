/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ReleaseService } from '@/lib/services/release-service';
import { validateBody } from '@/lib/utils/validate-request';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';

import { auth } from '../../../../auth';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

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
      const result = await ReleaseService.getPublishedReleases();

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: result.error === 'Database unavailable' ? 503 : 500 }
        );
      }

      return NextResponse.json(
        { releases: result.data, count: result.data.length },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      );
    }

    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');
    const artistIds = searchParams.getAll('artistIds');
    const published = searchParams.get('published');

    const session = await auth();
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const MAX_TAKE = 100;
    const params = {
      ...(skip && { skip: Math.max(0, parseInt(skip, 10)) }),
      ...(take && { take: Math.min(Math.max(1, parseInt(take, 10)), MAX_TAKE) }),
      ...(search && { search }),
      ...(artistIds.length > 0 && { artistIds }),
      ...(published !== null && { published: published === 'true' }),
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
        releases: result.data,
        count: result.data.length,
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
