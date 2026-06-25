/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { z } from 'zod';

import { sendPurchaseConfirmationEmail } from '@/lib/email/send-purchase-confirmation';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseService } from '@/lib/services/release-service';
import { UserService } from '@/lib/services/user-service';
import { stripe } from '@/lib/stripe';
import type { PurchaseRecord } from '@/lib/types/domain';
import { DataError } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const logger = loggers.stripe;

/** Zod schema for validating webhook metadata on release purchases */
const releaseMetadataSchema = z.object({
  releaseId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid releaseId format'),
  userId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'Invalid userId format')
    .optional(),
  type: z.literal('release_purchase'),
});

/**
 * Checks whether the request IP is allowed by the STRIPE_WEBHOOK_IP_RANGES
 * env var. Returns null when the check passes (or is skipped), or a
 * NextResponse with status 403 when the IP is blocked.
 */
const checkIpAllowlist = (request: NextRequest): NextResponse | null => {
  const skipIpCheck = process.env.SKIP_STRIPE_IP_CHECK === 'true';
  if (skipIpCheck) return null;

  const ipRangesEnv = process.env.STRIPE_WEBHOOK_IP_RANGES ?? '';
  if (!ipRangesEnv) return null;

  const forwarded = request.headers.get('x-forwarded-for');
  const remoteIp = forwarded
    ? forwarded.split(',')[0].trim()
    : (request.headers.get('x-real-ip')?.trim() ?? '');
  const allowedRanges = ipRangesEnv.split(',').map((r) => r.trim());
  const isAllowed = allowedRanges.some((range) => isIpInCidr(remoteIp, range));
  if (!isAllowed) {
    logger.warn('Webhook rejected: IP not in allowlist', { ip: remoteIp });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
};

/**
 * Derives the customer email from the retrieved session, falling back to the
 * raw event session. Embedded checkout may not populate customer_details on
 * the retrieved session, so we check both objects.
 */
const resolveCustomerEmail = (
  retrievedSession: Stripe.Checkout.Session,
  rawSession: Stripe.Checkout.Session
): string | null =>
  retrievedSession.customer_details?.email ??
  retrievedSession.customer_email ??
  rawSession.customer_details?.email ??
  rawSession.customer_email ??
  null;

/**
 * Extracts the paymentIntentId string from a checkout session's payment_intent
 * field, which may be a string ID or an expanded Stripe.PaymentIntent object.
 */
const extractPaymentIntentId = (session: Stripe.Checkout.Session): string | undefined =>
  typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

/**
 * Resolves the userId: prefers the value from Zod-validated metadata, then
 * falls back to an email-based lookup or guest-user creation.
 * Returns the resolved userId string, or undefined when no email is available.
 */
const resolveUserId = async (
  metadataUserId: string | undefined,
  customerEmail: string | null
): Promise<string | undefined> => {
  if (metadataUserId) return metadataUserId;
  if (!customerEmail) return undefined;

  const existingUser = await PurchaseRepository.findUserByEmail(customerEmail);
  if (existingUser) return existingUser.id;

  // Create a new user for first-time guest purchasers so the purchase can be
  // linked and the auto-login flow can create a session for them.
  // UserService.createGuestPurchaser handles concurrent webhook deliveries
  // racing on the unique email index (P2002) by re-fetching on conflict.
  const guest = await UserService.createGuestPurchaser(customerEmail);
  return guest.id;
};

interface UpsertPurchaseOptions {
  paymentIntentId: string;
  userId: string;
  releaseId: string;
  retrievedSession: Stripe.Checkout.Session;
  amountTotal: number;
}

/**
 * Idempotently finds or creates the purchase record, handling concurrent
 * webhook deliveries that may race on unique-constraint insertion.
 * Returns the PurchaseRecord on success, or throws if recovery fails.
 */
const upsertPurchase = async ({
  paymentIntentId,
  userId,
  releaseId,
  retrievedSession,
  amountTotal,
}: UpsertPurchaseOptions): Promise<PurchaseRecord> => {
  const byIntent = await PurchaseRepository.findByPaymentIntentId(paymentIntentId);
  if (byIntent) return byIntent;

  // Check if user already owns this release (e.g. re-purchase or test retry).
  // If so, update the session ID so the polling endpoint can find it.
  const existingForUser = await PurchaseRepository.findByUserAndRelease(userId, releaseId);
  if (existingForUser) {
    await PurchaseRepository.updateSessionId(existingForUser.id, retrievedSession.id);
    return existingForUser;
  }

  try {
    return await PurchaseRepository.create({
      userId,
      releaseId,
      amountPaid: amountTotal,
      currency: retrievedSession.currency ?? 'usd',
      stripePaymentIntentId: paymentIntentId,
      stripeSessionId: retrievedSession.id,
    });
  } catch (createError) {
    // Race condition: a concurrent webhook delivery may have created the record
    // between our pre-check and the insert. The repository translates a
    // unique-constraint violation (Prisma P2002) into a DataError with code
    // 'DUPLICATE'. Re-fetch by the most specific unique key.
    if (!(createError instanceof DataError && createError.code === 'DUPLICATE')) {
      throw createError;
    }

    const recovered =
      (await PurchaseRepository.findByPaymentIntentId(paymentIntentId)) ??
      (await PurchaseRepository.findByUserAndRelease(userId, releaseId));

    if (recovered) {
      await PurchaseRepository.updateSessionId(recovered.id, retrievedSession.id);
      return recovered;
    }

    throw createError;
  }
};

interface SendConfirmationOptions {
  purchase: PurchaseRecord;
  customerEmail: string | null;
  userId: string;
  releaseId: string;
  releaseTitle: string;
  amountTotal: number;
  checkoutId: string;
}

/**
 * Sends the purchase confirmation email. Falls back to the DB-stored user
 * email when the Stripe session has no customer email (embedded checkout).
 */
const sendConfirmationEmail = async ({
  purchase,
  customerEmail,
  userId,
  releaseId,
  releaseTitle,
  amountTotal,
  checkoutId,
}: SendConfirmationOptions): Promise<void> => {
  let emailForConfirmation = customerEmail;
  if (!emailForConfirmation) {
    emailForConfirmation = await UserService.findEmailById(userId);
  }

  if (!emailForConfirmation) {
    logger.error('release_purchase webhook: no email available for confirmation', undefined, {
      checkoutId,
      purchaseId: purchase.id,
      userId,
    });
    return;
  }

  const emailSent = await sendPurchaseConfirmationEmail({
    purchaseId: purchase.id,
    customerEmail: emailForConfirmation,
    releaseTitle,
    amountPaidCents: amountTotal,
    releaseId,
  });
  if (!emailSent) {
    logger.warn('release_purchase webhook: sendPurchaseConfirmationEmail returned false', {
      purchaseId: purchase.id,
      customerEmail: emailForConfirmation,
    });
  }
};

export async function POST(request: NextRequest) {
  // In production, Stripe webhooks are handled by the AWS Lambda.
  // This route is only active in development for local stripe listen testing.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ipResult = checkIpAllowlist(request);
  if (ipResult) return ipResult;

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.warn('Webhook signature verification failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        break;
    }
  } catch (error) {
    logger.error('Webhook handler failed', error, { eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  logger.info('Webhook processed', { eventType: event.type, eventId: event.id });
  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Only payment-mode release purchases are handled.
  if (session.mode === 'payment' && session.metadata?.type === 'release_purchase') {
    await handleReleasePurchaseCompleted(session);
  }
}

async function handleReleasePurchaseCompleted(session: Stripe.Checkout.Session) {
  // Always retrieve the full session — webhook payload may have payment_intent: null.
  // If retrieve throws, the outer try-catch in POST() returns 500.
  const retrievedSession = await stripe.checkout.sessions.retrieve(session.id);

  // Security: validate webhook metadata with Zod before using in queries
  const metadataResult = releaseMetadataSchema.safeParse(retrievedSession.metadata);
  if (!metadataResult.success) {
    logger.error('release_purchase webhook has invalid metadata', undefined, {
      checkoutId: retrievedSession.id,
      metadata: retrievedSession.metadata ?? undefined,
      issues: metadataResult.error.issues,
    });
    return;
  }
  const { releaseId, userId: metadataUserId } = metadataResult.data;

  const customerEmail = resolveCustomerEmail(retrievedSession, session);
  const paymentIntentId = extractPaymentIntentId(retrievedSession);

  if (!releaseId || !paymentIntentId) {
    logger.error('release_purchase webhook missing required metadata', undefined, {
      checkoutId: retrievedSession.id,
      releaseId,
      paymentIntentId,
    });
    return;
  }

  const userId = await resolveUserId(metadataUserId, customerEmail);

  if (!userId) {
    logger.error(
      'release_purchase webhook: could not resolve userId (no email available)',
      undefined,
      { checkoutId: retrievedSession.id, releaseId }
    );
    return;
  }

  const amountTotal = retrievedSession.amount_total ?? 0;

  // Look up existing purchase — first by paymentIntentId (duplicate webhook),
  // then by userId+releaseId (re-purchase of same release). Pre-checking avoids
  // P2002 unique constraint violations which are unreliable under Turbopack
  // (instanceof PrismaClientKnownRequestError can fail across module contexts).
  const purchase = await upsertPurchase({
    paymentIntentId,
    userId,
    releaseId,
    retrievedSession,
    amountTotal,
  });

  // Fetch release title for the confirmation email
  const release = await ReleaseService.findTitleById(releaseId);
  const releaseTitle = release?.title ?? 'Unknown Release';

  await sendConfirmationEmail({
    purchase,
    customerEmail,
    userId,
    releaseId,
    releaseTitle,
    amountTotal,
    checkoutId: retrievedSession.id,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) {
    logger.error('charge.refunded missing payment_intent', undefined, { chargeId: charge.id });
    return;
  }

  const marked = await PurchaseRepository.markRefunded(paymentIntentId);
  if (marked) {
    logger.info('charge.refunded: purchase marked as refunded', { paymentIntentId });
  } else {
    logger.warn('charge.refunded: no matching un-refunded purchase found', { paymentIntentId });
  }
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
    /* v8 ignore start -- `cidr.split('/')` always yields a defined first element, so the `?? ''` fallback is unreachable */
    const rangeNum = ipToNum(range ?? '');
    /* v8 ignore stop */
    if (ipNum === null || rangeNum === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
    /* v8 ignore start -- defensive: the operations above (split, regex, parseInt, bitwise) cannot throw, so this catch is unreachable */
  } catch {
    return false;
  }
  /* v8 ignore stop */
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
