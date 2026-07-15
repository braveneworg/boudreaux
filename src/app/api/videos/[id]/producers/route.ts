/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ProducerRepository } from '@/lib/repositories/producer-repository';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

/**
 * GET /api/videos/[id]/producers
 * Admin-only. Returns the producers linked to a video — used to prefill
 * the producer pills in the edit form.
 *
 * Returns: { producers: { id: string; name: string }[] }
 * Cache-Control: private, no-store
 */
export const GET = withRateLimit<{ id: string }>(
  pollingLimiter,
  POLLING_LIMIT
)(
  withAdmin(
    async (
      _request: NextRequest,
      { params }: { params: Promise<{ id: string }> }
    ): Promise<NextResponse> => {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid video id' }, { status: 400 });
      }

      try {
        const producers = await ProducerRepository.findByVideoId(id);
        return NextResponse.json(
          { producers },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      } catch (error) {
        logger.error('Unexpected error in video producers route', { error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }
  )
);
