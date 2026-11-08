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
 * GET /api/tours/[tourId]/images
 * Admin-only. Every image of a tour, whatever the tour's visibility, for the
 * tour's edit screen. It is never public and never shared-cached: a tour
 * whose dates are all hidden reads as not found to the public (ADR-0015),
 * and so must its images. The public reads a tour's images on the tour
 * itself.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ tourId: string }> }) => {
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
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      loggers.media.error('Failed to fetch tour images', error);
      return NextResponse.json({ error: 'Failed to fetch tour images' }, { status: 500 });
    }
  }
);
