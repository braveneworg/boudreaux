/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VenueRepository } from '@/lib/repositories/tours/venue-repository';

/**
 * GET /api/venues
 * Returns a list of venues, optionally filtered by search term.
 * Used by the VenueSelect component in the admin tour date form.
 *
 * - No search term: returns the 5 most recently added venues.
 * - With search term: returns all venues matching the query.
 *
 * Query params:
 *   - search?: string — filter venues by name, address, or city
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') ?? undefined;

    const raw = search
      ? await VenueRepository.findAll({ search, limit: 50 })
      : await VenueRepository.findRecent(5);

    const venues = raw.map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city ?? null,
      state: venue.state ?? null,
      timeZone: venue.timeZone ?? null,
    }));

    return NextResponse.json(
      { venues },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch venues:', error);
    return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 });
  }
});
