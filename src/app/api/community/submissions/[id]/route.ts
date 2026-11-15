/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { communityCaller } from '@/lib/community/community-session';
import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { SubmissionService } from '@/lib/services/submission-service';
import { loggers } from '@/lib/utils/logger';
import { objectId } from '@/lib/validation/primitives';
import { toSubmissionViewPayload } from '@/lib/validation/submission-view-schema';

export const dynamic = 'force-dynamic';

/** Never cached: the answer is one reader's, and a rejected submission must leave on the next read. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** One answer for every refusal, so the route never says a submission exists. */
const notFound = (): NextResponse =>
  NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

/**
 * GET /api/community/submissions/[id]
 *
 * One submission as the caller may see it: what the submission modal reads
 * when it opens (ADR-0030). Public and rate limited. Who may open what is
 * the service's decision, made for this caller: the public gets a public
 * submission, its owner and an approver get it in any state. An id that
 * names nothing, a submission the caller may not open, and a banned account
 * are answered alike, so an id does not reveal that a submission exists.
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (_request: NextRequest, { params }) => {
  try {
    const { id } = await params;
    if (!objectId.safeParse(id).success) {
      return notFound();
    }

    const caller = await communityCaller();
    if (caller.banned) {
      return notFound();
    }

    const view = await SubmissionService.getForViewer(id, caller.viewer);

    return view
      ? NextResponse.json(toSubmissionViewPayload(view), { headers: NO_STORE })
      : notFound();
  } catch (error) {
    loggers.media.error('Submission read error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
});
