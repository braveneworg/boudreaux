/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { stripe } from '@/lib/stripe';
import { getStripePriceId, type SubscriberRateTier } from '@/lib/subscriber-rates';

interface CreateCheckoutSessionResult {
  clientSecret: string | null;
  error?: string;
}

export const createCheckoutSessionAction = async (
  tier: SubscriberRateTier,
  customerEmail?: string,
  stripeCustomerId?: string
): Promise<CreateCheckoutSessionResult> => {
  try {
    const priceId = getStripePriceId(tier);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ui_mode: 'custom',
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : customerEmail
          ? { customer_email: customerEmail }
          : {}),
      return_url: `${process.env.AUTH_URL ?? 'http://localhost:3000'}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    });

    return { clientSecret: session.client_secret };
  } catch (error: unknown) {
    console.error('Failed to create checkout session:', error);
    return {
      clientSecret: null,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    };
  }
};
