/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { TourRepository } from '@/lib/repositories/tours/tour-repository';

export async function GET(_request: Request, { params }: { params: Promise<{ tourId: string }> }) {
  try {
    const { tourId } = await params;
    const tour = await TourRepository.findById(tourId);

    if (!tour) {
      return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
    }

    return NextResponse.json({ tour });
  } catch (error) {
    console.error('Failed to fetch tour:', error);
    return NextResponse.json({ error: 'Failed to fetch tour' }, { status: 500 });
  }
}
