/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';
import { loggers } from '@/lib/utils/logger';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

type TourRouteContext = { params: Promise<{ tourId: string }> };

/**
 * The admin read (`?scope=admin`): the tour with every date and headliner,
 * whatever the artists' state, for the tour's edit form. Admin only and never
 * shared-cached, because it names hidden artists (ADR-0015).
 */
const getAdminTour = withAdmin(async (_request: NextRequest, { params }: TourRouteContext) => {
  const { tourId } = await params;
  const tour = await TourRepository.findById(tourId);

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  return NextResponse.json({ tour }, { headers: { 'Cache-Control': 'private, no-store' } });
});

/** The public read: the tour with only the dates and headliners the public may see. */
const getPublicTour = async (tourId: string): Promise<NextResponse> => {
  const tour = await TourRepository.findPublicById(tourId);

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  return NextResponse.json(
    { tour },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
};

/**
 * GET /api/tours/[tourId]
 * The tour as the public may see it. A tour whose dates are all hidden reads
 * as not found. `?scope=admin` returns the unfiltered tour to an admin; the
 * two are different URLs so a shared cache never serves one for the other.
 */
export const GET = withRateLimit<{ tourId: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest, context: TourRouteContext) => {
  try {
    const { tourId } = await context.params;
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return NextResponse.json({ error: 'Invalid tour ID' }, { status: 400 });
    }

    return request.nextUrl.searchParams.get('scope') === 'admin'
      ? await getAdminTour(request, context)
      : await getPublicTour(tourId);
  } catch (error) {
    loggers.media.error('Failed to fetch tour', error);
    return NextResponse.json({ error: 'Failed to fetch tour' }, { status: 500 });
  }
});
