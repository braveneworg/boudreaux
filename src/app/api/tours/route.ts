/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tours
 * Returns all tours with related data (venues, headliners, artists, images).
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async () => {
  try {
    const tours = await TourRepository.findAll({ limit: 100 });

    return NextResponse.json(
      { tours, count: tours.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('Tours GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
