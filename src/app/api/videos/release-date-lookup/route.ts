/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { RELEASE_DATE_LOOKUP_LIMIT, releaseDateLookupLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseDateLookupService } from '@/lib/services/release-date-lookup-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

export const GET = withRateLimit(
  releaseDateLookupLimiter,
  RELEASE_DATE_LOOKUP_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const { searchParams } = request.nextUrl;
    const title = searchParams.get('title')?.trim();
    const artist = searchParams.get('artist')?.trim() || undefined;

    if (!title) {
      return NextResponse.json({ error: 'A non-empty title is required' }, { status: 400 });
    }

    try {
      const result = await ReleaseDateLookupService.lookup(title, artist);
      return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Release date lookup route failed', { error });
      return NextResponse.json({ error: 'Release date lookup failed' }, { status: 502 });
    }
  })
);
