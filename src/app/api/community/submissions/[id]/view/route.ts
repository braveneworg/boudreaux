/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { SUBMISSION_VIEW_LIMIT, submissionViewLimiter } from '@/lib/config/rate-limit-tiers';
import { extractClientIp, withRateLimit } from '@/lib/decorators/with-rate-limit';
import { SubmissionViewEventService } from '@/lib/services/submission-view-event-service';
import type { SubmissionActor } from '@/lib/types/domain/submission';
import { loggers } from '@/lib/utils/logger';
import { resolveGuestSubject } from '@/lib/utils/resolve-download-subject';
import { isSameOriginRequest } from '@/lib/utils/same-origin-request';
import { objectId } from '@/lib/validation/primitives';

export const dynamic = 'force-dynamic';

/** Never cached: every call is one opening, and the answer says nothing. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * The one answer to every well-formed request: counted or not, a submission
 * or not. Its status and body never say whether a view was counted.
 *
 * It is not a secret that a submission is public. A guest with no visitor
 * cookie is sent one only when the id names a public submission, since a
 * guest is identified only then; the submission's own page already answers
 * `200` or `404` for the same question. An id that names nothing and one
 * that is not public are answered alike.
 */
const answered = (): NextResponse => new NextResponse(null, { status: 204, headers: NO_STORE });

/** Who is calling: a banned account, or the viewer to count for (`null` is a guest). */
type Caller = { banned: true } | { banned: false; viewer: SubmissionActor | null };

/** The caller of a route that takes no session: the session's user, or a guest. */
const identifyCaller = async (): Promise<Caller> => {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;
  if (user?.banned === true) {
    return { banned: true };
  }

  return { banned: false, viewer: user ? { id: user.id, role: user.role ?? null } : null };
};

/**
 * POST /api/community/submissions/[id]/view
 *
 * Count one opening of a submission's page as a view (CONTEXT.md, ADR-0029).
 * The page's beacon calls it once it has mounted, so a link preview or a
 * crawler, which only renders the page, is never a view. Public and rate
 * limited. A route and not a Server Action: the guest's visitor cookie is
 * sent only to `/api`, and a Server Action that set it would re-render the
 * page that called it.
 *
 * What counts is the service's decision. This only refuses a request another
 * site made a browser send, and says who is calling: the session's user, or
 * a guest, identified as a download's guest is and only if the service asks.
 * A banned account is answered as anyone is, and nothing is counted.
 */
export const POST = withRateLimit<{ id: string }>(
  submissionViewLimiter,
  SUBMISSION_VIEW_LIMIT
)(async (request: NextRequest, { params }) => {
  try {
    const { id } = await params;
    if (!objectId.safeParse(id).success) {
      return NextResponse.json(
        { error: 'Invalid submission id' },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!isSameOriginRequest(request.headers)) {
      return answered();
    }

    const caller = await identifyCaller();
    if (caller.banned) {
      return answered();
    }

    await SubmissionViewEventService.record({
      submissionId: id,
      viewer: caller.viewer,
      resolveGuest: async () => (await resolveGuestSubject(request)).visitorId,
      address: extractClientIp(request),
      now: new Date(),
    });

    return answered();
  } catch (error) {
    loggers.media.error('Submission view count error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
});
