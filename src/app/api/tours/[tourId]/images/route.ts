/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ImageRepository } from '@/lib/repositories/tours/image-repository';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

export const GET = withRateLimit<{ tourId: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (_request: NextRequest, { params }: { params: Promise<{ tourId: string }> }) => {
  try {
    const { tourId } = await params;
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return NextResponse.json({ images: [] });
    }
    const images = await ImageRepository.findByTourId(tourId);

    return NextResponse.json(
      { images },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch tour images:', error);
    return NextResponse.json({ error: 'Failed to fetch tour images' }, { status: 500 });
  }
});
