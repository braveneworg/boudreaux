/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { downloadGate } from '@/lib/services/download-gate/download-gate';
import type { DownloadStatus } from '@/lib/services/download-gate/types';
import { resolveDownloadSubject } from '@/lib/utils/resolve-download-subject';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import type { FreeStatusResponse } from '@/lib/validation/bundle-download-schema';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/releases/[id]/download/free-status
 *
 * The free tier's view of one release for the download dialog: which free
 * formats it may take and where the free throttle stands. An adapter over
 * `DownloadGate.status` (ADR-0018); the subject is the signed-in user when
 * there is one, otherwise the guest the cookie and fingerprint resolve to.
 */
export const GET = withRateLimit<{ id: string }>(
  downloadLimiter,
  DOWNLOAD_LIMIT
)(async (request: NextRequest, context) => {
  const { id: releaseId } = await context.params;

  if (!isValidObjectId(releaseId)) {
    return NextResponse.json(
      { error: 'invalid_release_id' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const subject = await resolveDownloadSubject(request, session?.user?.id ?? null);
  const status = await downloadGate.status(subject, releaseId);
  if (status === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(toFreeStatusResponse(status), { headers: NO_STORE_HEADERS });
});

/** The wire shape the download dialog reads, from the gate's status view. */
const toFreeStatusResponse = ({
  availableFreeFormats,
  freeThrottle,
}: DownloadStatus): FreeStatusResponse => {
  const blockedReason: FreeStatusResponse['blockedReason'] =
    availableFreeFormats.length === 0
      ? 'no-free-formats'
      : freeThrottle.allowed
        ? null
        : 'cap-reached';
  return {
    allowed: blockedReason === null,
    remaining: blockedReason === null ? freeThrottle.remaining : 0,
    windowSeconds: 86_400,
    resetsAtIso: freeThrottle.resetsAt?.toISOString() ?? null,
    blockedReason,
    availableFreeFormats,
  };
};
