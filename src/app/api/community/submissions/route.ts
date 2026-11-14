/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { SubmissionService } from '@/lib/services/submission-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { loggers } from '@/lib/utils/logger';
import {
  submissionListingQuerySchema,
  type SubmissionCardPage,
} from '@/lib/validation/submission-listing-schema';

export const dynamic = 'force-dynamic';

/** Never cached: a rejected or unlisted submission must leave on the next read. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

const pageResponse = (page: SubmissionCardPage): NextResponse =>
  NextResponse.json(page, { headers: NO_STORE });

/**
 * GET /api/community/submissions
 *
 * One page of listed submissions as cards, newest first: the community
 * page's full list, its search and one user's public list. Public and rate
 * limited; it reads no session, and answers only listed submissions whoever
 * asks, so an owner or an approver gets no more here than a stranger.
 *
 * Query params:
 *   skip, take – the page; `take` is at most 24 and defaults to 12.
 *   search     – a term read against the title, the about and the username.
 *   user       – a username: only that user's. One that names no account
 *                answers an empty page.
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest) => {
  try {
    const parsed = submissionListingQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400, headers: NO_STORE });
    }

    const { skip, take, search, user } = parsed.data;
    const owner = user === '' ? undefined : await SubmissionService.ownerNamed(user);
    if (owner === null) {
      return pageResponse({ rows: [], nextSkip: null });
    }

    const rows = await SubmissionService.listCards({
      skip,
      take,
      ...(search !== '' && { search }),
      ...(owner && { ownerId: owner.id }),
    });

    return pageResponse({ rows, nextSkip: computeNextSkip(rows.length, skip, take) });
  } catch (error) {
    loggers.media.error('Listed submissions read error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
});
