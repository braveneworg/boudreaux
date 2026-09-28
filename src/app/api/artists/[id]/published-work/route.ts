/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artists/[id]/published-work
 * Admin-only. The public work that carries an artist's name: the published
 * releases the artist is credited on and the tour dates the artist headlines.
 * Shown before an admin hides the artist, because hiding removes the name
 * from all of it (ADR-0015).
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
      }

      const result = await CreditConfirmationService.publishedWorkCreditedTo(id);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(result.data, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      loggers.media.error('Artist published work error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
