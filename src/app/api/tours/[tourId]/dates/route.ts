/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { loggers } from '@/lib/utils/logger';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

/**
 * GET /api/tours/[tourId]/dates
 * Admin-only. Every date of a tour with every headliner, whatever the
 * artists' state, for the tour's edit screen. It names hidden artists, so it
 * is never public and never shared-cached (ADR-0015). The public reads a
 * tour's dates on the tour itself.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ tourId: string }> }) => {
    try {
      const { tourId } = await params;

      if (!OBJECT_ID_REGEX.test(tourId)) {
        return NextResponse.json({ tourDates: [] });
      }

      const tourDates = await TourDateRepository.findByTourId(tourId);

      return NextResponse.json(
        { tourDates },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      loggers.media.error('Failed to fetch tour dates', error);
      return NextResponse.json({ error: 'Failed to fetch tour dates' }, { status: 500 });
    }
  }
);
