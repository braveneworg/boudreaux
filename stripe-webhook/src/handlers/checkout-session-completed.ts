/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';
import { generateUsername } from 'unique-username-generator';
import { z } from 'zod';

import { sendPurchaseConfirmationEmail } from '../email/send-purchase-confirmation.js';
import { sendSubscriptionConfirmationEmail } from '../email/send-subscription-confirmation.js';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { getTierByPriceId } from '../lib/subscriber-rates.js';

import type Stripe from 'stripe';

/** Zod schema for validating webhook metadata on release purchases. */
const releaseMetadataSchema = z.object({
  releaseId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid releaseId format'),
  userId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'Invalid userId format')
    .optional(),
  type: z.literal('release_purchase'),
});

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  // Payment mode — PWYW release purchase
  if (session.mode === 'payment' && session.metadata?.type === 'release_purchase') {
    await handleReleasePurchaseCompleted(session);
    return;
  }

  // Subscription mode
  const customerEmail = session.customer_details?.email ?? session.customer_email;
  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (!customerEmail || !stripeCustomerId) {
    console.error('checkout.session.completed missing email or customer ID', {
      sessionId: session.id,
    });
    return;
  }

  const updateUserResult = await prisma.user.updateMany({
    where: { email: customerEmail },
    data: { stripeCustomerId },
  });

  if (updateUserResult.count === 0) {
    console.warn('checkout.session.completed user not found for email; skipping user update', {
      customerEmail,
      sessionId: session.id,
      stripeCustomerId,
    });
  }

  let tier = null;
  let interval = 'month';

  if (session.subscription) {
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const firstItem = subscription.items.data[0];
    const priceId = firstItem?.price.id;
    tier = priceId ? getTierByPriceId(priceId) : null;
    interval = firstItem?.price.recurring?.interval ?? 'month';

    const user = await prisma.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          subscriptionCurrentPeriodEnd: firstItem
            ? new Date(firstItem.current_period_end * 1000)
            : null,
        },
      });
    }
  }

  // Reset the flag so the email is sent even if this is a re-subscription
  await prisma.user.updateMany({
    where: { email: customerEmail },
    data: { confirmationEmailSentAt: null },
  });
  await sendSubscriptionConfirmationEmail(customerEmail, tier, interval);
}

async function handleReleasePurchaseCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Always retrieve the full session — webhook payload may have payment_intent: null.
  const retrievedSession = await stripe.checkout.sessions.retrieve(session.id);

  // Security: validate webhook metadata with Zod before using in queries
  const metadataResult = releaseMetadataSchema.safeParse(retrievedSession.metadata);
  if (!metadataResult.success) {
    console.error('release_purchase webhook has invalid metadata', {
      sessionId: retrievedSession.id,
      metadata: retrievedSession.metadata,
      errors: metadataResult.error.issues,
    });
    return;
  }
  const { releaseId, userId: metadataUserId } = metadataResult.data;

  // Derive customerEmail — check both the raw event session and the retrieved
  // session because embedded checkout (ui_mode: 'elements') may not populate
  // customer_details on the retrieved session.
  const customerEmail =
    retrievedSession.customer_details?.email ??
    retrievedSession.customer_email ??
    session.customer_details?.email ??
    session.customer_email ??
    null;

  const paymentIntentId =
    typeof retrievedSession.payment_intent === 'string'
      ? retrievedSession.payment_intent
      : retrievedSession.payment_intent?.id;

  if (!releaseId || !paymentIntentId) {
    console.error('release_purchase webhook missing required metadata', {
      sessionId: retrievedSession.id,
      releaseId,
      paymentIntentId,
    });
    return;
  }

  // Resolve userId: prefer metadata, fall back to email lookup for guest purchases.
  let userId: string | undefined = metadataUserId;
  if (!userId && customerEmail) {
    const existingUser = await prisma.user.findUnique({
      where: { email: customerEmail },
      select: { id: true },
    });
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create a new user for first-time guest purchasers.
      // Guard against concurrent webhook deliveries racing on the unique email
      // index (P2002) by re-fetching the user if creation fails.
      const placeholderUsername = generateUsername('', 0, 15);
      try {
        const newUser = await prisma.user.create({
          data: {
            email: customerEmail,
            emailVerified: new Date(),
            username: placeholderUsername,
          },
        });
        userId = newUser.id;
      } catch (createError) {
        if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
          const racedUser = await prisma.user.findUnique({
            where: { email: customerEmail },
            select: { id: true },
          });
          if (racedUser) {
            userId = racedUser.id;
          } else {
            console.error('release_purchase webhook: P2002 race — user not found on re-fetch', {
              sessionId: retrievedSession.id,
              email: customerEmail,
            });
          }
        } else {
          throw createError;
        }
      }
    }
  }

  if (!userId) {
    console.error('release_purchase webhook: could not resolve userId (no email available)', {
      sessionId: retrievedSession.id,
      releaseId,
    });
    return;
  }

  const amountTotal = retrievedSession.amount_total ?? 0;

  // Create the purchase record, or fetch existing if this is a duplicate
  // webhook delivery. P2002 (unique constraint on stripePaymentIntentId)
  // is handled gracefully.
  let purchase = await prisma.releasePurchase.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });

  if (!purchase) {
    try {
      purchase = await prisma.releasePurchase.create({
        data: {
          userId,
          releaseId,
          amountPaid: amountTotal,
          currency: retrievedSession.currency ?? 'usd',
          stripePaymentIntentId: paymentIntentId,
          stripeSessionId: retrievedSession.id,
          confirmationEmailSentAt: null,
          refundedAt: null,
        },
      });
    } catch (createError) {
      if (
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === 'P2002' &&
        (createError.meta?.target as string[] | undefined)?.includes('stripePaymentIntentId')
      ) {
        purchase = await prisma.releasePurchase.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
        });
        if (!purchase) {
          throw createError;
        }
      } else {
        throw createError;
      }
    }
  }

  if (!purchase) {
    console.error('release_purchase webhook: failed to create or find purchase', {
      sessionId: retrievedSession.id,
      paymentIntentId,
    });
    return;
  }

  // Fetch release title for the confirmation email
  const release = await prisma.release.findFirst({
    where: { id: releaseId },
    select: { title: true },
  });
  const releaseTitle = release?.title ?? 'Unknown Release';

  // Resolve the email for the confirmation.
  let emailForConfirmation = customerEmail;
  if (!emailForConfirmation) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    emailForConfirmation = user?.email ?? null;
  }

  if (emailForConfirmation) {
    const emailSent = await sendPurchaseConfirmationEmail({
      purchaseId: purchase.id,
      customerEmail: emailForConfirmation,
      releaseTitle,
      amountPaidCents: amountTotal,
      releaseId,
    });
    if (!emailSent) {
      console.warn('release_purchase webhook: sendPurchaseConfirmationEmail returned false', {
        purchaseId: purchase.id,
        customerEmail: emailForConfirmation,
      });
    }
  } else {
    console.error('release_purchase webhook: no email available for confirmation', {
      sessionId: retrievedSession.id,
      purchaseId: purchase.id,
      userId,
    });
  }
}
