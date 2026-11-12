/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { mayUseCommunity } from '@/lib/community/community-access';
import { withAuth } from '@/lib/decorators/with-auth';
import { SubmissionService } from '@/lib/services/submission-service';
import { loggers } from '@/lib/utils/logger';
import { objectId } from '@/lib/validation/primitives';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** One answer for every refusal, so the route never says a submission exists. */
const notFound = (): NextResponse =>
  NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

/**
 * GET /api/community/submissions/[id]/attachments
 * A submission's attachments as its owner or an approver sees them: where
 * each re-encode stands, and a signed link to each copy that is ready. The
 * form and the review page poll this while anything is processing. It is not
 * the public's read: a public reader gets the page, never this.
 */
export const GET = withAuth<{ id: string }>(async (_request: NextRequest, { params }, { user }) => {
  try {
    const { id } = await params;
    if (!mayUseCommunity(user.role) || !objectId.safeParse(id).success) {
      return notFound();
    }

    const view = await SubmissionService.getForViewer(id, {
      id: user.id,
      role: user.role ?? null,
    });
    if (!view || view.viewer === 'public') {
      return notFound();
    }

    return NextResponse.json(
      {
        status: view.status,
        updatedAt: view.updatedAt.toISOString(),
        attachments: view.attachments,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    loggers.media.error('Submission attachments read error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
