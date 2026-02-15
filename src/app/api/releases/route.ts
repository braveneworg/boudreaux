/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ReleaseService } from '@/lib/services/release-service';
import { extractFieldsWithValues } from '@/lib/utils/data-utils';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases
 * Get all releases or search for releases
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

    const result = await ReleaseService.getReleases(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json({
      releases: result.data,
      count: result.data.length,
    });
  } catch (error) {
    console.error('Release GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/releases
 * Create a new release (admin only)
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await extractFieldsWithValues(request.json());

    if (!body.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!body.releasedOn) {
      return NextResponse.json({ error: 'Release date is required' }, { status: 400 });
    }

    if (!body.coverArt) {
      return NextResponse.json({ error: 'Cover art is required' }, { status: 400 });
    }

    const result = await ReleaseService.createRelease(body as Prisma.ReleaseCreateInput);

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
