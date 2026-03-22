/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/purchase-status?paymentIntentId=pi_xxx
 *
 * Polled by the client after Stripe payment confirmation to check
 * whether the webhook has recorded the purchase in the database.
 *
 * Returns: { confirmed: boolean }
 * Cache-Control: no-store
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const paymentIntentId = searchParams.get('paymentIntentId');

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: 'missing_payment_intent_id' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const purchase = await PurchaseRepository.findByPaymentIntentId(paymentIntentId);

  return NextResponse.json(
    { confirmed: purchase !== null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
