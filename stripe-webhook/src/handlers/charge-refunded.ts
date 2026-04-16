/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getPrisma } from '../lib/prisma.js';

import type Stripe from 'stripe';

export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('charge.refunded missing payment_intent', { chargeId: charge.id });
    return;
  }

  const result = await getPrisma().releasePurchase.updateMany({
    where: { stripePaymentIntentId: paymentIntentId, refundedAt: null },
    data: { refundedAt: new Date() },
  });

  if (result.count > 0) {
    console.info('charge.refunded: purchase marked as refunded', { paymentIntentId });
  } else {
    console.warn('charge.refunded: no matching un-refunded purchase found', { paymentIntentId });
  }
}
