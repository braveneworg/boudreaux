/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { generateUsername } from 'unique-username-generator';
import { z } from 'zod';

import { sendPurchaseConfirmationEmail } from '@/lib/email/send-purchase-confirmation';
import { sendSubscriptionConfirmationEmail } from '@/lib/email/send-subscription-confirmation';
import { prisma } from '@/lib/prisma';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { SubscriptionRepository } from '@/lib/repositories/subscription-repository';
import { stripe } from '@/lib/stripe';
import { getTierByPriceId } from '@/lib/subscriber-rates';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Zod schema for validating webhook metadata on release purchases */
const releaseMetadataSchema = z.object({
  releaseId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid releaseId format'),
  userId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid userId format')
    .optional(),
  type: z.literal('release_purchase'),
});

export async function POST(request: NextRequest) {
  // --- IP Allowlist ---
  const skipIpCheck = process.env.SKIP_STRIPE_IP_CHECK === 'true';
  if (!skipIpCheck) {
    const ipRangesEnv = process.env.STRIPE_WEBHOOK_IP_RANGES ?? '';
    if (ipRangesEnv) {
      const forwarded = request.headers.get('x-forwarded-for');
      const remoteIp = forwarded
        ? forwarded.split(',')[0].trim()
        : (request.headers.get('x-real-ip')?.trim() ?? '');
      const allowedRanges = ipRangesEnv.split(',').map((r) => r.trim());
      const isAllowed = allowedRanges.some((range) => isIpInCidr(remoteIp, range));
      if (!isAllowed) {
        console.warn(`Stripe webhook rejected: IP ${remoteIp} not in allowlist`);
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(
      'Webhook signature verification failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`Error handling webhook event ${event.type}:`, error);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Payment mode — PWYW release purchase
  if (session.mode === 'payment' && session.metadata?.type === 'release_purchase') {
    await handleReleasePurchaseCompleted(session);
    return;
  }

  const customerEmail = session.customer_details?.email ?? session.customer_email;
  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (!customerEmail || !stripeCustomerId) {
    console.error('checkout.session.completed missing email or customer ID', {
      sessionId: session.id,
    });
    return;
  }

  await SubscriptionRepository.linkStripeCustomer(customerEmail, stripeCustomerId);

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

    await SubscriptionRepository.updateSubscription(stripeCustomerId, {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTier: tier,
      subscriptionCurrentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000)
        : null,
    });
  }

  // Reset the flag so the email is sent even if this is a re-subscription or
  // tier change that goes through Checkout instead of the customer portal.
  await SubscriptionRepository.resetConfirmationEmailSent(customerEmail);
  await sendSubscriptionConfirmationEmail(customerEmail, tier, interval);
}

async function handleReleasePurchaseCompleted(session: Stripe.Checkout.Session) {
  // Always retrieve the full session — webhook payload may have payment_intent: null.
  // If retrieve throws, the outer try-catch in POST() returns 500.
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
    const existingUser = await PurchaseRepository.findUserByEmail(customerEmail);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create a new user for first-time guest purchasers so the purchase can
      // be linked and the auto-login flow can create a session for them.
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
        if (createError instanceof PrismaClientKnownRequestError && createError.code === 'P2002') {
          // Race condition: another webhook delivery already created this user — re-fetch.
          const racedUser = await PurchaseRepository.findUserByEmail(customerEmail);
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
  // is handled gracefully so the email logic below always runs — the
  // markEmailSent guard in sendPurchaseConfirmationEmail is the real
  // idempotency mechanism.
  let purchase = await PurchaseRepository.findByPaymentIntentId(paymentIntentId);

  if (!purchase) {
    try {
      purchase = await PurchaseRepository.create({
        userId,
        releaseId,
        amountPaid: amountTotal,
        currency: retrievedSession.currency ?? 'usd',
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: retrievedSession.id,
      });
    } catch (createError) {
      if (
        createError instanceof PrismaClientKnownRequestError &&
        createError.code === 'P2002' &&
        (createError.meta?.target as string[] | undefined)?.includes('stripePaymentIntentId')
      ) {
        // Race condition: another webhook delivery already created this purchase — re-fetch.
        purchase = await PurchaseRepository.findByPaymentIntentId(paymentIntentId);
        if (!purchase) {
          // P2002 was for stripePaymentIntentId but the record is still not visible;
          // propagate so the webhook is retried.
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

  // Resolve the email for the confirmation. Prefer the Stripe session email,
  // but fall back to the user's email in the database — embedded checkout
  // (ui_mode: 'elements') may not populate customer_details or customer_email
  // on the session object.
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

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;
  const newTier = priceId ? getTierByPriceId(priceId) : null;
  const interval = firstItem?.price.recurring?.interval ?? 'month';

  const existing = await SubscriptionRepository.findByStripeCustomerId(stripeCustomerId);

  await SubscriptionRepository.updateSubscription(stripeCustomerId, {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionTier: newTier,
    subscriptionCurrentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
  });

  if (
    existing?.email &&
    ACTIVE_STATUSES.has(subscription.status) &&
    newTier !== existing.subscriptionTier
  ) {
    await SubscriptionRepository.resetConfirmationEmailSent(existing.email);
    await sendSubscriptionConfirmationEmail(existing.email, newTier, interval);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  await SubscriptionRepository.cancelSubscription(stripeCustomerId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    console.error('invoice.payment_failed missing customer ID', { invoiceId: invoice.id });
    return;
  }

  await SubscriptionRepository.updateSubscriptionStatus(stripeCustomerId, 'past_due');
}

/**
 * Checks whether an IPv4 address falls within a given CIDR range.
 * Supports /0 through /32 prefix lengths.
 * Returns false for any malformed IP or CIDR input.
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bitsStr] = cidr.split('/');
    const normalizedBitsStr = bitsStr ?? '32';
    if (!/^\d+$/.test(normalizedBitsStr)) return false;
    const bits = parseInt(normalizedBitsStr, 10);
    if (bits < 0 || bits > 32) return false;
    const ipNum = ipToNum(ip);
    const rangeNum = ipToNum(range ?? '');
    if (ipNum === null || rangeNum === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

/**
 * Converts a dotted-decimal IPv4 string to a 32-bit unsigned integer.
 * Returns null if the input is not a valid IPv4 address (must have exactly
 * 4 decimal octets, each in the range 0–255).
 */
function ipToNum(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) return null;
  let result = 0;
  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) return null;
    if (octet.length > 1 && octet[0] === '0') return null;
    const n = parseInt(octet, 10);
    if (n > 255) return null;
    result = ((result << 8) | n) >>> 0;
  }
  return result;
}
