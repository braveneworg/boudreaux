/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { VenueRepository } from '@/lib/repositories/tours/venue-repository';

/**
 * GET /api/venues/[venueId]
 * Returns the full venue record by ID.
 * Used by the VenueSelect edit dialog to populate all address fields.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;
    const venue = await VenueRepository.findById(venueId);

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({ venue });
  } catch (error) {
    console.error('Failed to fetch venue:', error);
    return NextResponse.json({ error: 'Failed to fetch venue' }, { status: 500 });
  }
}
