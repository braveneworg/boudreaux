/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { ARTIST_NAME_LOOKUP_LIMIT, artistNameLookupLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

/** Maximum number of names accepted per request — matches the artistDetails cap. */
const NAME_LOOKUP_MAX = 20;

export const GET = withRateLimit(
  artistNameLookupLimiter,
  ARTIST_NAME_LOOKUP_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const { searchParams } = request.nextUrl;
    const names = searchParams
      .getAll('name')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      return NextResponse.json(
        { error: 'At least one non-empty name parameter is required' },
        { status: 400 }
      );
    }

    if (names.length > NAME_LOOKUP_MAX) {
      return NextResponse.json(
        { error: `Too many name parameters — maximum is ${NAME_LOOKUP_MAX}` },
        { status: 400 }
      );
    }

    try {
      const results = await Promise.all(
        names.map(async (name) => ({
          name,
          match: await ArtistService.findByName(name),
        }))
      );

      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Unexpected error in name-lookup route', { error });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
