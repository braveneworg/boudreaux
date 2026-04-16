/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getPrisma } from '../lib/prisma.js';

import type Stripe from 'stripe';

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    console.error('invoice.payment_failed missing customer ID', { invoiceId: invoice.id });
    return;
  }

  const user = await getPrisma().user.findFirst({
    where: { stripeCustomerId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
  }

  await getPrisma().user.update({
    where: { id: user.id },
    data: { subscriptionStatus: 'past_due' },
  });
}
