/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

export async function GET(_request: Request, { params }: { params: Promise<{ tourId: string }> }) {
  try {
    const { tourId } = await params;

    if (!OBJECT_ID_REGEX.test(tourId)) {
      return NextResponse.json({ tourDates: [] });
    }

    const tourDates = await TourDateRepository.findByTourId(tourId);

    return NextResponse.json({ tourDates });
  } catch (error) {
    console.error('Failed to fetch tour dates:', error);
    return NextResponse.json({ error: 'Failed to fetch tour dates' }, { status: 500 });
  }
}
