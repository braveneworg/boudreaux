/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VenueRepository } from '@/lib/repositories/tours/venue-repository';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * GET /api/venues/[venueId]
 * Returns the full venue record by ID.
 * Used by the VenueSelect edit dialog to populate all address fields.
 */
export const GET = withRateLimit<{ venueId: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (_request: NextRequest, { params }: { params: Promise<{ venueId: string }> }) => {
  try {
    const { venueId } = await params;

    if (!isValidObjectId(venueId)) {
      return NextResponse.json({ error: 'Invalid venue ID' }, { status: 400 });
    }

    const venue = await VenueRepository.findById(venueId);

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json(
      { venue },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch venue:', error);
    return NextResponse.json({ error: 'Failed to fetch venue' }, { status: 500 });
  }
});
