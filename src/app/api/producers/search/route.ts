/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { PRODUCER_SEARCH_LIMIT, producerSearchLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ProducerService } from '@/lib/services/producer-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

export const GET = withRateLimit(
  producerSearchLimiter,
  PRODUCER_SEARCH_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const query = request.nextUrl.searchParams.get('q') ?? '';
    try {
      const results = await ProducerService.search(query);
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Unexpected error in producer search route', { error });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
