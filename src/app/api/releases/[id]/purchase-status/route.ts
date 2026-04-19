/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/purchase-status?sessionId=cs_xxx
 *
 * Polled by the client after Stripe payment confirmation to check
 * whether the webhook has recorded the purchase in the database.
 *
 * In development, if the webhook hasn't created the purchase record yet
 * (e.g. `stripe listen` not running), falls back to checking the Stripe
 * session status directly and creating the purchase record on the fly.
 * This fallback is disabled in production where the Lambda webhook is
 * the sole source of truth.
 *
 * Returns: { confirmed: boolean }
 * Cache-Control: no-store
 */
export const GET = withRateLimit<{ id: string }>(
  pollingLimiter,
  POLLING_LIMIT
)(async (request: NextRequest, context) => {
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

  if (purchase) {
    return NextResponse.json({ confirmed: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Dev-only fallback: check Stripe directly when the webhook hasn't fired
  // (e.g. `stripe listen` not running). Creates the purchase record so the
  // rest of the app works normally. Never runs in production.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid' && session.metadata?.type === 'release_purchase') {
        const { id: releaseId } = await context.params;
        const userId = session.metadata.userId;
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;

        if (userId && paymentIntentId) {
          // Guard against race with a concurrent webhook delivery
          const existing = await PurchaseRepository.findByPaymentIntentId(paymentIntentId);
          if (!existing) {
            await PurchaseRepository.create({
              userId,
              releaseId,
              amountPaid: session.amount_total ?? 0,
              currency: session.currency ?? 'usd',
              stripePaymentIntentId: paymentIntentId,
              stripeSessionId: session.id,
            });
          }

          console.info('[purchase-status] Dev fallback: created purchase from Stripe session', {
            sessionId,
            releaseId,
          });

          return NextResponse.json(
            { confirmed: true },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }
      }
    } catch (error) {
      console.warn(
        '[purchase-status] Dev fallback failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return NextResponse.json({ confirmed: false }, { headers: { 'Cache-Control': 'no-store' } });
});
