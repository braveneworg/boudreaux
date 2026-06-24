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

import type { Session } from 'next-auth';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

type ActionResult =
  | { success: true; clientSecret: string; sessionId: string }
  | { success: false; error: string };

type SessionParams = {
  releaseId: string;
  releaseTitle: string;
  amountCents: number;
  email: string | null;
  userId: string | null;
};

type UserIdentity = { userId: string | null; email: string | null };

/** Extracts userId and email from the server-side auth session combined with
 * the optional guest customerEmail. Never trusts client-supplied userId. */
const resolveUserIdentity = (
  authSession: Session | null,
  customerEmail: string | undefined
): UserIdentity => ({
  userId: authSession?.user?.id ?? null,
  email: authSession?.user?.email ?? customerEmail ?? null,
});

/** Resolves whether the buyer already owns this release. For authenticated
 * users we check directly; for guest checkout we resolve the email to a
 * userId first. */
const resolveAlreadyPurchased = async (
  userId: string | null,
  email: string | null,
  releaseId: string
): Promise<boolean> => {
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

/** Creates the Stripe Checkout Session and returns success/error ActionResult. */
const createStripeSession = async (params: SessionParams): Promise<ActionResult> => {
  const { releaseId, releaseTitle, amountCents, email, userId } = params;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ui_mode: 'elements',
    ...(email ? { customer_email: email } : {}),
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
      metadata: { type: 'release_purchase', releaseId, ...(userId ? { userId } : {}) },
    },
    metadata: { type: 'release_purchase', releaseId, ...(userId ? { userId } : {}) },
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

  return { success: true, clientSecret: session.client_secret, sessionId: session.id };
};

/**
 * Server Action: Creates a Stripe Checkout Session in payment mode
 * for a PWYW release purchase.
 *
 * Returns the clientSecret for the embedded Stripe Payment Element
 * and the sessionId used to poll for webhook confirmation.
 */
export const createPurchaseCheckoutSessionAction = async (
  input: unknown
): Promise<ActionResult> => {
  const parsed = purchaseCheckoutActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { releaseId, amountCents, customerEmail } = parsed.data;

  // Rate limit by email or releaseId to prevent checkout abuse
  try {
    await limiter.check(5, customerEmail ?? releaseId);
  } catch {
    return { success: false, error: 'Too many requests. Please try again later.' };
  }

  const { userId, email } = resolveUserIdentity(await auth(), customerEmail);

  try {
    // The re-purchase check and the release lookup are independent — run them
    // concurrently to save a round-trip.
    const [alreadyPurchased, release] = await Promise.all([
      resolveAlreadyPurchased(userId, email, releaseId),
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
    return await createStripeSession({
      releaseId,
      releaseTitle: release.title,
      amountCents,
      email,
      userId,
    });
  } catch (error) {
    loggers.payments.error('Failed to create purchase checkout session', error);
    return { success: false, error: 'stripe_error' };
  }
};
