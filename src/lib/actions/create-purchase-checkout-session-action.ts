/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { prisma } from '@/lib/prisma';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { stripe } from '@/lib/stripe';
import { purchaseCheckoutSchema } from '@/lib/validation/purchase-schema';

import { auth } from '../../../auth';

type ActionResult =
  | { success: true; clientSecret: string; paymentIntentId: string }
  | { success: false; error: string };

/**
 * Server Action: Creates a Stripe Checkout Session in payment mode
 * for a PWYW release purchase.
 *
 * The `userId` is resolved entirely server-side:
 * - Authenticated users: derived from the Auth.js session via `auth()`.
 * - Guests: looked up (or created) from the `guestEmail` field using
 *   `PurchaseRepository.findOrCreateGuestUser()`.
 *
 * `userId` must never be accepted from client-supplied input to prevent
 * arbitrary purchase attribution.
 *
 * Returns the clientSecret for the embedded Stripe Payment Element
 * and the paymentIntentId used to poll for webhook confirmation.
 */
export async function createPurchaseCheckoutSessionAction(input: unknown): Promise<ActionResult> {
  const parsed = purchaseCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { releaseId, releaseTitle, amountCents, guestEmail } = parsed.data;

  // --- Resolve userId server-side ---
  const session = await auth();
  let userId: string;

  if (session?.user?.id) {
    // Authenticated user — trust the server session
    userId = session.user.id;
  } else if (guestEmail) {
    // Guest checkout — look up or create a user record by email
    const user = await PurchaseRepository.findOrCreateGuestUser(guestEmail);
    userId = user.id;
  } else {
    return { success: false, error: 'unauthenticated' };
  }

  try {
    // Minimum Stripe charge is $0.50
    if (amountCents < 50) {
      return { success: false, error: 'amount_below_minimum' };
    }

    // Block re-purchase
    const alreadyPurchased = await PurchaseService.checkExistingPurchase(userId, releaseId);
    if (alreadyPurchased) {
      return { success: false, error: 'already_purchased' };
    }

    // Verify release exists and is published
    const release = await prisma.release.findFirst({
      where: { id: releaseId, publishedAt: { not: null } },
      select: { id: true },
    });
    if (!release) {
      return { success: false, error: 'release_unavailable' };
    }

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'custom',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: releaseTitle },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          type: 'release_purchase',
          releaseId,
          userId,
        },
      },
      metadata: {
        type: 'release_purchase',
        releaseId,
        userId,
      },
      return_url: `${process.env.AUTH_URL ?? 'http://localhost:3000'}/releases/${releaseId}`,
    });

    if (!stripeSession.client_secret || !stripeSession.payment_intent) {
      return { success: false, error: 'stripe_error' };
    }

    const paymentIntentId =
      typeof stripeSession.payment_intent === 'string'
        ? stripeSession.payment_intent
        : stripeSession.payment_intent.id;

    return {
      success: true,
      clientSecret: stripeSession.client_secret,
      paymentIntentId,
    };
  } catch (error) {
    console.error('Failed to create purchase checkout session:', error);
    return { success: false, error: 'stripe_error' };
  }
}
