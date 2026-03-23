/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { prisma } from '@/lib/prisma';
import { PurchaseService } from '@/lib/services/purchase-service';
import { stripe } from '@/lib/stripe';
import { purchaseCheckoutActionSchema } from '@/lib/validation/purchase-schema';

import { auth } from '../../../auth';

type ActionResult =
  | { success: true; clientSecret: string; paymentIntentId: string }
  | { success: false; error: string };

/**
 * Server Action: Creates a Stripe Checkout Session in payment mode
 * for a PWYW release purchase.
 *
 * Returns the clientSecret for the embedded Stripe Payment Element
 * and the paymentIntentId used to poll for webhook confirmation.
 */
export async function createPurchaseCheckoutSessionAction(input: unknown): Promise<ActionResult> {
  const parsed = purchaseCheckoutActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { releaseId, releaseTitle, amountCents } = parsed.data;

  // Resolve user identity server-side; never trust a client-supplied userId.
  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;

  try {
    // Minimum Stripe charge is $0.50
    if (amountCents < 50) {
      return { success: false, error: 'amount_below_minimum' };
    }

    // Block re-purchase for authenticated users
    if (userId) {
      const alreadyPurchased = await PurchaseService.checkExistingPurchase(userId, releaseId);
      if (alreadyPurchased) {
        return { success: false, error: 'already_purchased' };
      }
    }

    // Verify release exists and is published
    const release = await prisma.release.findFirst({
      where: { id: releaseId, publishedAt: { not: null } },
      select: { id: true },
    });
    if (!release) {
      return { success: false, error: 'release_unavailable' };
    }

    const session = await stripe.checkout.sessions.create({
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
          ...(userId ? { userId } : {}),
        },
      },
      metadata: {
        type: 'release_purchase',
        releaseId,
        ...(userId ? { userId } : {}),
      },
      return_url: `${process.env.AUTH_URL ?? 'http://localhost:3000'}/releases/${releaseId}`,
    });

    if (!session.client_secret || !session.payment_intent) {
      return { success: false, error: 'stripe_error' };
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent.id;

    return {
      success: true,
      clientSecret: session.client_secret,
      paymentIntentId,
    };
  } catch (error) {
    console.error('Failed to create purchase checkout session:', error);
    return { success: false, error: 'stripe_error' };
  }
}
