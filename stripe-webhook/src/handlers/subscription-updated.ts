/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sendSubscriptionConfirmationEmail } from '../email/send-subscription-confirmation.js';
import { prisma } from '../lib/prisma.js';
import { getTierByPriceId } from '../lib/subscriber-rates.js';

import type Stripe from 'stripe';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;
  const newTier = priceId ? getTierByPriceId(priceId) : null;
  const interval = firstItem?.price.recurring?.interval ?? 'month';

  const existing = await prisma.user.findFirst({
    where: { stripeCustomerId },
    select: {
      id: true,
      email: true,
      subscriptionTier: true,
    },
  });

  if (!existing) {
    throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTier: newTier,
      subscriptionCurrentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000)
        : null,
    },
  });

  if (
    existing.email &&
    ACTIVE_STATUSES.has(subscription.status) &&
    newTier !== existing.subscriptionTier
  ) {
    await prisma.user.updateMany({
      where: { email: existing.email },
      data: { confirmationEmailSentAt: null },
    });
    await sendSubscriptionConfirmationEmail(existing.email, newTier, interval);
  }
}
