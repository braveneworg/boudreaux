/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PurchaseService } from '@/lib/services/purchase-service';
import { stripe } from '@/lib/stripe';
import { loggers } from '@/lib/utils/logger';
import { rateLimit } from '@/lib/utils/rate-limit';
import { purchaseCheckoutActionSchema } from '@/lib/validation/purchase-schema';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

type ActionResult =
  | { success: true; clientSecret: string; sessionId: string }
  | { success: false; error: string };

/**
 * Server Action: Creates a Stripe Checkout Session in payment mode
 * for a PWYW release purchase.
 *
 * Returns the clientSecret for the embedded Stripe Payment Element
 * and the sessionId used to poll for webhook confirmation.
 */
export async function createPurchaseCheckoutSessionAction(input: unknown): Promise<ActionResult> {
  const parsed = purchaseCheckoutActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { releaseId, amountCents, customerEmail } = parsed.data;

  // Rate limit by email or releaseId to prevent checkout abuse
  const rateLimitKey = customerEmail ?? releaseId;
  try {
    await limiter.check(5, rateLimitKey);
  } catch {
    return { success: false, error: 'Too many requests. Please try again later.' };
  }

  // Resolve user identity server-side; never trust a client-supplied userId.
  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;
  const email = authSession?.user?.email ?? customerEmail ?? null;

  // Resolve whether the buyer already owns this release. For authenticated users
  // we check directly; for guest checkout we resolve the email to a userId first.
  const resolveAlreadyPurchased = async (): Promise<boolean> => {
    if (userId) {
      return PurchaseService.checkExistingPurchase(userId, releaseId);
    }
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        return PurchaseService.checkExistingPurchase(existingUser.id, releaseId);
      }
    }
    return false;
  };

  try {
    // The re-purchase check and the release lookup are independent — run them
    // concurrently to save a round-trip.
    const [alreadyPurchased, release] = await Promise.all([
      resolveAlreadyPurchased(),
      // Verify release exists and is published; fetch title for Stripe product data
      prisma.release.findFirst({
        where: { id: releaseId, publishedAt: { not: null } },
        select: { id: true, title: true },
      }),
    ]);

    if (alreadyPurchased) {
      return { success: false, error: 'already_purchased' };
    }

    if (!release) {
      return { success: false, error: 'release_unavailable' };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'elements',
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: release.title },
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

    if (!session.client_secret) {
      loggers.payments.error('Checkout session missing client_secret', undefined, {
        checkoutId: session.id,
        uiMode: 'elements',
      });
      return { success: false, error: 'stripe_error' };
    }

    loggers.payments.info('Purchase checkout session created', {
      checkoutId: session.id,
      releaseId,
      ...(userId ? { userId } : {}),
      amountCents: session.amount_total ?? undefined,
    });

    return {
      success: true,
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  } catch (error) {
    loggers.payments.error('Failed to create purchase checkout session', error);
    return { success: false, error: 'stripe_error' };
  }
}
