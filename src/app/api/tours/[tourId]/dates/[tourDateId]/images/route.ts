/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { tourImages } from '@/lib/services/tours/tour-images/tour-images';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

/**
 * GET /api/tours/[tourId]/dates/[tourDateId]/images
 * Admin-only. Every image of a tour date, whatever its visibility, for the
 * tour date's edit form. It is never public and never shared-cached: a date
 * whose headliners are all hidden is not announced (ADR-0015), and no public
 * page shows tour date images.
 */
export const GET = withAdmin(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ tourId: string; tourDateId: string }> }
  ) => {
    try {
      const { tourId, tourDateId } = await params;
      if (!OBJECT_ID_REGEX.test(tourId) || !OBJECT_ID_REGEX.test(tourDateId)) {
        return NextResponse.json({ images: [] });
      }
      const result = await tourImages.list({ kind: 'tourDate', id: tourDateId });
      if (!result.success) {
        return NextResponse.json(
          { error: 'Failed to fetch tour date images' },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(
        { images: result.data },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      loggers.media.error('Failed to fetch tour date images', error);
      return NextResponse.json({ error: 'Failed to fetch tour date images' }, { status: 500 });
    }
  }
);
