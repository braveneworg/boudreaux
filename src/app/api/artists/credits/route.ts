/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import type { CreditConfirmation } from '@/lib/utils/credit-confirmation';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/** Far above any real release's credits; bounds the `in` list a request can send. */
const MAX_ARTISTS = 200;

const NOTHING_TO_CONFIRM: CreditConfirmation = { awaiting: [], stayHidden: [] };

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

/**
 * GET /api/artists/credits?id=…&id=…
 * Admin-only. The same two lists as `/api/releases/[id]/credits`, for the
 * artists a release form is about to credit: its credits are not stored until
 * the form is saved, and the admin decides before that (ADR-0015).
 */
export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const ids = [...new Set(request.nextUrl.searchParams.getAll('id'))];
    if (ids.length > MAX_ARTISTS || !ids.every(isValidObjectId)) {
      return NextResponse.json({ error: 'Invalid artist IDs' }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json(NOTHING_TO_CONFIRM, NO_STORE);
    }

    const result = await CreditConfirmationService.forArtists(ids);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(result.data, NO_STORE);
  } catch (error) {
    loggers.media.error('Artist credits error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
