/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { SubscriptionRepository } from '@/lib/repositories/subscription-repository';
import { stripe } from '@/lib/stripe';
import { getStripePriceId, type SubscriberRateTier } from '@/lib/subscriber-rates';

import { auth } from '../../../auth';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

interface CreateCheckoutSessionResult {
  clientSecret: string | null;
  error?: string;
}

export const createCheckoutSessionAction = async (
  tier: SubscriberRateTier,
  customerEmail?: string
): Promise<CreateCheckoutSessionResult> => {
  try {
    const authSession = await auth();

    // Use the server-verified email when the user is authenticated; fall back to
    // the provided email for unauthenticated (guest) checkouts.
    const verifiedEmail = authSession?.user?.email ?? customerEmail;

    const existing = verifiedEmail ? await SubscriptionRepository.findByEmail(verifiedEmail) : null;

    if (
      existing?.subscriptionStatus &&
      ACTIVE_STATUSES.has(existing.subscriptionStatus) &&
      existing.subscriptionTier === tier
    ) {
      return {
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      };
    }

    const priceId = getStripePriceId(tier);

    // Prefer the database-stored Stripe customer ID so we never trust client input.
    const resolvedCustomerId = existing?.stripeCustomerId ?? undefined;

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ui_mode: 'elements',
      ...(resolvedCustomerId
        ? { customer: resolvedCustomerId }
        : verifiedEmail
          ? { customer_email: verifiedEmail }
          : {}),
      return_url: `${process.env.AUTH_URL || 'http://localhost:3000'}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    });

    return { clientSecret: stripeSession.client_secret };
  } catch (error: unknown) {
    console.error('Failed to create checkout session:', error);
    return {
      clientSecret: null,
      error: 'Unable to start checkout. Please try again.',
    };
  }
};
