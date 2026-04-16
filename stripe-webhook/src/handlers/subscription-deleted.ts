/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getPrisma } from '../lib/prisma.js';

import type Stripe from 'stripe';

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const user = await getPrisma().user.findFirst({
    where: { stripeCustomerId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
  }

  await getPrisma().user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'canceled',
      subscriptionId: null,
      subscriptionTier: null,
      subscriptionCurrentPeriodEnd: null,
      confirmationEmailSentAt: null,
    },
  });
}
