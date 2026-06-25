/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { generateUsername } from 'unique-username-generator';
import { z } from 'zod';

import { sendPurchaseConfirmationEmail } from '../email/send-purchase-confirmation.js';
import { getPrisma } from '../lib/prisma.js';
import { getStripe } from '../lib/stripe.js';

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

/** A persisted release purchase record, as returned by the Prisma client. */
type ReleasePurchaseRecord = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getPrisma>['releasePurchase']['findUnique']>>
>;

interface ResolveUserIdArgs {
  metadataUserId: string | undefined;
  customerEmail: string | null;
  sessionId: string;
  releaseId: string;
}

interface ResolveOrCreatePurchaseArgs {
  userId: string;
  releaseId: string;
  amountTotal: number;
  currency: string;
  paymentIntentId: string;
  sessionId: string;
}

export const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
): Promise<void> => {
  // Only payment-mode release purchases are handled.
  if (session.mode !== 'payment' || session.metadata?.type !== 'release_purchase') {
    return;
  }
  await handleReleasePurchaseCompleted(session);
};

/**
 * Validate webhook metadata with Zod before using it in queries. Returns the
 * parsed metadata, or `null` (after logging) when validation fails.
 */
const parseReleaseMetadata = (
  retrievedSession: Stripe.Checkout.Session
): { releaseId: string; metadataUserId: string | undefined } | null => {
  const metadataResult = releaseMetadataSchema.safeParse(retrievedSession.metadata);
  if (!metadataResult.success) {
    console.error('release_purchase webhook has invalid metadata', {
      sessionId: retrievedSession.id,
      metadata: retrievedSession.metadata,
      errors: metadataResult.error.issues,
    });
    return null;
  }
  return { releaseId: metadataResult.data.releaseId, metadataUserId: metadataResult.data.userId };
};

/**
 * Derive customerEmail — check both the raw event session and the retrieved
 * session because embedded checkout (ui_mode: 'elements') may not populate
 * customer_details on the retrieved session.
 */
const deriveCustomerEmail = (
  retrievedSession: Stripe.Checkout.Session,
  session: Stripe.Checkout.Session
): string | null =>
  retrievedSession.customer_details?.email ??
  retrievedSession.customer_email ??
  session.customer_details?.email ??
  session.customer_email ??
  null;

const extractPaymentIntentId = (retrievedSession: Stripe.Checkout.Session): string | undefined =>
  typeof retrievedSession.payment_intent === 'string'
    ? retrievedSession.payment_intent
    : retrievedSession.payment_intent?.id;

/**
 * Create a new user for a first-time guest purchaser. Guards against concurrent
 * webhook deliveries racing on the unique email index (P2002) by re-fetching
 * the user if creation fails. Returns the resolved userId, or `undefined` when
 * the user can neither be created nor found.
 */
const createGuestUser = async (
  customerEmail: string,
  sessionId: string
): Promise<string | undefined> => {
  const placeholderUsername = generateUsername('', 0, 15);
  try {
    const newUser = await getPrisma().user.create({
      data: {
        email: customerEmail,
        emailVerified: new Date(),
        username: placeholderUsername,
      },
    });
    return newUser.id;
  } catch (createError) {
    if (!(createError instanceof PrismaClientKnownRequestError) || createError.code !== 'P2002') {
      throw createError;
    }
    const racedUser = await getPrisma().user.findUnique({
      where: { email: customerEmail },
      select: { id: true },
    });
    if (racedUser) {
      return racedUser.id;
    }
    console.error('release_purchase webhook: P2002 race — user not found on re-fetch', {
      sessionId,
      email: customerEmail,
    });
    return undefined;
  }
};

/**
 * Resolve userId: prefer metadata, fall back to email lookup for guest
 * purchases (creating a user when none exists). Returns the resolved userId, or
 * `undefined` (after logging) when it cannot be determined.
 */
const resolveUserId = async ({
  metadataUserId,
  customerEmail,
  sessionId,
  releaseId,
}: ResolveUserIdArgs): Promise<string | undefined> => {
  if (metadataUserId) {
    return metadataUserId;
  }

  let userId: string | undefined;
  if (customerEmail) {
    const existingUser = await getPrisma().user.findUnique({
      where: { email: customerEmail },
      select: { id: true },
    });
    userId = existingUser ? existingUser.id : await createGuestUser(customerEmail, sessionId);
  }

  if (!userId) {
    console.error('release_purchase webhook: could not resolve userId (no email available)', {
      sessionId,
      releaseId,
    });
  }
  return userId;
};

/**
 * Find an existing un-refunded purchase of this release by the user (e.g.
 * re-purchase or test retry) and, when found, update its session ID so the
 * polling endpoint can find it. Returns the existing purchase, or `null`.
 */
const attachExistingPurchase = async (
  userId: string,
  releaseId: string,
  sessionId: string
): Promise<ReleasePurchaseRecord | null> => {
  const existingForUser = await getPrisma().releasePurchase.findFirst({
    where: {
      userId,
      releaseId,
      OR: [{ refundedAt: null }, { refundedAt: { isSet: false } }],
    },
  });
  if (!existingForUser) {
    return null;
  }
  await getPrisma().releasePurchase.update({
    where: { id: existingForUser.id },
    data: { stripeSessionId: sessionId },
  });
  return existingForUser;
};

/**
 * Recover from a P2002 race where a concurrent webhook delivery created the
 * record between our pre-check and the insert. Returns the raced-in purchase
 * (with its session ID refreshed), or `null` when none is found.
 */
const recoverRacedPurchase = async ({
  userId,
  releaseId,
  paymentIntentId,
  sessionId,
}: Pick<
  ResolveOrCreatePurchaseArgs,
  'userId' | 'releaseId' | 'paymentIntentId' | 'sessionId'
>): Promise<ReleasePurchaseRecord | null> => {
  const purchase =
    (await getPrisma().releasePurchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    })) ??
    (await getPrisma().releasePurchase.findFirst({
      where: { userId, releaseId, refundedAt: null },
    }));

  if (purchase) {
    await getPrisma().releasePurchase.update({
      where: { id: purchase.id },
      data: { stripeSessionId: sessionId },
    });
  }
  return purchase;
};

/**
 * Create the purchase record, recovering from a concurrent-delivery P2002 race.
 * Re-throws any other creation error, and re-throws P2002 when no record can be
 * found on recovery.
 */
const createPurchase = async (
  args: ResolveOrCreatePurchaseArgs
): Promise<ReleasePurchaseRecord> => {
  const { userId, releaseId, amountTotal, currency, paymentIntentId, sessionId } = args;
  try {
    return await getPrisma().releasePurchase.create({
      data: {
        userId,
        releaseId,
        amountPaid: amountTotal,
        currency,
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: sessionId,
        confirmationEmailSentAt: null,
        refundedAt: null,
      },
    });
  } catch (createError) {
    if (!(createError instanceof PrismaClientKnownRequestError) || createError.code !== 'P2002') {
      throw createError;
    }
    const purchase = await recoverRacedPurchase({ userId, releaseId, paymentIntentId, sessionId });
    if (!purchase) {
      throw createError;
    }
    return purchase;
  }
};

/**
 * Look up an existing purchase — first by paymentIntentId (duplicate webhook),
 * then by userId+releaseId (re-purchase of same release) — otherwise create one.
 * Pre-checking avoids P2002 unique constraint violations for the common case.
 */
const resolveOrCreatePurchase = async (
  args: ResolveOrCreatePurchaseArgs
): Promise<ReleasePurchaseRecord> => {
  const { userId, releaseId, paymentIntentId, sessionId } = args;

  const byPaymentIntent = await getPrisma().releasePurchase.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (byPaymentIntent) {
    return byPaymentIntent;
  }

  const existing = await attachExistingPurchase(userId, releaseId, sessionId);
  if (existing) {
    return existing;
  }

  return createPurchase(args);
};

/**
 * Resolve the email address for the confirmation, falling back to the user
 * record when the session carried no email. Returns the email or `null`.
 */
const resolveConfirmationEmail = async (
  customerEmail: string | null,
  userId: string
): Promise<string | null> => {
  if (customerEmail) {
    return customerEmail;
  }
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
};

/** Fetch the release title for the confirmation email, defaulting when absent. */
const fetchReleaseTitle = async (releaseId: string): Promise<string> => {
  const release = await getPrisma().release.findFirst({
    where: { id: releaseId },
    select: { title: true },
  });
  return release?.title ?? 'Unknown Release';
};

interface DispatchConfirmationEmailArgs {
  purchaseId: string;
  customerEmail: string;
  releaseTitle: string;
  amountPaidCents: number;
  releaseId: string;
}

/** Send the purchase confirmation email, warning when delivery reports failure. */
const dispatchConfirmationEmail = async ({
  purchaseId,
  customerEmail,
  releaseTitle,
  amountPaidCents,
  releaseId,
}: DispatchConfirmationEmailArgs): Promise<void> => {
  const emailSent = await sendPurchaseConfirmationEmail({
    purchaseId,
    customerEmail,
    releaseTitle,
    amountPaidCents,
    releaseId,
  });
  if (!emailSent) {
    console.warn('release_purchase webhook: sendPurchaseConfirmationEmail returned false', {
      purchaseId,
      customerEmail,
    });
  }
};

const handleReleasePurchaseCompleted = async (session: Stripe.Checkout.Session): Promise<void> => {
  // Always retrieve the full session — webhook payload may have payment_intent: null.
  const retrievedSession = await getStripe().checkout.sessions.retrieve(session.id);

  // Security: validate webhook metadata with Zod before using in queries
  const metadata = parseReleaseMetadata(retrievedSession);
  if (!metadata) {
    return;
  }
  const { releaseId, metadataUserId } = metadata;

  const customerEmail = deriveCustomerEmail(retrievedSession, session);
  const paymentIntentId = extractPaymentIntentId(retrievedSession);

  if (!releaseId || !paymentIntentId) {
    console.error('release_purchase webhook missing required metadata', {
      sessionId: retrievedSession.id,
      releaseId,
      paymentIntentId,
    });
    return;
  }

  const userId = await resolveUserId({
    metadataUserId,
    customerEmail,
    sessionId: retrievedSession.id,
    releaseId,
  });
  if (!userId) {
    return;
  }

  const amountTotal = retrievedSession.amount_total ?? 0;

  const purchase = await resolveOrCreatePurchase({
    userId,
    releaseId,
    amountTotal,
    currency: retrievedSession.currency ?? 'usd',
    paymentIntentId,
    sessionId: retrievedSession.id,
  });

  const releaseTitle = await fetchReleaseTitle(releaseId);

  const emailForConfirmation = await resolveConfirmationEmail(customerEmail, userId);
  if (!emailForConfirmation) {
    console.error('release_purchase webhook: no email available for confirmation', {
      sessionId: retrievedSession.id,
      purchaseId: purchase.id,
      userId,
    });
    return;
  }

  await dispatchConfirmationEmail({
    purchaseId: purchase.id,
    customerEmail: emailForConfirmation,
    releaseTitle,
    amountPaidCents: amountTotal,
    releaseId,
  });
};
