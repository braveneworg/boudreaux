/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { TourDateImageRepository } from '@/lib/repositories/tours/tour-date-image-repository';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tourId: string; tourDateId: string }> }
) {
  try {
    const { tourId, tourDateId } = await params;
    if (!OBJECT_ID_REGEX.test(tourId) || !OBJECT_ID_REGEX.test(tourDateId)) {
      return NextResponse.json({ images: [] });
    }
    const images = await TourDateImageRepository.findByTourDateId(tourDateId);

    return NextResponse.json({ images });
  } catch (error) {
    console.error('Failed to fetch tour date images:', error);
    return NextResponse.json({ error: 'Failed to fetch tour date images' }, { status: 500 });
  }
}
