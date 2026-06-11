/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { QuotaEnforcementService } from '@/lib/services/quota-enforcement-service';
import { loggers } from '@/lib/utils/logger';

/**
 * GET /api/user/download-quota
 *
 * Returns the current user's free download quota status.
 */
export const GET = withAuth(async (_request, _context, session) => {
  try {
    const quotaService = new QuotaEnforcementService();
    const status = await quotaService.getQuotaStatus({ kind: 'user', userId: session.user.id });

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    loggers.downloads.error('Quota status error', error);

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch quota status.' },
      { status: 500 }
    );
  }
});
