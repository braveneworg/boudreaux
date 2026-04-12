/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/purchase-status?sessionId=cs_xxx
 *
 * Polled by the client after Stripe payment confirmation to check
 * whether the webhook has recorded the purchase in the database.
 *
 * Returns: { confirmed: boolean }
 * Cache-Control: no-store
 */
export const GET = withRateLimit(
  pollingLimiter,
  POLLING_LIMIT
)(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'missing_session_id' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Validate Stripe checkout session ID format (cs_test_ or cs_live_ prefix)
  if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId)) {
    return NextResponse.json(
      { error: 'invalid_session_id' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const purchase = await PurchaseRepository.findBySessionId(sessionId);

  return NextResponse.json(
    { confirmed: purchase !== null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
});
