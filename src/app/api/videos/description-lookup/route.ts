/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { DESCRIPTION_LOOKUP_LIMIT, descriptionLookupLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VideoDescriptionLookupService } from '@/lib/services/video-description-lookup-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withRateLimit(
  descriptionLookupLimiter,
  DESCRIPTION_LOOKUP_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const { searchParams } = request.nextUrl;
    const title = searchParams.get('title')?.trim();
    const artist = searchParams.get('artist')?.trim();
    const releasedOnRaw = searchParams.get('releasedOn')?.trim();
    // Malformed dates are dropped (the prose simply goes undated) rather than
    // failing a lookup the admin explicitly asked for.
    const releasedOn =
      releasedOnRaw && ISO_DATE_PATTERN.test(releasedOnRaw) ? releasedOnRaw : undefined;

    if (!title) {
      return NextResponse.json({ error: 'A non-empty title is required' }, { status: 400 });
    }
    if (!artist) {
      return NextResponse.json(
        { error: 'A non-empty artist is required — the description must name one' },
        { status: 400 }
      );
    }

    try {
      const result = await VideoDescriptionLookupService.lookup({
        title,
        artist,
        ...(releasedOn ? { releasedOn } : {}),
      });
      return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Description lookup route failed', { error });
      return NextResponse.json({ error: 'Description lookup failed' }, { status: 502 });
    }
  })
);
