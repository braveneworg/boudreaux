/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { TourRepository, type TourWithRelations } from '@/lib/repositories/tours/tour-repository';
import { computeNextSkip, type PaginatedResponse } from '@/lib/types/pagination';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

/** Response shape for `GET /api/tours` — one skip/offset page of tours. */
export type ToursPageResponse = PaginatedResponse<TourWithRelations>;

/**
 * GET /api/tours
 * Returns a skip/offset page of tours with related data (venues, headliners,
 * artists, images), optionally filtered by a server-side `search` term.
 *
 * Query params: `skip` (default 0), `take` (default 24, clamped to 100),
 * `search`.
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
    const take = Math.min(
      Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
      MAX_TAKE
    );
    const search = searchParams.get('search') ?? undefined;

    const rows = await TourRepository.findAll({ skip, take, search });

    return NextResponse.json(
      { rows, nextSkip: computeNextSkip(rows.length, skip, take) } satisfies ToursPageResponse,
      {
        headers: {
          // Search/offset responses vary per request; do not share-cache them.
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Tours GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
