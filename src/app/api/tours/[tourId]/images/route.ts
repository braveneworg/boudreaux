/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { tourImages } from '@/lib/services/tours/tour-images/tour-images';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
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
    const result = await tourImages.list({ kind: 'tour', id: tourId });
    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to fetch tour images' },
        { status: httpStatusForCode(result.code) }
      );
    }

    return NextResponse.json(
      { images: result.data },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    loggers.media.error('Failed to fetch tour images', error);
    return NextResponse.json({ error: 'Failed to fetch tour images' }, { status: 500 });
  }
});
