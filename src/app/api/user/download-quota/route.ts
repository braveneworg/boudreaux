/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getToken } from 'next-auth/jwt';

import { QuotaEnforcementService } from '@/lib/services/quota-enforcement-service';

/**
 * GET /api/user/download-quota
 *
 * Returns the current user's free download quota status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

    if (!token?.sub) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: 'You must be logged in.' },
        { status: 401 }
      );
    }

    const quotaService = new QuotaEnforcementService();
    const status = await quotaService.getQuotaStatus(token.sub);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Quota status error:', error);

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch quota status.' },
      { status: 500 }
    );
  }
}
